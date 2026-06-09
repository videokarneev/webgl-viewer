import * as THREE from 'three'
import type { GodRaysBoxState, GodRaysQuality, GodRaysSourceFace } from '../../../store/editorStore'

export const GOD_RAYS_MIN_SIDE_COUNT = 3
export const GOD_RAYS_MAX_SIDE_COUNT = 20

export function clampGodRaysSideCount(value: number) {
  return Math.round(THREE.MathUtils.clamp(value, GOD_RAYS_MIN_SIDE_COUNT, GOD_RAYS_MAX_SIDE_COUNT))
}

export function getGodRaysPolygonOffset(sideCount: number) {
  return sideCount % 2 === 0 ? Math.PI / sideCount : 0
}

export function getGodRaysRadiusAt(entry: Pick<GodRaysBoxState, 'bottomRadius' | 'topRadius'>, y: number) {
  return THREE.MathUtils.lerp(entry.bottomRadius, entry.topRadius, THREE.MathUtils.clamp(y, 0, 1))
}

export function getGodRaysPolygonBoundaryRadius(angle: number, radius: number, sideCount: number) {
  const safeSideCount = Math.max(sideCount, GOD_RAYS_MIN_SIDE_COUNT)
  const sector = (Math.PI * 2) / safeSideCount
  const apothem = Math.max(radius * Math.cos(Math.PI / safeSideCount), 0.0001)
  const localAngle =
    THREE.MathUtils.euclideanModulo(
      angle - getGodRaysPolygonOffset(safeSideCount),
      sector,
    ) - sector * 0.5
  return apothem / Math.max(Math.cos(localAngle), 0.0001)
}

export function getGodRaysVisualRoundness(sideCount: number) {
  return THREE.MathUtils.clamp((sideCount - 6) / 8, 0, 1)
}

export function getGodRaysVisualBoundaryRadius(angle: number, radius: number, sideCount: number) {
  const polygonBoundary = getGodRaysPolygonBoundaryRadius(angle, radius, sideCount)
  return THREE.MathUtils.lerp(polygonBoundary, radius, getGodRaysVisualRoundness(sideCount))
}

export function createSeededRandom(seed: string | number) {
  let state = typeof seed === 'number' ? seed >>> 0 : 2166136261
  if (typeof seed === 'string') {
    for (let index = 0; index < seed.length; index += 1) {
      state ^= seed.charCodeAt(index)
      state = Math.imul(state, 16777619)
    }
  }

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function samplePointInGodRaysVolume(
  entry: Pick<GodRaysBoxState, 'bottomRadius' | 'topRadius' | 'sideCount'>,
  random = Math.random,
) {
  const y = random()
  const angle = random() * Math.PI * 2
  const radiusAtY = getGodRaysRadiusAt(entry, y)
  const boundaryRadius = getGodRaysVisualBoundaryRadius(angle, radiusAtY, entry.sideCount)
  const distance = boundaryRadius * Math.sqrt(random())

  return new THREE.Vector3(
    Math.cos(angle) * distance,
    y,
    Math.sin(angle) * distance,
  )
}

export function getGodRaysMaxRadius(entry: Pick<GodRaysBoxState, 'bottomRadius' | 'topRadius'>) {
  return Math.max(entry.bottomRadius, entry.topRadius)
}

export function createGodRaysPrismGeometry(
  entry: Pick<GodRaysBoxState, 'bottomRadius' | 'topRadius' | 'sideCount'>,
  options?: { openEnded?: boolean },
) {
  const geometry = new THREE.CylinderGeometry(
    entry.topRadius,
    entry.bottomRadius,
    1,
    clampGodRaysSideCount(entry.sideCount),
    1,
    options?.openEnded ?? false,
  )
  geometry.rotateY(getGodRaysPolygonOffset(entry.sideCount))
  geometry.translate(0, 0.5, 0)
  return geometry
}

export function createGodRaysOutlineGeometry(entry: Pick<GodRaysBoxState, 'bottomRadius' | 'topRadius' | 'sideCount'>) {
  const sideCount = clampGodRaysSideCount(entry.sideCount)
  const offset = getGodRaysPolygonOffset(sideCount)
  const bottomVertices: THREE.Vector3[] = []
  const topVertices: THREE.Vector3[] = []

  for (let index = 0; index < sideCount; index += 1) {
    const angle = offset + (index / sideCount) * Math.PI * 2
    bottomVertices.push(
      new THREE.Vector3(
        Math.cos(angle) * entry.bottomRadius,
        0,
        Math.sin(angle) * entry.bottomRadius,
      ),
    )
    topVertices.push(
      new THREE.Vector3(
        Math.cos(angle) * entry.topRadius,
        1,
        Math.sin(angle) * entry.topRadius,
      ),
    )
  }

  const points: number[] = []
  const pushEdge = (start: THREE.Vector3, end: THREE.Vector3) => {
    points.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }

  for (let index = 0; index < sideCount; index += 1) {
    const nextIndex = (index + 1) % sideCount
    pushEdge(bottomVertices[index], bottomVertices[nextIndex])
    pushEdge(topVertices[index], topVertices[nextIndex])
    pushEdge(bottomVertices[index], topVertices[index])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

export function getGodRaysSteps(quality: GodRaysQuality) {
  if (quality === 'low') {
    return 16
  }
  if (quality === 'high') {
    return 48
  }
  return 32
}

export function getSourceFaceVector(face: GodRaysSourceFace) {
  switch (face) {
    case '+x':
      return new THREE.Vector3(1, 0, 0)
    case '-x':
      return new THREE.Vector3(-1, 0, 0)
    case '+y':
      return new THREE.Vector3(0, 1, 0)
    case '-y':
      return new THREE.Vector3(0, -1, 0)
    case '+z':
      return new THREE.Vector3(0, 0, 1)
    default:
      return new THREE.Vector3(0, 0, -1)
  }
}
