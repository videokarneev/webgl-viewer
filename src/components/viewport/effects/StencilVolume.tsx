import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  getGodRaysDirectionWorldFromLocal,
  getStencilVolumeEndHandleId,
  normalizeGodRaysDirection,
  type GodRaysQuality,
  type StencilVolumeState,
  useEditorStore,
} from '../../../store/editorStore'
import {
  createShapeDistanceField,
  extractMaskContour,
  type MaskContourResult,
  type MaskContourShape,
  type MaskDistanceFieldResult,
} from '../../../features/stencilVolume/maskContour'
import { createSeededRandom, getGodRaysSteps } from './godRaysShared'

function getStencilNoiseQualityLevel(quality: GodRaysQuality) {
  if (quality === 'high') {
    return 2
  }
  if (quality === 'medium') {
    return 1
  }
  return 0
}

function getStencilFillSteps(quality: GodRaysQuality, fillQuality: number, primitiveCount = 1) {
  const baseSteps = getGodRaysSteps(quality)
  const multiplier = THREE.MathUtils.lerp(0.65, 2.1, THREE.MathUtils.clamp(fillQuality, 0, 1))
  const primitivePenalty = THREE.MathUtils.lerp(
    1,
    0.82,
    THREE.MathUtils.clamp((primitiveCount - 1) / 10, 0, 1),
  )
  return Math.max(Math.round(baseSteps * multiplier * primitivePenalty), 8)
}

function getStencilEffectiveDustCount(requestedDustCount: number, primitiveCount: number) {
  const penalty = THREE.MathUtils.lerp(
    1,
    0.42,
    THREE.MathUtils.clamp((primitiveCount - 1) / 9, 0, 1),
  )
  return Math.max(0, Math.round(requestedDustCount * penalty))
}

const volumeWallVertexShader = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

void main() {
  vLocalPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const volumeWallFragmentShader = `
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
uniform float uEdgeFade;
uniform float uTime;
uniform float uNoiseAmount;
uniform float uNoiseScale;
uniform float uGrain;
uniform float uAnimatedNoiseOffsetX;
uniform float uAnimatedNoiseOffsetZ;
uniform float uNoiseQuality;
uniform float uSteps;
uniform float uMaskInvert;
uniform vec2 uMaskTexelSize;
uniform vec2 uMaskUvCenter;
uniform vec2 uMaskUvHalfSize;
uniform vec2 uSourceSize;
uniform vec3 uStartCenter;
uniform vec3 uEndCenter;
uniform vec2 uEndScale;
uniform vec4 uEndQuaternion;
uniform vec3 uCameraLocal;
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

vec4 quaternionSlerpIdentity(vec4 target, float t) {
  vec4 nextTarget = target;
  if (nextTarget.w < 0.0) {
    nextTarget = -nextTarget;
  }
  float dotValue = clamp(nextTarget.w, -1.0, 1.0);
  if (dotValue > 0.9995) {
    return normalize(mix(vec4(0.0, 0.0, 0.0, 1.0), nextTarget, t));
  }
  float theta = acos(dotValue);
  float sinTheta = sin(theta);
  float weightIdentity = sin((1.0 - t) * theta) / sinTheta;
  float weightTarget = sin(t * theta) / sinTheta;
  return normalize(vec4(
    nextTarget.xyz * weightTarget,
    weightIdentity + nextTarget.w * weightTarget
  ));
}

vec3 rotateVectorByQuaternion(vec3 value, vec4 quaternion) {
  vec3 quatVector = quaternion.xyz;
  vec3 uv = cross(quatVector, value);
  vec3 uuv = cross(quatVector, uv);
  return value + 2.0 * (quaternion.w * uv + uuv);
}

float sampleSignedDistance(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return -1.0;
  }

  float sdf = texture2D(uMask, uv).r * 2.0 - 1.0;
  return uMaskInvert > 0.5 ? -sdf : sdf;
}

float crossSectionMask(vec3 position, out float beamProgress) {
  vec3 axis = uEndCenter - uStartCenter;
  float depthRange = uEndCenter.z - uStartCenter.z;
  float rawProgress = abs(depthRange) > 0.0001
    ? (position.z - uStartCenter.z) / depthRange
    : dot(position - uStartCenter, axis) / max(dot(axis, axis), 0.0001);
  if (rawProgress < 0.0 || rawProgress > 1.0) {
    beamProgress = clamp(rawProgress, 0.0, 1.0);
    return 0.0;
  }
  beamProgress = rawProgress;
  vec3 center = mix(uStartCenter, uEndCenter, beamProgress);

  vec3 startBasisX = vec3(uSourceSize.x * 0.5, 0.0, 0.0);
  vec3 startBasisY = vec3(0.0, uSourceSize.y * 0.5, 0.0);
  vec3 endBasisX = rotateVectorByQuaternion(vec3(uSourceSize.x * uEndScale.x * 0.5, 0.0, 0.0), uEndQuaternion);
  vec3 endBasisY = rotateVectorByQuaternion(vec3(0.0, uSourceSize.y * uEndScale.y * 0.5, 0.0), uEndQuaternion);
  vec3 basisX = mix(startBasisX, endBasisX, beamProgress);
  vec3 basisY = mix(startBasisY, endBasisY, beamProgress);

  vec3 localOffset = position - center;
  float gramXX = max(dot(basisX, basisX), 0.0001);
  float gramXY = dot(basisX, basisY);
  float gramYY = max(dot(basisY, basisY), 0.0001);
  float determinant = max(gramXX * gramYY - gramXY * gramXY, 0.0001);
  float projectionX = dot(localOffset, basisX);
  float projectionY = dot(localOffset, basisY);
  float localX = (projectionX * gramYY - projectionY * gramXY) / determinant;
  float localY = (projectionY * gramXX - projectionX * gramXY) / determinant;
  vec3 projectedPoint = basisX * localX + basisY * localY;
  float planeDistance = length(localOffset - projectedPoint);
  float sliceThickness = max(length(axis) / max(uSteps * 0.9, 1.0), 0.02);
  float planeMask = 1.0 - smoothstep(sliceThickness, sliceThickness * 2.2, planeDistance);
  vec2 localMask = vec2(localX, localY);
  float scaleX = length(basisX) / max(uSourceSize.x * 0.5, 0.0001);
  float scaleY = length(basisY) / max(uSourceSize.y * 0.5, 0.0001);
  float crossSectionScale = max(max(scaleX, scaleY), 0.0001);
  float edgeFadeStrength = clamp(uEdgeFade * 0.5 + uGrain * 0.32, 0.0, 1.0);
  float baseFeather = mix(0.02, 0.42, edgeFadeStrength);
  float sourceBlend = smoothstep(0.02, 0.16, beamProgress);
  vec2 uv = uMaskUvCenter + localMask * uMaskUvHalfSize;
  float sdf = sampleSignedDistance(uv);
  float feather = mix(baseFeather * 0.12, baseFeather, sourceBlend) / crossSectionScale;
  return smoothstep(-feather, feather, sdf) * planeMask;
}

float sampledNoise(vec3 worldSamplePoint, float jitter) {
  vec3 noisePoint = worldSamplePoint * uNoiseScale + vec3(
    uAnimatedNoiseOffsetX,
    jitter * mix(0.0, 3.0, uGrain),
    uAnimatedNoiseOffsetZ
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
  float jitter = hash(vec3(gl_FragCoord.xy * 0.123, dot(rayDir, vec3(3.1, 5.7, 7.9)))) * mix(0.12, 1.0, uGrain);

  for (float i = 0.0; i < 64.0; i += 1.0) {
    if (i >= steps) {
      break;
    }

    float t = tNear + (i + jitter) * distanceStep;
    vec3 samplePoint = uCameraLocal + rayDir * t;
    float beamProgress = 0.0;
    float mask = crossSectionMask(samplePoint, beamProgress);
    if (mask <= 0.0005) {
      continue;
    }

    float progressFade = pow(max(1.0 - beamProgress, 0.0), max(uFalloff, 0.0001));
    float shapeFade = smoothstep(0.04, 0.68, mask);
    vec3 worldSamplePoint = (uLocalToWorld * vec4(samplePoint, 1.0)).xyz;
    float noise = sampledNoise(worldSamplePoint, jitter);
    if (uNoiseQuality > 0.5) {
      noise = mix(
        noise,
        sampledNoise(worldSamplePoint * 1.7 + vec3(3.1, 11.0, 5.7), jitter + 0.23),
        0.35
      );
    }
    if (uNoiseQuality > 1.5) {
      noise = mix(
        noise,
        sampledNoise(worldSamplePoint * 2.45 + vec3(8.3, 23.0, 1.9), jitter + 0.51),
        0.22
      );
    }
    noise = mix(1.0, noise, uNoiseAmount);
    float density = progressFade * shapeFade * noise * mask;
    float sampleAlpha = clamp(density * distanceStep * 1.55, 0.0, 1.0);
    accumulation += sampleAlpha * transmittance;
    transmittance *= (1.0 - sampleAlpha);
    if (transmittance <= 0.01) {
      break;
    }
  }

  float alpha = clamp(accumulation * uIntensity * 0.92, 0.0, 1.0);

  if (alpha <= 0.0005) {
    discard;
  }

  gl_FragColor = vec4(uColor, alpha);
}
`

const dustVertexShader = `
attribute float aSize;
attribute float aSeed;
attribute float aPhase;

uniform float uTime;
uniform vec3 uDirection;
uniform float uSpeed;
uniform float uDrift;
uniform float uStrength;
uniform float uEdgeFade;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;

varying float vAlpha;

vec3 wrapBox(vec3 position) {
  vec3 size = max(uBoundsMax - uBoundsMin, vec3(0.0001));
  return mod(position - uBoundsMin, size) + uBoundsMin;
}

float edgeFactor(vec3 position, float fadeWidth) {
  float safeFade = max(fadeWidth, 0.0001);
  vec3 distanceToMin = position - uBoundsMin;
  vec3 distanceToMax = uBoundsMax - position;
  float nearestEdge = min(
    min(distanceToMin.x, distanceToMax.x),
    min(min(distanceToMin.y, distanceToMax.y), min(distanceToMin.z, distanceToMax.z))
  );
  return smoothstep(0.0, safeFade, nearestEdge);
}

void main() {
  vec3 animatedPosition = position;
  vec3 drift = vec3(
    sin(uTime * (0.7 + aSeed * 0.4) + aSeed * 11.0),
    cos(uTime * (0.5 + aSeed * 0.3) + aSeed * 19.0),
    sin(uTime * (0.9 + aSeed * 0.2) + aSeed * 7.0)
  ) * uDrift * 0.22;
  animatedPosition = wrapBox(animatedPosition + drift);

  if (uSpeed > 0.0001) {
    float travel = uTime * uSpeed * 6.0 * (0.65 + aSeed * 0.75) + aPhase;
    animatedPosition = wrapBox(animatedPosition + uDirection * travel);
  }

  vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(1.0, aSize * 180.0 / max(-mvPosition.z, 0.001));

  vAlpha = clamp(edgeFactor(animatedPosition, uEdgeFade) * uStrength, 0.0, 1.0);
}
`

const dustFragmentShader = `
uniform vec3 uColor;

varying float vAlpha;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float dist = dot(centered, centered);
  if (dist > 0.25) {
    discard;
  }

  float feather = smoothstep(0.25, 0.0, dist);
  float alpha = vAlpha * feather;
  if (alpha <= 0.0005) {
    discard;
  }

  gl_FragColor = vec4(uColor, alpha);
}
`

function buildPlaneCorners(width: number, height: number, offset: [number, number, number]) {
  const halfWidth = width * 0.5
  const halfHeight = height * 0.5
  const [offsetX, offsetY, offsetZ] = offset

  return [
    new THREE.Vector3(-halfWidth + offsetX, -halfHeight + offsetY, offsetZ),
    new THREE.Vector3(halfWidth + offsetX, -halfHeight + offsetY, offsetZ),
    new THREE.Vector3(halfWidth + offsetX, halfHeight + offsetY, offsetZ),
    new THREE.Vector3(-halfWidth + offsetX, halfHeight + offsetY, offsetZ),
  ]
}

function buildEndPlaneCorners(entry: StencilVolumeState) {
  const rotation = new THREE.Euler(entry.endRotationX, entry.endRotationY, 0, 'XYZ')
  const quaternion = new THREE.Quaternion().setFromEuler(rotation)
  const endCenter = new THREE.Vector3(...entry.extrudeEnd)
  const halfWidth = entry.sourceWidth * entry.endScaleX * 0.5
  const halfHeight = entry.sourceHeight * entry.endScaleY * 0.5

  return [
    new THREE.Vector3(-halfWidth, -halfHeight, 0).applyQuaternion(quaternion).add(endCenter),
    new THREE.Vector3(halfWidth, -halfHeight, 0).applyQuaternion(quaternion).add(endCenter),
    new THREE.Vector3(halfWidth, halfHeight, 0).applyQuaternion(quaternion).add(endCenter),
    new THREE.Vector3(-halfWidth, halfHeight, 0).applyQuaternion(quaternion).add(endCenter),
  ]
}

function createGuideGeometry(entry: StencilVolumeState) {
  const startCorners = buildPlaneCorners(entry.sourceWidth, entry.sourceHeight, [0, 0, 0])
  const endCorners = buildEndPlaneCorners(entry)
  const positions: number[] = []

  const pushSegment = (start: THREE.Vector3, end: THREE.Vector3) => {
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }

  for (let index = 0; index < 4; index += 1) {
    pushSegment(startCorners[index], startCorners[(index + 1) % 4])
    pushSegment(endCorners[index], endCorners[(index + 1) % 4])
    pushSegment(startCorners[index], endCorners[index])
  }

  pushSegment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...entry.extrudeEnd))

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function createSelectionGeometry(entry: StencilVolumeState) {
  const startCorners = buildPlaneCorners(entry.sourceWidth, entry.sourceHeight, [0, 0, 0])
  const endCorners = buildEndPlaneCorners(entry)
  const bounds = new THREE.Box3().setFromPoints([...startCorners, ...endCorners])
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const geometry = new THREE.BoxGeometry(
    Math.max(size.x, 0.05),
    Math.max(size.y, 0.05),
    Math.max(size.z, 0.05),
  )
  geometry.translate(center.x, center.y, center.z)
  return geometry
}

function createVolumeBounds(entry: StencilVolumeState) {
  const startCorners = buildPlaneCorners(entry.sourceWidth, entry.sourceHeight, [0, 0, 0])
  const endCorners = buildEndPlaneCorners(entry)
  return new THREE.Box3().setFromPoints([...startCorners, ...endCorners]).expandByScalar(0.04)
}

type StencilVolumePrimitive = {
  id: string
  shapes: MaskContourShape[]
  sourceCenter: THREE.Vector3
  endCenter: THREE.Vector3
  sourceSize: THREE.Vector2
  maskField: MaskDistanceFieldResult | null
  bounds: THREE.Box3
}

type StencilVolumePreparedPrimitive = {
  id: string
  shapes: MaskContourShape[]
  sourceCenter: THREE.Vector3
  sourceSize: THREE.Vector2
  maskField: MaskDistanceFieldResult | null
}

type ShapeMetrics = {
  shape: MaskContourShape
  centroid: THREE.Vector2
  halfX: number
  halfY: number
}

function getLoopCentroid(points: Array<[number, number]>) {
  if (points.length < 3) {
    const average = points.reduce(
      (accumulator, point) => [accumulator[0] + point[0], accumulator[1] + point[1]],
      [0, 0],
    )
    return {
      centroid: new THREE.Vector2(
        average[0] / Math.max(points.length, 1),
        average[1] / Math.max(points.length, 1),
      ),
      area: 0,
    }
  }

  let signedArea = 0
  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current[0] * next[1] - next[0] * current[1]
    signedArea += cross
    centroidX += (current[0] + next[0]) * cross
    centroidY += (current[1] + next[1]) * cross
  }

  if (Math.abs(signedArea) < 0.0000001) {
    const average = points.reduce(
      (accumulator, point) => [accumulator[0] + point[0], accumulator[1] + point[1]],
      [0, 0],
    )
    return {
      centroid: new THREE.Vector2(
        average[0] / Math.max(points.length, 1),
        average[1] / Math.max(points.length, 1),
      ),
      area: 0,
    }
  }

  return {
    centroid: new THREE.Vector2(
      centroidX / (3 * signedArea),
      centroidY / (3 * signedArea),
    ),
    area: signedArea * 0.5,
  }
}

function getShapeCenterAndExtents(shape: MaskContourShape) {
  const outlineInfo = getLoopCentroid(shape.outline)
  const holeInfos = shape.holes.map((hole) => getLoopCentroid(hole))
  let weightedArea = Math.abs(outlineInfo.area)
  let centerX = outlineInfo.centroid.x * weightedArea
  let centerY = outlineInfo.centroid.y * weightedArea

  holeInfos.forEach((holeInfo) => {
    const holeArea = Math.abs(holeInfo.area)
    centerX -= holeInfo.centroid.x * holeArea
    centerY -= holeInfo.centroid.y * holeArea
    weightedArea -= holeArea
  })

  const centroid = weightedArea > 0.0000001
    ? new THREE.Vector2(centerX / weightedArea, centerY / weightedArea)
    : outlineInfo.centroid.clone()

  const points = [shape.outline, ...shape.holes].flat()
  const extents = points.reduce(
    (accumulator, point) => ({
      halfX: Math.max(accumulator.halfX, Math.abs(point[0] - centroid.x)),
      halfY: Math.max(accumulator.halfY, Math.abs(point[1] - centroid.y)),
    }),
    { halfX: 0.00005, halfY: 0.00005 },
  )

  return {
    shape,
    centroid,
    halfX: extents.halfX,
    halfY: extents.halfY,
  }
}

function clusterShapeMetrics(metricsList: ShapeMetrics[]) {
  if (!metricsList.length) {
    return []
  }

  const gapThreshold = 0.035
  const clusters: ShapeMetrics[][] = []

  const overlapsOrTouches = (left: ShapeMetrics, right: ShapeMetrics) => {
    const leftMinX = left.centroid.x - left.halfX - gapThreshold
    const leftMaxX = left.centroid.x + left.halfX + gapThreshold
    const leftMinY = left.centroid.y - left.halfY - gapThreshold
    const leftMaxY = left.centroid.y + left.halfY + gapThreshold
    const rightMinX = right.centroid.x - right.halfX - gapThreshold
    const rightMaxX = right.centroid.x + right.halfX + gapThreshold
    const rightMinY = right.centroid.y - right.halfY - gapThreshold
    const rightMaxY = right.centroid.y + right.halfY + gapThreshold

    return !(leftMaxX < rightMinX || rightMaxX < leftMinX || leftMaxY < rightMinY || rightMaxY < leftMinY)
  }

  metricsList.forEach((metrics) => {
    const matchingClusters = clusters.filter((cluster) => cluster.some((entry) => overlapsOrTouches(entry, metrics)))

    if (!matchingClusters.length) {
      clusters.push([metrics])
      return
    }

    const primaryCluster = matchingClusters[0]
    primaryCluster.push(metrics)

    for (let index = 1; index < matchingClusters.length; index += 1) {
      const cluster = matchingClusters[index]
      primaryCluster.push(...cluster)
      clusters.splice(clusters.indexOf(cluster), 1)
    }
  })

  return clusters
}

function filterStencilVolumeClusters(clusters: ShapeMetrics[][]) {
  const softClusterBudget = 10
  const hardClusterBudget = 16
  const minClusterAreaRatio = 0.012

  if (clusters.length <= softClusterBudget) {
    return clusters
  }

  const descriptors = clusters.map((cluster, index) => {
    const points = cluster.flatMap((metrics) => [metrics.shape.outline, ...metrics.shape.holes].flat())
    const bounds = points.reduce(
      (accumulator, point) => ({
        minX: Math.min(accumulator.minX, point[0]),
        maxX: Math.max(accumulator.maxX, point[0]),
        minY: Math.min(accumulator.minY, point[1]),
        maxY: Math.max(accumulator.maxY, point[1]),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )
    const area = Math.max((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY), 0)
    return { cluster, index, area }
  })

  const largestArea = descriptors.reduce((maximum, descriptor) => Math.max(maximum, descriptor.area), 0)
  const filteredByArea = largestArea > 0
    ? descriptors.filter((descriptor) => descriptor.area >= largestArea * minClusterAreaRatio)
    : descriptors
  const keptDescriptors = (filteredByArea.length ? filteredByArea : descriptors)
    .sort((left, right) => right.area - left.area)
    .slice(0, hardClusterBudget)
    .sort((left, right) => left.index - right.index)

  return keptDescriptors.map((descriptor) => descriptor.cluster)
}

function buildStencilVolumePreparedPrimitives(
  entry: StencilVolumeState,
  shapes: MaskContourShape[],
  bakedPrimitiveShapeGroups?: MaskContourShape[][] | null,
  bakedPreparedPrimitives?: Array<{
    id: string
    shapes: MaskContourShape[]
    sourceCenter: [number, number, number]
    sourceSize: [number, number]
  }> | null,
) {
  if (bakedPreparedPrimitives?.length) {
    return bakedPreparedPrimitives
      .map((primitive) => ({
        id: primitive.id,
        shapes: primitive.shapes,
        sourceCenter: new THREE.Vector3(...primitive.sourceCenter),
        sourceSize: new THREE.Vector2(...primitive.sourceSize),
        maskField: createShapeDistanceField(primitive.shapes),
      }))
      .filter((primitive) => primitive.maskField)
  }

  const shapeGroups = bakedPrimitiveShapeGroups?.length
    ? bakedPrimitiveShapeGroups
    : filterStencilVolumeClusters(clusterShapeMetrics(shapes.map((shape) => getShapeCenterAndExtents(shape))))
      .map((cluster) => cluster.map((metrics) => metrics.shape))

  if (!shapeGroups.length) {
    return []
  }

  return shapeGroups
    .map((shapeGroup, index) => {
      const clusterPoints = shapeGroup.flatMap((shape) => [shape.outline, ...shape.holes].flat())
      const clusterBounds = clusterPoints.reduce(
        (accumulator, point) => ({
          minX: Math.min(accumulator.minX, point[0]),
          maxX: Math.max(accumulator.maxX, point[0]),
          minY: Math.min(accumulator.minY, point[1]),
          maxY: Math.max(accumulator.maxY, point[1]),
        }),
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
        },
      )

      const centerXNormalized = (clusterBounds.minX + clusterBounds.maxX) * 0.5
      const centerYNormalized = (clusterBounds.minY + clusterBounds.maxY) * 0.5
      const halfX = Math.max((clusterBounds.maxX - clusterBounds.minX) * 0.5, 0.00005)
      const halfY = Math.max((clusterBounds.maxY - clusterBounds.minY) * 0.5, 0.00005)
      const widthSpan = halfX * 2
      const heightSpan = halfY * 2
      const dominantSpan = Math.max(widthSpan, heightSpan)
      const clusterArea = widthSpan * heightSpan
      const resolutionFactor = THREE.MathUtils.clamp(
        Math.max(dominantSpan * 1.45, Math.sqrt(clusterArea) * 1.9),
        0.18,
        1,
      )
      const resolutionFactorSquared = resolutionFactor * resolutionFactor
      const fieldMinSize = Math.round(24 + 40 * resolutionFactor)
      const fieldMaxSize = Math.round(48 + 208 * resolutionFactorSquared)

      const sizeX = Math.max(halfX * entry.sourceWidth * 2, 0.0001)
      const sizeY = Math.max(halfY * entry.sourceHeight * 2, 0.0001)
      const centerX = centerXNormalized * entry.sourceWidth
      const centerY = centerYNormalized * entry.sourceHeight
      const sourceCenter = new THREE.Vector3(centerX, centerY, 0)
      const maskField = createShapeDistanceField(shapeGroup, {
        minFieldWidth: fieldMinSize,
        minFieldHeight: fieldMinSize,
        maxFieldWidth: fieldMaxSize,
        maxFieldHeight: fieldMaxSize,
      })

      return {
        id: `cluster-${index}`,
        shapes: shapeGroup,
        sourceCenter,
        sourceSize: new THREE.Vector2(sizeX, sizeY),
        maskField,
      }
    })
    .filter((primitive) => primitive.maskField)
}

function instantiateStencilVolumePrimitive(
  preparedPrimitive: StencilVolumePreparedPrimitive,
  entry: StencilVolumeState,
  endQuaternion: THREE.Quaternion,
) {
  const endCenterOffset = new THREE.Vector3(...entry.extrudeEnd)
  const endCenter = new THREE.Vector3(
    preparedPrimitive.sourceCenter.x * entry.endScaleX,
    preparedPrimitive.sourceCenter.y * entry.endScaleY,
    0,
  )
    .applyQuaternion(endQuaternion)
    .add(endCenterOffset)
  const startCorners = buildPlaneCorners(
    preparedPrimitive.sourceSize.x,
    preparedPrimitive.sourceSize.y,
    [
      preparedPrimitive.sourceCenter.x,
      preparedPrimitive.sourceCenter.y,
      preparedPrimitive.sourceCenter.z,
    ],
  )
  const halfSizeX = preparedPrimitive.sourceSize.x * entry.endScaleX * 0.5
  const halfSizeY = preparedPrimitive.sourceSize.y * entry.endScaleY * 0.5
  const endCorners = [
    new THREE.Vector3(-halfSizeX, -halfSizeY, 0).applyQuaternion(endQuaternion).add(endCenter),
    new THREE.Vector3(halfSizeX, -halfSizeY, 0).applyQuaternion(endQuaternion).add(endCenter),
    new THREE.Vector3(halfSizeX, halfSizeY, 0).applyQuaternion(endQuaternion).add(endCenter),
    new THREE.Vector3(-halfSizeX, halfSizeY, 0).applyQuaternion(endQuaternion).add(endCenter),
  ]
  const bounds = new THREE.Box3().setFromPoints([...startCorners, ...endCorners]).expandByScalar(0.04)

  return {
    id: preparedPrimitive.id,
    shapes: preparedPrimitive.shapes,
    sourceCenter: preparedPrimitive.sourceCenter.clone(),
    endCenter,
    sourceSize: preparedPrimitive.sourceSize.clone(),
    maskField: preparedPrimitive.maskField,
    bounds,
  } satisfies StencilVolumePrimitive
}

function createPrimitiveVolumeGeometry(bounds: THREE.Box3) {
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const geometry = new THREE.BoxGeometry(
    Math.max(size.x, 0.05),
    Math.max(size.y, 0.05),
    Math.max(size.z, 0.05),
  )
  geometry.translate(center.x, center.y, center.z)
  return geometry
}

function createContourCapGeometry(shapes: MaskContourShape[]) {
  if (!shapes.length) {
    return null
  }

  const shapeList = shapes.map((shape) => {
    const nextShape = new THREE.Shape(shape.outline.map(([x, y]) => new THREE.Vector2(x, y)))
    shape.holes.forEach((hole) => {
      nextShape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))))
    })
    return nextShape
  })

  return new THREE.ShapeGeometry(shapeList)
}

function createContourWallGeometry(entry: StencilVolumeState, shapes: MaskContourShape[]) {
  if (!shapes.length) {
    return null
  }

  const endRotation = new THREE.Euler(entry.endRotationX, entry.endRotationY, 0, 'XYZ')
  const endQuaternion = new THREE.Quaternion().setFromEuler(endRotation)
  const endCenter = new THREE.Vector3(...entry.extrudeEnd)
  const positions: number[] = []
  const progressValues: number[] = []
  const startA = new THREE.Vector3()
  const startB = new THREE.Vector3()
  const endA = new THREE.Vector3()
  const endB = new THREE.Vector3()

  const pushTriangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    progressA: number,
    progressB: number,
    progressC: number,
  ) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    progressValues.push(progressA, progressB, progressC)
  }

  const loops = shapes.flatMap((shape) => [shape.outline, ...shape.holes])

  loops.forEach((loop) => {
    if (loop.length < 2) {
      return
    }

    for (let index = 0; index < loop.length; index += 1) {
      const current = loop[index]
      const next = loop[(index + 1) % loop.length]

      startA.set(current[0] * entry.sourceWidth, current[1] * entry.sourceHeight, 0)
      startB.set(next[0] * entry.sourceWidth, next[1] * entry.sourceHeight, 0)
      endA
        .set(current[0] * entry.sourceWidth * entry.endScaleX, current[1] * entry.sourceHeight * entry.endScaleY, 0)
        .applyQuaternion(endQuaternion)
        .add(endCenter)
      endB
        .set(next[0] * entry.sourceWidth * entry.endScaleX, next[1] * entry.sourceHeight * entry.endScaleY, 0)
        .applyQuaternion(endQuaternion)
        .add(endCenter)

      pushTriangle(startA, startB, endB, 0, 0, 1)
      pushTriangle(startA, endB, endA, 0, 1, 1)
    }
  })

  if (!positions.length) {
    return null
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progressValues, 1))
  geometry.computeVertexNormals()
  return geometry
}

function getLoopArea(points: [number, number][]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area * 0.5
}

function isPointInsideLoop(point: [number, number], loop: [number, number][]) {
  let inside = false
  for (let index = 0, previousIndex = loop.length - 1; index < loop.length; previousIndex = index, index += 1) {
    const current = loop[index]
    const previous = loop[previousIndex]
    const deltaY = previous[1] - current[1]
    const safeDeltaY = Math.abs(deltaY) < 0.0000001 ? (deltaY < 0 ? -0.0000001 : 0.0000001) : deltaY
    const intersects =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / safeDeltaY + current[0]

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function samplePointInShape(shape: MaskContourShape, random = Math.random) {
  const loops = [shape.outline]
  const bounds = shape.outline.reduce(
    (accumulator, point) => ({
      minX: Math.min(accumulator.minX, point[0]),
      maxX: Math.max(accumulator.maxX, point[0]),
      minY: Math.min(accumulator.minY, point[1]),
      maxY: Math.max(accumulator.maxY, point[1]),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const point: [number, number] = [
      THREE.MathUtils.lerp(bounds.minX, bounds.maxX, random()),
      THREE.MathUtils.lerp(bounds.minY, bounds.maxY, random()),
    ]

    if (!isPointInsideLoop(point, shape.outline)) {
      continue
    }

    const insideHole = shape.holes.some((hole) => isPointInsideLoop(point, hole))
    if (insideHole) {
      continue
    }

    return point
  }

  return loops[0][0] ?? [0, 0]
}

function createStencilDustGeometry(
  entry: StencilVolumeState,
  shapes: MaskContourShape[],
  dustCount: number,
  localToWorldMatrix: THREE.Matrix4,
) {
  if (!shapes.length || dustCount <= 0) {
    return null
  }

  const shapeWeights = shapes.map((shape) => Math.max(Math.abs(getLoopArea(shape.outline)), 0.0001))
  const totalWeight = shapeWeights.reduce((sum, value) => sum + value, 0)
  const pickShape = (random = Math.random) => {
    let threshold = random() * totalWeight
    for (let index = 0; index < shapes.length; index += 1) {
      threshold -= shapeWeights[index]
      if (threshold <= 0) {
        return shapes[index]
      }
    }
    return shapes[0]
  }

  const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(entry.endRotationX, entry.endRotationY, 0, 'XYZ'))
  const endCenter = new THREE.Vector3(...entry.extrudeEnd)
  const startPoint = new THREE.Vector3()
  const endPoint = new THREE.Vector3()
  const positions = new Float32Array(dustCount * 3)
  const sizes = new Float32Array(dustCount)
  const seeds = new Float32Array(dustCount)
  const phases = new Float32Array(dustCount)
  const initialPosition = new THREE.Vector3()

  for (let index = 0; index < dustCount; index += 1) {
    const random = createSeededRandom(`${entry.id}:stencil-dust:${index}`)
    const shape = pickShape(random)
    const point = samplePointInShape(shape, random)
    startPoint.set(point[0] * entry.sourceWidth, point[1] * entry.sourceHeight, 0)
    endPoint
      .set(point[0] * entry.sourceWidth * entry.endScaleX, point[1] * entry.sourceHeight * entry.endScaleY, 0)
      .applyQuaternion(endQuaternion)
      .add(endCenter)
    initialPosition.copy(startPoint).lerp(endPoint, random()).applyMatrix4(localToWorldMatrix)

    const offset = index * 3
    positions[offset] = initialPosition.x
    positions[offset + 1] = initialPosition.y
    positions[offset + 2] = initialPosition.z
    sizes[index] = THREE.MathUtils.lerp(entry.dustSizeMin, entry.dustSizeMax, random())
    seeds[index] = random()
    phases[index] = random() * 6
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  return geometry
}

function StencilVolumeRayPrimitive({
  primitive,
  entry,
  effectiveNoise,
  endQuaternion,
  primitiveCount,
}: {
  primitive: StencilVolumePrimitive
  entry: StencilVolumeState
  effectiveNoise: {
    rayNoiseAmount: number
    rayNoiseScale: number
    rayGrain: number
    rayNoiseMotionMode: 'off' | 'soft'
    rayNoiseMotionSpeed: number
    rayQuality: GodRaysQuality
  }
  endQuaternion: THREE.Quaternion
  primitiveCount: number
}) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const cameraLocal = useMemo(() => new THREE.Vector3(), [])
  const animatedNoiseOffsetRef = useRef(new THREE.Vector2(0, 0))
  const geometry = useMemo(() => createPrimitiveVolumeGeometry(primitive.bounds), [primitive.bounds])
  const localMaskTexture = useMemo(() => {
    if (!primitive.maskField) {
      return null
    }

    const nextTexture = new THREE.CanvasTexture(primitive.maskField.canvas)
    nextTexture.colorSpace = THREE.NoColorSpace
    nextTexture.magFilter = THREE.LinearFilter
    nextTexture.minFilter = THREE.LinearFilter
    nextTexture.generateMipmaps = false
    nextTexture.needsUpdate = true
    return nextTexture
  }, [primitive.maskField])
  const uniforms = useMemo(
    () => ({
      uMask: { value: localMaskTexture },
      uColor: { value: new THREE.Color(entry.volumeColor) },
      uIntensity: { value: entry.volumeIntensity },
      uFalloff: { value: entry.volumeFalloff },
      uEdgeFade: { value: entry.rayEdgeFade ?? 0.22 },
      uTime: { value: 0 },
      uNoiseAmount: { value: effectiveNoise.rayNoiseAmount },
      uNoiseScale: { value: effectiveNoise.rayNoiseScale },
      uGrain: { value: effectiveNoise.rayGrain },
      uAnimatedNoiseOffsetX: { value: 0 },
      uAnimatedNoiseOffsetZ: { value: 0 },
      uNoiseQuality: { value: getStencilNoiseQualityLevel(effectiveNoise.rayQuality) },
      uSteps: { value: getStencilFillSteps(effectiveNoise.rayQuality, entry.rayFillQuality ?? 0.5, primitiveCount) },
      uMaskInvert: { value: entry.maskInvert ? 1 : 0 },
      uMaskTexelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      uMaskUvCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uMaskUvHalfSize: { value: new THREE.Vector2(0.5, 0.5) },
      uSourceSize: { value: primitive.sourceSize.clone() },
      uStartCenter: { value: primitive.sourceCenter.clone() },
      uEndCenter: { value: primitive.endCenter.clone() },
      uEndScale: { value: new THREE.Vector2(entry.endScaleX, entry.endScaleY) },
      uEndQuaternion: { value: new THREE.Vector4(endQuaternion.x, endQuaternion.y, endQuaternion.z, endQuaternion.w) },
      uCameraLocal: { value: new THREE.Vector3() },
      uBoundsMin: { value: primitive.bounds.min.clone() },
      uBoundsMax: { value: primitive.bounds.max.clone() },
      uLocalToWorld: { value: new THREE.Matrix4() },
    }),
    [effectiveNoise, endQuaternion, entry, localMaskTexture, primitive, primitiveCount],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => localMaskTexture?.dispose(), [localMaskTexture])

  useEffect(() => {
    uniforms.uMask.value = localMaskTexture
    uniforms.uColor.value.set(entry.volumeColor)
    uniforms.uIntensity.value = entry.volumeIntensity
    uniforms.uFalloff.value = entry.volumeFalloff
    uniforms.uEdgeFade.value = entry.rayEdgeFade ?? 0.22
    uniforms.uNoiseAmount.value = effectiveNoise.rayNoiseAmount
    uniforms.uNoiseScale.value = effectiveNoise.rayNoiseScale
    uniforms.uGrain.value = effectiveNoise.rayGrain
    uniforms.uNoiseQuality.value = getStencilNoiseQualityLevel(effectiveNoise.rayQuality)
    uniforms.uSteps.value = getStencilFillSteps(
      effectiveNoise.rayQuality,
      entry.rayFillQuality ?? 0.5,
      primitiveCount,
    )
    uniforms.uMaskInvert.value = entry.maskInvert ? 1 : 0
    uniforms.uMaskUvCenter.value.set(0.5, 0.5)
    uniforms.uMaskUvHalfSize.value.set(0.5, 0.5)
    uniforms.uSourceSize.value.copy(primitive.sourceSize)
    uniforms.uStartCenter.value.copy(primitive.sourceCenter)
    uniforms.uEndCenter.value.copy(primitive.endCenter)
    uniforms.uEndScale.value.set(entry.endScaleX, entry.endScaleY)
    uniforms.uEndQuaternion.value.set(endQuaternion.x, endQuaternion.y, endQuaternion.z, endQuaternion.w)
    uniforms.uBoundsMin.value.copy(primitive.bounds.min)
    uniforms.uBoundsMax.value.copy(primitive.bounds.max)
    const image = localMaskTexture?.image as { width?: number; height?: number } | undefined
    const texelWidth = image?.width ? 1 / image.width : 1 / 512
    const texelHeight = image?.height ? 1 / image.height : 1 / 512
    uniforms.uMaskTexelSize.value.set(texelWidth, texelHeight)
    if (effectiveNoise.rayNoiseMotionMode !== 'soft') {
      animatedNoiseOffsetRef.current.set(0, 0)
      uniforms.uAnimatedNoiseOffsetX.value = 0
      uniforms.uAnimatedNoiseOffsetZ.value = 0
    }
  }, [effectiveNoise, endQuaternion, entry, localMaskTexture, primitive, primitiveCount, uniforms])

  if (!localMaskTexture) {
    return null
  }

  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) {
      return
    }

    materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime()
    cameraLocal.copy(state.camera.position)
    meshRef.current.worldToLocal(cameraLocal)
    materialRef.current.uniforms.uCameraLocal.value.copy(cameraLocal)
    materialRef.current.uniforms.uLocalToWorld.value.copy(meshRef.current.matrixWorld)

    if (effectiveNoise.rayNoiseMotionMode === 'soft' && effectiveNoise.rayNoiseMotionSpeed > 0) {
      animatedNoiseOffsetRef.current.x += delta * effectiveNoise.rayNoiseMotionSpeed * 1.15
      animatedNoiseOffsetRef.current.y += delta * effectiveNoise.rayNoiseMotionSpeed * 0.68
    }

    materialRef.current.uniforms.uAnimatedNoiseOffsetX.value = animatedNoiseOffsetRef.current.x
    materialRef.current.uniforms.uAnimatedNoiseOffsetZ.value = animatedNoiseOffsetRef.current.y
  })

  return (
    <mesh ref={meshRef} geometry={geometry} renderOrder={1}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={volumeWallVertexShader}
        fragmentShader={volumeWallFragmentShader}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

export function StencilVolume({ entry }: { entry: StencilVolumeState }) {
  const groupRef = useRef<THREE.Group | null>(null)
  const endHandleRef = useRef<THREE.Group | null>(null)
  const endHandleVisualRef = useRef<THREE.Mesh | null>(null)
  const objectState = useEditorStore((state) => state.objects[entry.id] ?? null)
  const runtimeObject = useEditorStore((state) => state.runtime.objectById[entry.id] ?? null)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const activeStencilVolumeEndHandleId = useEditorStore((state) => state.hud.activeStencilVolumeEndHandleId)
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const godRaysGlobalNoise = useEditorStore((state) => state.godRaysGlobalNoise)
  const godRaysGlobalDirection = useEditorStore((state) => state.godRaysGlobalDirection)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const [maskTexture, setMaskTexture] = useState<THREE.Texture | null>(null)
  const [maskContour, setMaskContour] = useState<MaskContourResult | null>(null)
  const isSelected = selectedObjectId === entry.id
  const isEditingEnd = activeStencilVolumeEndHandleId === entry.id
  const endHandleId = useMemo(() => getStencilVolumeEndHandleId(entry.id), [entry.id])
  const endHandleWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const cameraWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const dustPointsRef = useRef<THREE.Points | null>(null)
  const dustMaterialRef = useRef<THREE.ShaderMaterial | null>(null)
  const effectiveNoise = entry.rayUseGlobalNoiseSettings !== false
    ? godRaysGlobalNoise
    : {
        rayNoiseAmount: entry.rayNoiseAmount ?? godRaysGlobalNoise.rayNoiseAmount,
        rayNoiseScale: entry.rayNoiseScale ?? godRaysGlobalNoise.rayNoiseScale,
        rayGrain: entry.rayGrain ?? godRaysGlobalNoise.rayGrain,
        rayNoiseMotionMode: entry.rayNoiseMotionMode ?? godRaysGlobalNoise.rayNoiseMotionMode,
        rayNoiseMotionSpeed: entry.rayNoiseMotionSpeed ?? godRaysGlobalNoise.rayNoiseMotionSpeed,
        rayQuality: entry.rayQuality ?? godRaysGlobalNoise.rayQuality,
      }
  const effectiveDustWorldDirection = useMemo(
    () =>
      runtimeObject
        ? (
            (entry.dustDirectionMode ?? 'global') === 'global'
              ? normalizeGodRaysDirection(godRaysGlobalDirection)
              : getGodRaysDirectionWorldFromLocal(entry.dustDirectionLocal ?? godRaysGlobalDirection, runtimeObject)
          )
        : normalizeGodRaysDirection(
            (entry.dustDirectionMode ?? 'global') === 'global'
              ? godRaysGlobalDirection
              : entry.dustDirectionLocal ?? godRaysGlobalDirection,
          ),
    [entry, godRaysGlobalDirection, runtimeObject],
  )
  const guideGeometry = useMemo(
    () => createGuideGeometry(entry),
    [
      entry.sourceWidth,
      entry.sourceHeight,
      entry.endRotationX,
      entry.endRotationY,
      entry.endScaleX,
      entry.endScaleY,
      entry.extrudeEnd,
    ],
  )
  const volumeBounds = useMemo(
    () => createVolumeBounds(entry),
    [
      entry.sourceWidth,
      entry.sourceHeight,
      entry.endRotationX,
      entry.endRotationY,
      entry.endScaleX,
      entry.endScaleY,
      entry.extrudeEnd,
    ],
  )
  const localToWorldMatrix = useMemo(() => {
    const position = new THREE.Vector3(...(objectState?.position ?? [0, 0, 0]))
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(objectState?.rotation ?? [0, 0, 0]), 'XYZ'))
    const scale = new THREE.Vector3(...(objectState?.scale ?? [1, 1, 1]))
    return new THREE.Matrix4().compose(position, quaternion, scale)
  }, [objectState])
  const dustAnchorMatrix = useMemo(() => {
    const position = new THREE.Vector3(...(objectState?.position ?? [0, 0, 0]))
    const scale = new THREE.Vector3(...(objectState?.scale ?? [1, 1, 1]))
    return new THREE.Matrix4().compose(position, new THREE.Quaternion(), scale)
  }, [objectState?.position, objectState?.scale])
  const worldToLocalMatrix = useMemo(() => localToWorldMatrix.clone().invert(), [localToWorldMatrix])
  const dustWorldBounds = useMemo(() => {
    const corners = [
      new THREE.Vector3(volumeBounds.min.x, volumeBounds.min.y, volumeBounds.min.z),
      new THREE.Vector3(volumeBounds.max.x, volumeBounds.min.y, volumeBounds.min.z),
      new THREE.Vector3(volumeBounds.max.x, volumeBounds.max.y, volumeBounds.min.z),
      new THREE.Vector3(volumeBounds.min.x, volumeBounds.max.y, volumeBounds.min.z),
      new THREE.Vector3(volumeBounds.min.x, volumeBounds.min.y, volumeBounds.max.z),
      new THREE.Vector3(volumeBounds.max.x, volumeBounds.min.y, volumeBounds.max.z),
      new THREE.Vector3(volumeBounds.max.x, volumeBounds.max.y, volumeBounds.max.z),
      new THREE.Vector3(volumeBounds.min.x, volumeBounds.max.y, volumeBounds.max.z),
    ].map((point) => point.applyMatrix4(dustAnchorMatrix))
    return new THREE.Box3().setFromPoints(corners)
  }, [dustAnchorMatrix, volumeBounds])
  const endQuaternion = useMemo(() => {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(entry.endRotationX, entry.endRotationY, 0, 'XYZ'))
  }, [entry.endRotationX, entry.endRotationY])
  const maskContourGeometry = useMemo(() => {
    if (!maskContour?.positions.length) {
      return null
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(maskContour.positions, 3))
    return geometry
  }, [maskContour])
  const contourCapGeometry = useMemo(
    () => createContourCapGeometry(maskContour?.shapes ?? []),
    [maskContour],
  )
  const preparedPrimitiveVolumes = useMemo(
    () => buildStencilVolumePreparedPrimitives(
      entry,
      maskContour?.shapes ?? [],
      entry.bakedPrimitiveShapeGroups ?? null,
      entry.bakedPreparedPrimitives ?? null,
    ),
    [
      entry.bakedPreparedPrimitives,
      entry.bakedPrimitiveShapeGroups,
      entry.sourceHeight,
      entry.sourceWidth,
      maskContour,
    ],
  )
  const primitiveVolumes = useMemo(
    () => preparedPrimitiveVolumes.map((primitive) => instantiateStencilVolumePrimitive(primitive, entry, endQuaternion)),
    [
      entry.endRotationX,
      entry.endRotationY,
      entry.endScaleX,
      entry.endScaleY,
      entry.extrudeEnd,
      endQuaternion,
      preparedPrimitiveVolumes,
    ],
  )
  const activeVolumeShapes = useMemo(
    () => primitiveVolumes.flatMap((primitive) => primitive.shapes),
    [primitiveVolumes],
  )
  const effectiveDustCount = useMemo(
    () => getStencilEffectiveDustCount(entry.dustCount, primitiveVolumes.length),
    [entry.dustCount, primitiveVolumes.length],
  )
  const dustGeometry = useMemo(
    () => createStencilDustGeometry(entry, activeVolumeShapes, effectiveDustCount, dustAnchorMatrix),
    [
      entry.dustSizeMax,
      entry.dustSizeMin,
      entry.endRotationX,
      entry.endRotationY,
      entry.endScaleX,
      entry.endScaleY,
      entry.extrudeEnd,
      entry.sourceHeight,
      entry.sourceWidth,
      activeVolumeShapes,
      effectiveDustCount,
      dustAnchorMatrix,
    ],
  )
  const dustUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDirection: { value: new THREE.Vector3(...effectiveDustWorldDirection) },
      uSpeed: { value: Math.max(entry.dustSpeed, 0.0001) },
      uDrift: { value: entry.dustDrift },
      uStrength: { value: entry.dustStrength },
      uEdgeFade: { value: entry.dustEdgeFade ?? 0.16 },
      uColor: { value: new THREE.Color((entry.dustColorLinked ?? true) ? entry.volumeColor : entry.dustColor ?? entry.volumeColor) },
      uBoundsMin: { value: dustWorldBounds.min.clone() },
      uBoundsMax: { value: dustWorldBounds.max.clone() },
    }),
    [
      effectiveDustWorldDirection,
      entry.dustColor,
      entry.dustColorLinked,
      entry.dustDrift,
      entry.dustEdgeFade,
      entry.dustSpeed,
      entry.dustStrength,
      entry.volumeColor,
      dustWorldBounds,
    ],
  )

  useEffect(() => {
    registerObjectRef(entry.id, groupRef.current)
    return () => {
      registerObjectRef(entry.id, null)
    }
  }, [entry.id, registerObjectRef])

  useEffect(() => {
    if (!isEditingEnd) {
      registerObjectRef(endHandleId, null)
      return
    }

    registerObjectRef(endHandleId, endHandleRef.current)
    return () => {
      registerObjectRef(endHandleId, null)
    }
  }, [endHandleId, isEditingEnd, registerObjectRef])

  useEffect(() => () => guideGeometry.dispose(), [guideGeometry])
  useEffect(
    () => () => {
      maskContourGeometry?.dispose()
    },
    [maskContourGeometry],
  )
  useEffect(
    () => () => {
      contourCapGeometry?.dispose()
    },
    [contourCapGeometry],
  )
  useEffect(
    () => () => {
      dustGeometry?.dispose()
    },
    [dustGeometry],
  )
  useEffect(() => {
    dustUniforms.uDirection.value.set(...effectiveDustWorldDirection)
    dustUniforms.uSpeed.value = Math.max(entry.dustSpeed, 0.0001)
    dustUniforms.uDrift.value = entry.dustDrift
    dustUniforms.uStrength.value = entry.dustStrength
    dustUniforms.uEdgeFade.value = entry.dustEdgeFade ?? 0.16
    dustUniforms.uColor.value.set((entry.dustColorLinked ?? true) ? entry.volumeColor : entry.dustColor ?? entry.volumeColor)
    dustUniforms.uBoundsMin.value.copy(dustWorldBounds.min)
    dustUniforms.uBoundsMax.value.copy(dustWorldBounds.max)
  }, [
    dustUniforms,
    effectiveDustWorldDirection,
    entry.dustColor,
    entry.dustColorLinked,
    entry.dustDrift,
    entry.dustEdgeFade,
    entry.dustSpeed,
    entry.dustStrength,
    entry.volumeColor,
    dustWorldBounds,
  ])

  useEffect(() => {
    if (!groupRef.current || !objectState) {
      return
    }

    groupRef.current.position.set(...objectState.position)
    groupRef.current.rotation.set(...objectState.rotation)
    groupRef.current.scale.set(...objectState.scale)
    groupRef.current.visible = objectState.visible
  }, [objectState])

  useEffect(() => {
    if (!endHandleRef.current) {
      return
    }

    endHandleRef.current.position.set(...entry.extrudeEnd)
    endHandleRef.current.rotation.set(entry.endRotationX, entry.endRotationY, 0)
    endHandleRef.current.scale.set(entry.endScaleX, entry.endScaleY, 1)
  }, [entry.endRotationX, entry.endRotationY, entry.endScaleX, entry.endScaleY, entry.extrudeEnd])

  useEffect(() => {
    if (entry.bakedContourShapes?.length) {
      setMaskTexture((current) => {
        current?.dispose()
        return null
      })
      setMaskContour({
        positions: [],
        shapes: entry.bakedContourShapes,
      })
      return
    }

    if (!entry.maskAssetUrl) {
      setMaskTexture((current) => {
        current?.dispose()
        return null
      })
      setMaskContour(null)
      return
    }

    let disposed = false
    const loader = new THREE.TextureLoader()
    loader.load(entry.maskAssetUrl, (nextTexture) => {
      if (disposed) {
        nextTexture.dispose()
        return
      }

      nextTexture.colorSpace = THREE.SRGBColorSpace
      nextTexture.magFilter = THREE.LinearFilter
      nextTexture.minFilter = THREE.LinearFilter
      setMaskTexture((current) => {
        current?.dispose()
        return nextTexture
      })
    })

    void extractMaskContour(entry.maskAssetUrl, {
      invert: entry.maskInvert,
      detail: entry.contourDetail,
      simplify: entry.contourSimplify,
      smooth: entry.contourSmooth,
      minArea: entry.contourMinArea,
      mode: 'silhouette',
    })
      .then((nextContour) => {
        if (disposed) {
          return
        }

        setMaskContour(nextContour)
      })
      .catch((error) => {
        if (!disposed) {
          console.warn('[StencilVolume]: Failed to extract mask contour', error)
          setMaskContour(null)
        }
      })

    return () => {
      disposed = true
    }
  }, [
    entry.bakedContourShapes,
    entry.contourDetail,
    entry.contourMinArea,
    entry.contourSimplify,
    entry.contourSmooth,
    entry.maskAssetUrl,
    entry.maskInvert,
  ])

  useEffect(
    () => () => {
      maskTexture?.dispose()
    },
    [maskTexture],
  )

  if (!objectState) {
    return null
  }

  const disableSelectionRaycast = anchorModeEnabled && selectedObjectId === entry.id
  const sourceOpacity = THREE.MathUtils.clamp(entry.volumeIntensity * 0.08, 0.06, 0.18)
  const endOpacity = THREE.MathUtils.clamp(entry.volumeIntensity * 0.12, 0.08, 0.28)
  const sourceCapOpacity = THREE.MathUtils.clamp(entry.volumeIntensity * 0.08, 0.05, 0.18)
  const endCapOpacity = THREE.MathUtils.clamp(entry.volumeIntensity * 0.16, 0.1, 0.3)
  const sourcePreviewOpacity = maskTexture ? 0.86 : sourceOpacity
  const showGuides = (isSelected && entry.helperVisible) || isEditingEnd
  const useRaymarchedVolume = primitiveVolumes.length > 0
  const showContourDiagnostics = entry.contourDebugVisible ?? false
  const showContourLines = Boolean(maskContourGeometry && showContourDiagnostics)
  const showVolumeCaps = Boolean(
    contourCapGeometry && (showContourDiagnostics || (!useRaymarchedVolume && entry.projectionVisible)),
  )
  const showFallbackSelection = !disableSelectionRaycast
    && !useRaymarchedVolume
    && !entry.projectionVisible
    && !showContourLines
    && !showVolumeCaps
    && !showGuides
  const selectionGeometry = useMemo(
    () => (
      showFallbackSelection
        ? createSelectionGeometry(entry)
        : null
    ),
    [
      entry.sourceWidth,
      entry.sourceHeight,
      entry.endRotationX,
      entry.endRotationY,
      entry.endScaleX,
      entry.endScaleY,
      entry.extrudeEnd,
      showFallbackSelection,
    ],
  )

  useEffect(
    () => () => {
      selectionGeometry?.dispose()
    },
    [selectionGeometry],
  )

  useFrame((state, delta) => {
    if (dustPointsRef.current) {
      dustPointsRef.current.matrixAutoUpdate = false
      dustPointsRef.current.matrix.copy(worldToLocalMatrix)
      dustPointsRef.current.matrixWorldNeedsUpdate = true
    }

    if (dustMaterialRef.current) {
      dustMaterialRef.current.uniforms.uTime.value = state.clock.getElapsedTime()
    }

    if (!endHandleRef.current || !endHandleVisualRef.current || !isEditingEnd) {
      return
    }

    endHandleRef.current.getWorldPosition(endHandleWorldPosition)
    state.camera.getWorldPosition(cameraWorldPosition)
    const distance = cameraWorldPosition.distanceTo(endHandleWorldPosition)
    const perspectiveScale =
      (state.camera as THREE.PerspectiveCamera).isPerspectiveCamera
        ? distance * Math.tan(THREE.MathUtils.degToRad((state.camera as THREE.PerspectiveCamera).fov * 0.5)) * 0.06
        : 0.25
    const scale = THREE.MathUtils.clamp(perspectiveScale, 0.08, 0.28)
    endHandleVisualRef.current.scale.setScalar(scale)
  })

  return (
    <group
      ref={groupRef}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 2) {
          return
        }

        event.stopPropagation()
        if (anchorModeEnabled) {
          if (selectedObjectId !== entry.id) {
            setSelectedObjectId(entry.id)
          }
          return
        }

        setSelectedObjectId(selectedObjectId === entry.id ? null : entry.id)
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
      }}
    >
      {selectionGeometry ? (
        <mesh geometry={selectionGeometry}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ffffff" />
        </mesh>
      ) : null}
      {entry.projectionVisible ? (
        <mesh renderOrder={2}>
          <planeGeometry args={[entry.sourceWidth, entry.sourceHeight]} />
          <meshBasicMaterial
            color={maskTexture ? '#ffffff' : entry.volumeColor}
            map={maskTexture}
            transparent
            opacity={sourcePreviewOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {useRaymarchedVolume ? (
        <group>
          {primitiveVolumes.map((primitive) => (
            <StencilVolumeRayPrimitive
              key={primitive.id}
              primitive={primitive}
              entry={entry}
              effectiveNoise={effectiveNoise}
              endQuaternion={endQuaternion}
              primitiveCount={primitiveVolumes.length}
            />
          ))}
        </group>
      ) : null}
      {entry.dustEnabled && dustGeometry ? (
        <points ref={dustPointsRef} geometry={dustGeometry} renderOrder={3} frustumCulled={false}>
          <shaderMaterial
            ref={dustMaterialRef}
            uniforms={dustUniforms}
            vertexShader={dustVertexShader}
            fragmentShader={dustFragmentShader}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      ) : null}
      {showVolumeCaps && contourCapGeometry ? (
        <group position={[0, 0, 0.002]} scale={[entry.sourceWidth, entry.sourceHeight, 1]}>
          <mesh geometry={contourCapGeometry} renderOrder={3}>
            <meshBasicMaterial
              color={entry.volumeColor}
              transparent
              opacity={sourceCapOpacity}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ) : null}
      {showContourLines && maskContourGeometry ? (
        <group scale={[entry.sourceWidth, entry.sourceHeight, 1]}>
          <lineSegments geometry={maskContourGeometry} renderOrder={6}>
            <lineBasicMaterial color="#f5fbff" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </lineSegments>
        </group>
      ) : null}
      <group
        position={entry.extrudeEnd}
        rotation={[entry.endRotationX, entry.endRotationY, 0]}
        scale={[entry.endScaleX, entry.endScaleY, 1]}
      >
        {entry.projectionVisible ? (
          <mesh renderOrder={2}>
            <planeGeometry args={[entry.sourceWidth, entry.sourceHeight]} />
            <meshBasicMaterial
              color={entry.volumeColor}
              transparent
              opacity={endOpacity}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ) : null}
        {showVolumeCaps && contourCapGeometry ? (
          <group position={[0, 0, 0.002]} scale={[entry.sourceWidth, entry.sourceHeight, 1]}>
            <mesh geometry={contourCapGeometry} renderOrder={3}>
            <meshBasicMaterial
              color={entry.volumeColor}
              transparent
              opacity={endCapOpacity}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ) : null}
        {showContourLines && maskContourGeometry ? (
          <group scale={[entry.sourceWidth, entry.sourceHeight, 1]}>
            <lineSegments geometry={maskContourGeometry} renderOrder={6}>
              <lineBasicMaterial color="#f5fbff" transparent opacity={0.82} depthWrite={false} toneMapped={false} />
            </lineSegments>
          </group>
        ) : null}
      </group>
      {showGuides ? (
        <>
          <lineSegments geometry={guideGeometry} renderOrder={4}>
            <lineBasicMaterial
              color={isSelected ? '#9ed8ff' : '#7f95a8'}
              transparent
              opacity={isSelected ? 0.96 : 0.72}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
          <mesh position={entry.extrudeEnd} renderOrder={5}>
            <sphereGeometry args={[0.05, 18, 18]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.94} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      ) : null}
      {isEditingEnd ? (
        <group
          ref={endHandleRef}
          position={entry.extrudeEnd}
          rotation={[entry.endRotationX, entry.endRotationY, 0]}
          scale={[entry.endScaleX, entry.endScaleY, 1]}
          onPointerDown={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation()
            setSelectedObjectId(entry.id)
          }}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation()
            setSelectedObjectId(entry.id)
          }}
        >
          <mesh ref={endHandleVisualRef} renderOrder={7}>
            <sphereGeometry args={[1, 14, 14]} />
            <meshBasicMaterial color="#7fd0ff" transparent opacity={0.001} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
    </group>
  )
}
