import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore, type GodRaysBoxState } from '../../../store/editorStore'
import {
  getGodRaysMaxRadius,
  getGodRaysPolygonOffset,
  getGodRaysSteps,
  getSourceFaceVector,
} from './godRaysShared'

const vertexShader = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

void main() {
  vLocalPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const fragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
uniform float uEdgeFade;
uniform float uNoiseAmount;
uniform float uNoiseScale;
uniform float uGrain;
uniform float uAnimatedNoiseOffsetX;
uniform float uAnimatedNoiseOffsetZ;
uniform float uSteps;
uniform float uNoiseMotionMode;
uniform float uNoiseMotionSpeed;
uniform float uBottomRadius;
uniform float uTopRadius;
uniform float uSideCount;
uniform float uPolygonOffset;
uniform float uTopDome;
uniform vec3 uCameraLocal;
uniform vec3 uSourceFace;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform mat4 uLocalToWorld;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

vec2 rayBoxIntersection(vec3 rayOrigin, vec3 rayDir, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / rayDir;
  vec3 tMin = (boxMin - rayOrigin) * invDir;
  vec3 tMax = (boxMax - rayOrigin) * invDir;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

float polygonBoundaryRadius(float angle, float radius, float sideCount, float polygonOffset) {
  float sector = 6.28318530718 / sideCount;
  float apothem = max(radius * cos(3.14159265359 / sideCount), 0.0001);
  float localAngle = mod(angle - polygonOffset, sector) - sector * 0.5;
  return apothem / max(cos(localAngle), 0.0001);
}

float visualRoundness(float sideCount) {
  return clamp((sideCount - 6.0) / 8.0, 0.0, 1.0);
}

float radiusAt(float y) {
  return mix(uBottomRadius, uTopRadius, clamp(y, 0.0, 1.0));
}

float polygonEdgeDistance(vec3 position) {
  float angle = atan(position.z, position.x);
  float radius = radiusAt(position.y);
  float polygonRadius = polygonBoundaryRadius(angle, radius, uSideCount, uPolygonOffset);
  float boundaryRadius = mix(polygonRadius, radius, visualRoundness(uSideCount));
  return boundaryRadius - length(position.xz);
}

bool isInsidePrism(vec3 position) {
  if (position.y < 0.0 || position.y > 1.0) {
    return false;
  }
  return polygonEdgeDistance(position) >= 0.0;
}

float sourceFactor(vec3 position, vec3 face) {
  vec3 size = max(uBoundsMax - uBoundsMin, vec3(0.0001));
  if (face.x > 0.5) {
    return (uBoundsMax.x - position.x) / size.x;
  }
  if (face.x < -0.5) {
    return (position.x - uBoundsMin.x) / size.x;
  }
  if (face.y > 0.5) {
    return (uBoundsMax.y - position.y) / size.y;
  }
  if (face.y < -0.5) {
    return (position.y - uBoundsMin.y) / size.y;
  }
  if (face.z > 0.5) {
    return (uBoundsMax.z - position.z) / size.z;
  }
  return (position.z - uBoundsMin.z) / size.z;
}

float edgeFactor(vec3 position, float fadeWidth) {
  float safeFade = max(fadeWidth, 0.0001);
  float radialDistance = polygonEdgeDistance(position);
  float verticalDistance = min(position.y, 1.0 - position.y);
  float nearestEdge = min(radialDistance, verticalDistance);
  return smoothstep(0.0, safeFade, nearestEdge);
}

float topDomeFactor(vec3 position) {
  if (uTopDome <= 0.0001) {
    return 1.0;
  }

  float domeStrength = clamp(uTopDome / 10.0, 0.0, 1.0);
  float topRadius = max(radiusAt(1.0), 0.0001);
  float domeDepth = mix(0.0, clamp(topRadius * 0.12, 0.05, 0.18), domeStrength);
  float domeStart = 1.0 - domeDepth;

  if (position.y <= domeStart) {
    return 1.0;
  }

  float localY = clamp((position.y - domeStart) / max(domeDepth, 0.0001), 0.0, 1.0);
  float currentRadius = max(radiusAt(position.y), 0.0001);
  float normalizedRadius = clamp(length(position.xz) / currentRadius, 0.0, 1.0);
  float hemisphereProfile = sqrt(max(1.0 - normalizedRadius * normalizedRadius, 0.0));
  float feather = mix(0.16, 0.28, domeStrength);
  feather *= mix(1.0, 1.25, normalizedRadius);
  return 1.0 - smoothstep(hemisphereProfile - feather, hemisphereProfile + feather * 0.3, localY);
}

float sampledNoise(vec3 worldSamplePoint, float jitter) {
  vec3 noisePoint = worldSamplePoint * uNoiseScale + vec3(
    uAnimatedNoiseOffsetX,
    0.0,
    uAnimatedNoiseOffsetZ + jitter * mix(0.0, 3.0, uGrain)
  );
  return noise3d(noisePoint);
}

void main() {
  vec3 rayDir = normalize(vLocalPosition - uCameraLocal);
  vec2 hit = rayBoxIntersection(uCameraLocal, rayDir, uBoundsMin, uBoundsMax);

  if (hit.x > hit.y) {
    discard;
  }

  float tNear = max(hit.x, 0.0);
  float tFar = hit.y;
  if (tFar <= 0.0) {
    discard;
  }

  float steps = max(uSteps, 1.0);
  float distanceStep = max((tFar - tNear) / steps, 0.0001);
  float accumulation = 0.0;
  float transmittance = 1.0;
  float jitter = hash(vec3(gl_FragCoord.xy * 0.123, dot(rayDir, vec3(3.1, 5.7, 7.9)))) * uGrain;

  for (float i = 0.0; i < 64.0; i += 1.0) {
    if (i >= steps) {
      break;
    }

    float t = tNear + (i + jitter) * distanceStep;
    vec3 samplePoint = uCameraLocal + rayDir * t;
    if (!isInsidePrism(samplePoint)) {
      continue;
    }

    float source = clamp(sourceFactor(samplePoint, uSourceFace), 0.0, 1.0);
    float depthFade = pow(max(1.0 - source, 0.0), max(uFalloff, 0.0001));
    float shapeFade = edgeFactor(samplePoint, max(uEdgeFade, 0.001));
    float domeFade = topDomeFactor(samplePoint);
    vec3 worldSamplePoint = (uLocalToWorld * vec4(samplePoint, 1.0)).xyz;
    float noise = mix(1.0, sampledNoise(worldSamplePoint, jitter), uNoiseAmount);
    float density = depthFade * shapeFade * domeFade * noise;
    float sampleAlpha = clamp(density * distanceStep * 1.6, 0.0, 1.0);
    accumulation += sampleAlpha * transmittance;
    transmittance *= (1.0 - sampleAlpha);
    if (transmittance <= 0.01) {
      break;
    }
  }

  float alpha = clamp(accumulation * uIntensity * 0.9, 0.0, 1.0);
  if (alpha <= 0.0005) {
    discard;
  }

  gl_FragColor = vec4(uColor, alpha);
}
`

export function GodRaysVolume({ entry, disableRaycast = false }: { entry: GodRaysBoxState; disableRaycast?: boolean }) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const godRaysGlobalNoise = useEditorStore((state) => state.godRaysGlobalNoise)
  const cameraLocal = useMemo(() => new THREE.Vector3(), [])
  const animatedNoiseOffsetRef = useRef(new THREE.Vector2(0, 0))
  const geometry = useMemo(() => {
    const maxRadius = getGodRaysMaxRadius(entry)
    const nextGeometry = new THREE.BoxGeometry(maxRadius * 2, 1, maxRadius * 2)
    nextGeometry.translate(0, 0.5, 0)
    return nextGeometry
  }, [entry.bottomRadius, entry.topRadius])
  const sourceFace = useMemo(() => getSourceFaceVector(entry.sourceFace), [entry.sourceFace])
  const maxRadius = getGodRaysMaxRadius(entry)
  const effectiveNoise = entry.rayUseGlobalNoiseSettings
    ? godRaysGlobalNoise
    : {
        rayNoiseAmount: entry.rayNoiseAmount,
        rayNoiseScale: entry.rayNoiseScale,
        rayGrain: entry.rayGrain,
        rayNoiseMotionMode: entry.rayNoiseMotionMode,
        rayNoiseMotionSpeed: entry.rayNoiseMotionSpeed,
        rayQuality: entry.rayQuality,
      }

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(entry.rayColor) },
      uIntensity: { value: entry.rayIntensity },
      uFalloff: { value: entry.rayFalloff },
      uEdgeFade: { value: entry.rayEdgeFade },
      uNoiseAmount: { value: effectiveNoise.rayNoiseAmount },
      uNoiseScale: { value: effectiveNoise.rayNoiseScale },
      uGrain: { value: effectiveNoise.rayGrain },
      uAnimatedNoiseOffsetX: { value: 0 },
      uAnimatedNoiseOffsetZ: { value: 0 },
      uSteps: { value: getGodRaysSteps(effectiveNoise.rayQuality) },
      uNoiseMotionMode: { value: effectiveNoise.rayNoiseMotionMode === 'soft' ? 1 : 0 },
      uNoiseMotionSpeed: { value: effectiveNoise.rayNoiseMotionSpeed },
      uBottomRadius: { value: entry.bottomRadius },
      uTopRadius: { value: entry.topRadius },
      uSideCount: { value: entry.sideCount },
      uPolygonOffset: { value: getGodRaysPolygonOffset(entry.sideCount) },
      uTopDome: { value: entry.topDome },
      uCameraLocal: { value: new THREE.Vector3() },
      uSourceFace: { value: sourceFace.clone() },
      uBoundsMin: { value: new THREE.Vector3(-maxRadius, 0, -maxRadius) },
      uBoundsMax: { value: new THREE.Vector3(maxRadius, 1, maxRadius) },
      uLocalToWorld: { value: new THREE.Matrix4() },
    }),
    [
      entry.bottomRadius,
      effectiveNoise.rayGrain,
      effectiveNoise.rayNoiseAmount,
      effectiveNoise.rayNoiseMotionMode,
      effectiveNoise.rayNoiseMotionSpeed,
      effectiveNoise.rayNoiseScale,
      effectiveNoise.rayQuality,
      entry.rayColor,
      entry.rayEdgeFade,
      entry.rayFalloff,
      entry.rayIntensity,
      entry.sideCount,
      entry.topDome,
      entry.topRadius,
      maxRadius,
      sourceFace,
    ],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const material = materialRef.current
    if (!material) {
      return
    }

    uniforms.uColor.value.set(entry.rayColor)
    uniforms.uIntensity.value = entry.rayIntensity
    uniforms.uFalloff.value = entry.rayFalloff
    uniforms.uEdgeFade.value = entry.rayEdgeFade
    uniforms.uNoiseAmount.value = effectiveNoise.rayNoiseAmount
    uniforms.uNoiseScale.value = effectiveNoise.rayNoiseScale
    uniforms.uGrain.value = effectiveNoise.rayGrain
    if (effectiveNoise.rayNoiseMotionMode !== 'soft') {
      animatedNoiseOffsetRef.current.set(0, 0)
      uniforms.uAnimatedNoiseOffsetX.value = 0
      uniforms.uAnimatedNoiseOffsetZ.value = 0
    }
    uniforms.uSteps.value = getGodRaysSteps(effectiveNoise.rayQuality)
    uniforms.uNoiseMotionMode.value = effectiveNoise.rayNoiseMotionMode === 'soft' ? 1 : 0
    uniforms.uNoiseMotionSpeed.value = effectiveNoise.rayNoiseMotionSpeed
    uniforms.uBottomRadius.value = entry.bottomRadius
    uniforms.uTopRadius.value = entry.topRadius
    uniforms.uSideCount.value = entry.sideCount
    uniforms.uPolygonOffset.value = getGodRaysPolygonOffset(entry.sideCount)
    uniforms.uTopDome.value = entry.topDome
    uniforms.uSourceFace.value.copy(sourceFace)
    uniforms.uBoundsMin.value.set(-maxRadius, 0, -maxRadius)
    uniforms.uBoundsMax.value.set(maxRadius, 1, maxRadius)
  }, [
    entry.bottomRadius,
    effectiveNoise.rayGrain,
    effectiveNoise.rayNoiseAmount,
    effectiveNoise.rayNoiseMotionMode,
    effectiveNoise.rayNoiseMotionSpeed,
    effectiveNoise.rayNoiseScale,
    effectiveNoise.rayQuality,
    entry.rayColor,
    entry.rayEdgeFade,
    entry.rayFalloff,
    entry.rayIntensity,
    entry.sideCount,
    entry.topDome,
    entry.topRadius,
    maxRadius,
    sourceFace,
    uniforms,
  ])

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) {
      return
    }

    cameraLocal.copy(camera.position)
    mesh.worldToLocal(cameraLocal)
    material.uniforms.uCameraLocal.value.copy(cameraLocal)
    material.uniforms.uLocalToWorld.value.copy(mesh.matrixWorld)

    if (effectiveNoise.rayNoiseMotionMode === 'soft' && effectiveNoise.rayNoiseMotionSpeed > 0) {
      animatedNoiseOffsetRef.current.x += delta * effectiveNoise.rayNoiseMotionSpeed * 1.15
      animatedNoiseOffsetRef.current.y += delta * effectiveNoise.rayNoiseMotionSpeed * 0.68
    }

    material.uniforms.uAnimatedNoiseOffsetX.value = animatedNoiseOffsetRef.current.x
    material.uniforms.uAnimatedNoiseOffsetZ.value = animatedNoiseOffsetRef.current.y
  })

  return (
    <mesh ref={meshRef} geometry={geometry} renderOrder={2} raycast={disableRaycast ? () => null : undefined}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}
