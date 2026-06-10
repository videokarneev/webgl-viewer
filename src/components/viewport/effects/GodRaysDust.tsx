import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  getGodRaysDirectionWorldFromLocal,
  normalizeGodRaysDirection,
  useEditorStore,
  type GodRaysBoxState,
} from '../../../store/editorStore'
import {
  createSeededRandom,
  getGodRaysVisualBoundaryRadius,
  getGodRaysMaxRadius,
  getGodRaysPolygonOffset,
  samplePointInGodRaysVolume,
} from './godRaysShared'

const vertexShader = `
attribute float aSize;
attribute float aSeed;
attribute float aPhase;

uniform float uTime;
uniform vec3 uDirection;
uniform float uSpeed;
uniform float uDrift;
uniform float uStrength;
uniform float uEdgeFade;
uniform float uBottomRadius;
uniform float uTopRadius;
uniform float uSideCount;
uniform float uPolygonOffset;
uniform vec3 uColor;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform mat4 uWorldToLocal;

varying float vAlpha;

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

float edgeFactor(vec3 position, float fadeWidth) {
  float safeFade = max(fadeWidth, 0.0001);
  float angle = atan(position.z, position.x);
  float radius = radiusAt(position.y);
  float polygonRadius = polygonBoundaryRadius(angle, radius, uSideCount, uPolygonOffset);
  float radialBoundary = mix(polygonRadius, radius, visualRoundness(uSideCount));
  float radialDistance = radialBoundary - length(position.xz);
  float verticalDistance = min(position.y, 1.0 - position.y);
  float nearestEdge = min(radialDistance, verticalDistance);
  return smoothstep(0.0, safeFade, nearestEdge);
}

void main() {
  vec3 animatedPosition = position;
  vec3 localPosition = (uWorldToLocal * vec4(animatedPosition, 1.0)).xyz;
  float strength = pow(clamp(uStrength, 0.0, 1.0), 0.9);
  vAlpha = edgeFactor(localPosition, uEdgeFade) * strength;

  vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(1.0, aSize * 180.0 / max(-mvPosition.z, 0.001));
}
`

const fragmentShader = `
varying float vAlpha;
uniform vec3 uColor;
uniform float uStrength;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float dist = dot(centered, centered);
  if (dist > 0.25) {
    discard;
  }

  float feather = smoothstep(0.25, 0.0, dist);
  float alpha = vAlpha * feather;
  float strength = clamp(uStrength, 0.0, 1.0);
  float intensity = pow(strength, 0.85);
  float bleach = smoothstep(0.72, 1.0, strength) * 0.35;
  vec3 color = mix(uColor * intensity, vec3(1.0), bleach);
  alpha *= mix(1.0, 1.12, bleach);
  if (alpha <= 0.0005) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`

export function GodRaysDust({ entry, disableRaycast = false }: { entry: GodRaysBoxState; disableRaycast?: boolean }) {
  const pointsRef = useRef<THREE.Points | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const objectState = useEditorStore((state) => state.objects[entry.id] ?? null)
  const runtimeObject = useEditorStore((state) => state.runtime.objectById[entry.id] ?? null)
  const godRaysGlobalDirection = useEditorStore((state) => state.godRaysGlobalDirection)
  const maxRadius = getGodRaysMaxRadius(entry)
  const localToWorldMatrix = useMemo(() => {
    const position = new THREE.Vector3(...(objectState?.position ?? [0, 0, 0]))
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(objectState?.rotation ?? [0, 0, 0]), 'XYZ'),
    )
    const scale = new THREE.Vector3(...(objectState?.scale ?? [1, 1, 1]))
    return new THREE.Matrix4().compose(position, quaternion, scale)
  }, [objectState])
  const dustAnchorMatrix = useMemo(() => {
    const position = new THREE.Vector3(...(objectState?.position ?? [0, 0, 0]))
    const scale = new THREE.Vector3(...(objectState?.scale ?? [1, 1, 1]))
    return new THREE.Matrix4().compose(position, new THREE.Quaternion(), scale)
  }, [objectState?.position, objectState?.scale])
  const worldToLocalMatrix = useMemo(() => localToWorldMatrix.clone().invert(), [localToWorldMatrix])
  const worldBounds = useMemo(() => {
    const corners = [
      new THREE.Vector3(-maxRadius, 0, -maxRadius),
      new THREE.Vector3(maxRadius, 0, -maxRadius),
      new THREE.Vector3(maxRadius, 0, maxRadius),
      new THREE.Vector3(-maxRadius, 0, maxRadius),
      new THREE.Vector3(-maxRadius, 1, -maxRadius),
      new THREE.Vector3(maxRadius, 1, -maxRadius),
      new THREE.Vector3(maxRadius, 1, maxRadius),
      new THREE.Vector3(-maxRadius, 1, maxRadius),
    ].map((point) => point.applyMatrix4(dustAnchorMatrix))
    return new THREE.Box3().setFromPoints(corners)
  }, [dustAnchorMatrix, maxRadius])
  const effectiveWorldDirection = useMemo(
    () =>
      runtimeObject
        ? (
            entry.dustDirectionMode === 'global'
              ? normalizeGodRaysDirection(godRaysGlobalDirection)
              : getGodRaysDirectionWorldFromLocal(entry.dustDirectionLocal, runtimeObject)
          )
        : (
            entry.dustDirectionMode === 'global'
              ? normalizeGodRaysDirection(godRaysGlobalDirection)
              : normalizeGodRaysDirection(entry.dustDirectionLocal)
          ),
    [entry, godRaysGlobalDirection, runtimeObject],
  )

  const updateSizeAttribute = (targetGeometry: THREE.BufferGeometry) => {
    const sizeAttribute = targetGeometry.getAttribute('aSize') as THREE.BufferAttribute | undefined
    if (!sizeAttribute) {
      return
    }

    for (let index = 0; index < sizeAttribute.count; index += 1) {
      const random = createSeededRandom(`${entry.id}:dust:${index}:size`)
      sizeAttribute.setX(index, THREE.MathUtils.lerp(entry.dustSizeMin, entry.dustSizeMax, random()))
    }
    sizeAttribute.needsUpdate = true
  }

  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(entry.dustCount * 3)
    const sizes = new Float32Array(entry.dustCount)
    const seeds = new Float32Array(entry.dustCount)
    const phases = new Float32Array(entry.dustCount)

    for (let index = 0; index < entry.dustCount; index += 1) {
      const offset = index * 3
      const random = createSeededRandom(`${entry.id}:dust:${index}`)
      const point = samplePointInGodRaysVolume(entry, random)
      point.applyMatrix4(dustAnchorMatrix)
      positions[offset] = point.x
      positions[offset + 1] = point.y
      positions[offset + 2] = point.z
      sizes[index] = THREE.MathUtils.lerp(
        entry.dustSizeMin,
        entry.dustSizeMax,
        createSeededRandom(`${entry.id}:dust:${index}:size`)(),
      )
      seeds[index] = random()
      phases[index] = random() * 6
    }

    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    nextGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    nextGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    nextGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return nextGeometry
  }, [
    entry.bottomRadius,
    entry.dustCount,
    dustAnchorMatrix,
    entry.sideCount,
    entry.topRadius,
  ])

  const streamRandomRef = useRef(createSeededRandom(`${entry.id}:dust:stream`))
  const streamScratchRef = useRef({
    worldPosition: new THREE.Vector3(),
    localPosition: new THREE.Vector3(),
    localSpawn: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    drift: new THREE.Vector3(),
  })

  useEffect(() => {
    streamRandomRef.current = createSeededRandom(`${entry.id}:dust:stream:${entry.dustCount}`)
  }, [entry.id, entry.dustCount])

  useEffect(() => {
    updateSizeAttribute(geometry)
  }, [entry.dustSizeMax, entry.dustSizeMin, geometry])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDirection: { value: new THREE.Vector3(...effectiveWorldDirection) },
      uSpeed: { value: entry.dustSpeed },
      uDrift: { value: entry.dustDrift },
      uStrength: { value: entry.dustStrength },
      uEdgeFade: { value: entry.dustEdgeFade },
      uColor: { value: new THREE.Color(entry.dustColorLinked ? entry.rayColor : entry.dustColor) },
      uBottomRadius: { value: entry.bottomRadius },
      uTopRadius: { value: entry.topRadius },
      uSideCount: { value: entry.sideCount },
      uPolygonOffset: { value: getGodRaysPolygonOffset(entry.sideCount) },
      uBoundsMin: { value: worldBounds.min.clone() },
      uBoundsMax: { value: worldBounds.max.clone() },
      uWorldToLocal: { value: worldToLocalMatrix.clone() },
    }),
    [
      entry.bottomRadius,
      effectiveWorldDirection,
      entry.dustDrift,
      entry.dustEdgeFade,
      entry.dustColor,
      entry.dustColorLinked,
      entry.dustStrength,
      entry.rayColor,
      entry.dustSpeed,
      entry.sideCount,
      entry.topRadius,
      worldBounds,
      worldToLocalMatrix,
    ],
  )

  useEffect(() => {
    const material = materialRef.current
    if (!material) {
      return
    }

    uniforms.uDirection.value.set(...effectiveWorldDirection)
    uniforms.uSpeed.value = entry.dustSpeed
    uniforms.uDrift.value = entry.dustDrift
    uniforms.uStrength.value = entry.dustStrength
    uniforms.uEdgeFade.value = entry.dustEdgeFade
    uniforms.uColor.value.set(entry.dustColorLinked ? entry.rayColor : entry.dustColor)
    uniforms.uBottomRadius.value = entry.bottomRadius
    uniforms.uTopRadius.value = entry.topRadius
    uniforms.uSideCount.value = entry.sideCount
    uniforms.uPolygonOffset.value = getGodRaysPolygonOffset(entry.sideCount)
    uniforms.uBoundsMin.value.copy(worldBounds.min)
    uniforms.uBoundsMax.value.copy(worldBounds.max)
    uniforms.uWorldToLocal.value.copy(worldToLocalMatrix)
  }, [
    entry.bottomRadius,
    effectiveWorldDirection,
    entry.dustDrift,
    entry.dustEdgeFade,
    entry.dustColor,
    entry.dustColorLinked,
    entry.dustStrength,
    entry.rayColor,
    entry.dustSpeed,
    entry.sideCount,
    entry.topRadius,
    worldBounds,
    worldToLocalMatrix,
    uniforms,
  ])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }, delta) => {
    if (pointsRef.current) {
      pointsRef.current.matrixAutoUpdate = false
      pointsRef.current.matrix.copy(worldToLocalMatrix)
      pointsRef.current.matrixWorldNeedsUpdate = true
    }

    if (!materialRef.current) {
      return
    }

    materialRef.current.uniforms.uTime.value = clock.getElapsedTime()

    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    const seedAttribute = geometry.getAttribute('aSeed') as THREE.BufferAttribute | undefined
    if (!positionAttribute || !seedAttribute) {
      return
    }

    const positions = positionAttribute.array as Float32Array
    const seeds = seedAttribute.array as Float32Array
    const scratch = streamScratchRef.current
    const elapsedTime = clock.getElapsedTime()
    const frameDelta = Math.min(delta, 1 / 20)
    const speed = Math.max(entry.dustSpeed, 0)
    const driftAmount = Math.max(entry.dustDrift, 0)

    scratch.direction.set(...effectiveWorldDirection).normalize()

    for (let index = 0; index < positionAttribute.count; index += 1) {
      const offset = index * 3
      const seed = seeds[index]
      scratch.worldPosition.set(positions[offset], positions[offset + 1], positions[offset + 2])

      if (speed > 0.0001) {
        scratch.worldPosition.addScaledVector(scratch.direction, frameDelta * speed * 6 * (0.65 + seed * 0.75))
      }

      if (driftAmount > 0.0001) {
        scratch.drift.set(
          Math.sin(elapsedTime * (0.7 + seed * 0.4) + seed * 11),
          Math.cos(elapsedTime * (0.5 + seed * 0.3) + seed * 19),
          Math.sin(elapsedTime * (0.9 + seed * 0.2) + seed * 7),
        )
        scratch.worldPosition.addScaledVector(scratch.drift, frameDelta * driftAmount * 0.7)
      }

      scratch.localPosition.copy(scratch.worldPosition).applyMatrix4(worldToLocalMatrix)
      const angle = Math.atan2(scratch.localPosition.z, scratch.localPosition.x)
      const radiusAtY = THREE.MathUtils.lerp(
        entry.bottomRadius,
        entry.topRadius,
        THREE.MathUtils.clamp(scratch.localPosition.y, 0, 1),
      )
      const boundaryRadius = getGodRaysVisualBoundaryRadius(angle, radiusAtY, entry.sideCount)
      const insideVolume =
        scratch.localPosition.y >= 0 &&
        scratch.localPosition.y <= 1 &&
        Math.hypot(scratch.localPosition.x, scratch.localPosition.z) <= boundaryRadius

      if (!insideVolume) {
        const nextRandom = streamRandomRef.current
        scratch.localSpawn.copy(samplePointInGodRaysVolume(entry, nextRandom)).applyMatrix4(localToWorldMatrix)
        scratch.worldPosition.copy(scratch.localSpawn)
      }

      positions[offset] = scratch.worldPosition.x
      positions[offset + 1] = scratch.worldPosition.y
      positions[offset + 2] = scratch.worldPosition.z
    }

    positionAttribute.needsUpdate = true
  })

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      renderOrder={3}
      frustumCulled={false}
      raycast={disableRaycast ? () => null : undefined}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
