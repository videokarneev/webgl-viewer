import * as THREE from 'three'
import type {
  FrameAspectPreset,
  ObjectTransformState,
  PhoneScreenBoxResponsivePresetKind,
  PhoneScreenBoxState,
  ResponsiveFramePresetKind,
  ResponsiveFrameState,
} from '../../../store/editorStore'

const FRAME_ASPECT_VALUES: Record<Exclude<FrameAspectPreset, 'auto'>, number> = {
  '1:1': 1,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
  '9:16': 9 / 16,
}

const DEFAULT_RESPONSIVE_FRAME_ASPECTS: Record<ResponsiveFramePresetKind, FrameAspectPreset> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
}
const LOCKED_OPENING_EDGE_FILL = 1.01

export interface ResolvedPhoneScreenBoxDimensions {
  aspect: number
  frameAspectPreset: FrameAspectPreset | null
  responsivePresetKind: ResponsiveFramePresetKind | null
  width: number
  footprintDepth: number
  boxHeight: number
  wallThickness: number
  innerWidth: number
  innerFootprintDepth: number
  innerHeight: number
}

export interface ResolvedPhoneScreenBoxCameraFrame {
  target: [number, number, number]
  position: [number, number, number]
  dimensions: ResolvedPhoneScreenBoxDimensions
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFrameAspectValue(preset: FrameAspectPreset, fallbackAspect: number) {
  if (preset === 'auto') {
    return Math.max(fallbackAspect, 0.0001)
  }

  return FRAME_ASPECT_VALUES[preset] ?? Math.max(fallbackAspect, 0.0001)
}

function resolveResponsivePresetKindFromAspect(containerAspect: number): ResponsiveFramePresetKind {
  if (containerAspect > 1.2) {
    return 'landscape'
  }

  if (containerAspect < 0.85) {
    return 'portrait'
  }

  return 'square'
}

function resolveResponsivePresetKind(
  requestedKind: PhoneScreenBoxResponsivePresetKind,
  containerAspect: number,
): ResponsiveFramePresetKind {
  if (requestedKind === 'auto') {
    return resolveResponsivePresetKindFromAspect(containerAspect)
  }

  return requestedKind
}

function resolvePhoneScreenBoxAspectValue(
  box: PhoneScreenBoxState,
  responsiveFrame: ResponsiveFrameState,
  containerAspect: number,
) {
  const safeContainerAspect = Math.max(containerAspect, 0.0001)

  if (box.screenBinding.lockToFrame && box.screenBinding.mode !== 'fixed') {
    return {
      aspect: safeContainerAspect,
      frameAspectPreset: null,
      responsivePresetKind: null,
    }
  }

  switch (box.screenBinding.mode) {
    case 'viewport':
      return {
        aspect: safeContainerAspect,
        frameAspectPreset: null,
        responsivePresetKind: null,
      }

    case 'phonePortrait':
      return {
        aspect: getFrameAspectValue('9:16', safeContainerAspect),
        frameAspectPreset: '9:16' as FrameAspectPreset,
        responsivePresetKind: 'portrait' as ResponsiveFramePresetKind,
      }

    case 'responsivePreset': {
      const responsivePresetKind = resolveResponsivePresetKind(
        box.screenBinding.responsivePresetKind,
        safeContainerAspect,
      )
      const frameAspectPreset =
        responsiveFrame[responsivePresetKind]?.frameAspectPreset ?? DEFAULT_RESPONSIVE_FRAME_ASPECTS[responsivePresetKind]

      return {
        aspect: getFrameAspectValue(frameAspectPreset, safeContainerAspect),
        frameAspectPreset,
        responsivePresetKind,
      }
    }

    case 'fixed':
    default:
      return {
        aspect: getFrameAspectValue(box.geometry.aspectPreset, safeContainerAspect),
        frameAspectPreset: box.geometry.aspectPreset,
        responsivePresetKind: null,
      }
  }
}

export function resolvePhoneScreenBoxDimensions(
  box: PhoneScreenBoxState,
  responsiveFrame: ResponsiveFrameState,
  containerAspect: number,
): ResolvedPhoneScreenBoxDimensions {
  const { aspect, frameAspectPreset, responsivePresetKind } = resolvePhoneScreenBoxAspectValue(
    box,
    responsiveFrame,
    containerAspect,
  )

  const safeAspect = Math.max(aspect, 0.0001)
  const safeBaseLongEdge = Math.max(box.geometry.baseLongEdge, 0.001)

  let contentWidth = safeAspect >= 1 ? safeBaseLongEdge : safeBaseLongEdge * safeAspect
  let contentFootprintDepth = safeAspect >= 1 ? safeBaseLongEdge / safeAspect : safeBaseLongEdge

  const marginScale = Math.max(0.05, 1 - clampNumber(box.screenBinding.margin, 0, 0.45) * 2)
  contentWidth *= marginScale
  contentFootprintDepth *= marginScale

  const contentLongEdge = Math.max(contentWidth, contentFootprintDepth)
  const contentShortEdge = Math.min(contentWidth, contentFootprintDepth)

  let boxHeight = Math.max(box.geometry.depth, 0.001)
  if (box.screenBinding.depthScaleMode === 'shortEdge') {
    boxHeight = Math.max(contentShortEdge * box.geometry.depth, 0.001)
  }
  if (box.screenBinding.depthScaleMode === 'longEdge') {
    boxHeight = Math.max(contentLongEdge * box.geometry.depth, 0.001)
  }
  if (box.screenBinding.mode !== 'fixed') {
    // Keep responsive showcase boxes visually deep enough to read as open containers from the default camera.
    boxHeight = Math.max(boxHeight, contentLongEdge * 0.45)
  }

  const maxWallThickness = Math.max(contentShortEdge * 0.49, 0.0005)
  const minWallThickness = box.screenBinding.mode === 'fixed' ? 0.0005 : contentShortEdge * 0.08
  const wallThickness = clampNumber(box.geometry.wallThickness, minWallThickness, maxWallThickness)
  const width = box.screenBinding.mode === 'fixed' ? contentWidth : contentWidth + wallThickness * 2
  const footprintDepth =
    box.screenBinding.mode === 'fixed' ? contentFootprintDepth : contentFootprintDepth + wallThickness * 2
  const innerWidth = box.screenBinding.mode === 'fixed' ? Math.max(width - wallThickness * 2, 0.0001) : contentWidth
  const innerFootprintDepth =
    box.screenBinding.mode === 'fixed' ? Math.max(footprintDepth - wallThickness * 2, 0.0001) : contentFootprintDepth

  return {
    aspect: safeAspect,
    frameAspectPreset,
    responsivePresetKind,
    width,
    footprintDepth,
    boxHeight,
    wallThickness,
    innerWidth: Math.max(innerWidth, 0.0001),
    innerFootprintDepth: Math.max(innerFootprintDepth, 0.0001),
    innerHeight: Math.max(boxHeight - wallThickness, 0.0001),
  }
}

export function resolvePhoneScreenBoxCameraFrame(
  box: PhoneScreenBoxState,
  transform: Pick<ObjectTransformState, 'position' | 'rotation' | 'scale'>,
  responsiveFrame: ResponsiveFrameState,
  containerAspect: number,
  cameraAspect: number,
  cameraFovDegrees: number,
): ResolvedPhoneScreenBoxCameraFrame {
  const dimensions = resolvePhoneScreenBoxDimensions(box, responsiveFrame, containerAspect)
  const transformMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)),
    new THREE.Vector3(...transform.scale),
  )
  const boxQuaternion = new THREE.Quaternion().setFromRotationMatrix(transformMatrix)
  const lockToOpening = box.screenBinding.lockToFrame
  const targetVector = lockToOpening
    ? new THREE.Vector3(0, 0, 0).applyMatrix4(transformMatrix)
    : new THREE.Vector3(...box.content.anchor).applyMatrix4(transformMatrix)
  const halfWidth = (lockToOpening ? dimensions.innerWidth : dimensions.width) * 0.5
  const halfDepth = (lockToOpening ? dimensions.innerFootprintDepth : dimensions.footprintDepth) * 0.5
  const topY = 0
  const bottomY = -dimensions.boxHeight
  const openingCorners = [
    new THREE.Vector3(-halfWidth, topY, -halfDepth),
    new THREE.Vector3(-halfWidth, topY, halfDepth),
    new THREE.Vector3(halfWidth, topY, -halfDepth),
    new THREE.Vector3(halfWidth, topY, halfDepth),
  ]
  const depthCorners = [
    new THREE.Vector3(-halfWidth, bottomY, -halfDepth),
    new THREE.Vector3(-halfWidth, bottomY, halfDepth),
    new THREE.Vector3(halfWidth, bottomY, -halfDepth),
    new THREE.Vector3(halfWidth, bottomY, halfDepth),
  ]
  const corners = (lockToOpening ? openingCorners : [...openingCorners, ...depthCorners]).map((corner) =>
    corner.applyMatrix4(transformMatrix),
  )
  const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(boxQuaternion).normalize()
  const depthAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(boxQuaternion).normalize()
  const viewDirection = upAxis.clone()
  const cameraForward = viewDirection.clone().negate()
  const screenUp = depthAxis.clone()
  const screenRight = new THREE.Vector3().crossVectors(screenUp, cameraForward).normalize()
  const verticalFov = THREE.MathUtils.degToRad(cameraFovDegrees)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(cameraAspect, 0.0001))
  const baseFitFraction = lockToOpening
    ? LOCKED_OPENING_EDGE_FILL
    : cameraAspect < 0.85
      ? 0.74
      : cameraAspect < 1.2
        ? 0.8
        : 0.86
  const fitFraction = lockToOpening
    ? Math.max(baseFitFraction - box.screenBinding.margin * 0.2, 1)
    : THREE.MathUtils.clamp(baseFitFraction - box.screenBinding.margin * 0.35, 0.7, 0.9)
  const halfHorizontalFovTangent = Math.max(Math.tan(horizontalFov / 2), 0.0001)
  const halfVerticalFovTangent = Math.max(Math.tan(verticalFov / 2), 0.0001)
  const requiredDistance = corners.reduce((maxDistance, corner) => {
    const offset = corner.clone().sub(targetVector)
    const x = Math.abs(offset.dot(screenRight))
    const y = Math.abs(offset.dot(screenUp))
    const z = offset.dot(cameraForward)
    const horizontalDistance = x / (halfHorizontalFovTangent * fitFraction) - z
    const verticalDistance = y / (halfVerticalFovTangent * fitFraction) - z
    return Math.max(maxDistance, horizontalDistance, verticalDistance)
  }, 0)
  const minimumDistance = Math.max(dimensions.boxHeight * 1.35, dimensions.footprintDepth * 0.65, 0.1)
  const distance = lockToOpening ? Math.max(requiredDistance, 0.1) : Math.max(requiredDistance, minimumDistance)
  const safeTargetOffset = lockToOpening
    ? new THREE.Vector3()
    : screenUp.clone().multiplyScalar(-dimensions.footprintDepth * (cameraAspect < 0.85 ? 0.06 : 0.03))
  const cameraPosition = targetVector
    .clone()
    .add(safeTargetOffset)
    .addScaledVector(viewDirection, distance)
  const framedTarget = targetVector.clone().add(safeTargetOffset)

  return {
    target: [framedTarget.x, framedTarget.y, framedTarget.z],
    position: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
    dimensions,
  }
}

function createPanelGeometry(
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
) {
  const indexed = new THREE.BoxGeometry(width, height, depth)
  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.translate(...position)
  return geometry
}

function appendAttributeValues(target: number[], attribute: THREE.BufferAttribute, itemSize: number) {
  const source = attribute.array as ArrayLike<number>
  for (let index = 0; index < attribute.count; index += 1) {
    const offset = index * itemSize
    for (let axis = 0; axis < itemSize; axis += 1) {
      target.push(source[offset + axis] ?? 0)
    }
  }
}

function mergePanelGeometries(geometries: THREE.BufferGeometry[]) {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  geometries.forEach((geometry) => {
    appendAttributeValues(positions, geometry.getAttribute('position') as THREE.BufferAttribute, 3)
    appendAttributeValues(normals, geometry.getAttribute('normal') as THREE.BufferAttribute, 3)
    appendAttributeValues(uvs, geometry.getAttribute('uv') as THREE.BufferAttribute, 2)
    geometry.dispose()
  })

  const merged = new THREE.BufferGeometry()
  const uvArray = new Float32Array(uvs)

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2))
  merged.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  merged.setAttribute('uv2', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  merged.setAttribute('uv3', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  merged.computeBoundingBox()
  merged.computeBoundingSphere()

  return merged
}

function appendQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  vertices: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  normal: THREE.Vector3,
) {
  const triangleOrder = [0, 1, 2, 0, 2, 3]
  const quadUvs = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ] as const

  triangleOrder.forEach((vertexIndex) => {
    const vertex = vertices[vertexIndex]
    const uv = quadUvs[vertexIndex]
    positions.push(vertex.x, vertex.y, vertex.z)
    normals.push(normal.x, normal.y, normal.z)
    uvs.push(uv[0], uv[1])
  })
}

export function createPhoneScreenBoxInteriorGeometry(
  width: number,
  height: number,
  depth: number,
) {
  const safeWidth = Math.max(width, 0.001)
  const safeHeight = Math.max(height, 0.001)
  const safeDepth = Math.max(depth, 0.001)
  const halfWidth = safeWidth * 0.5
  const halfDepth = safeDepth * 0.5
  const nearY = 0
  const farY = -safeHeight
  const left = -halfWidth
  const right = halfWidth
  const top = halfDepth
  const bottom = -halfDepth

  const nearTopLeft = new THREE.Vector3(left, nearY, top)
  const nearTopRight = new THREE.Vector3(right, nearY, top)
  const nearBottomRight = new THREE.Vector3(right, nearY, bottom)
  const nearBottomLeft = new THREE.Vector3(left, nearY, bottom)
  const farTopLeft = new THREE.Vector3(left, farY, top)
  const farTopRight = new THREE.Vector3(right, farY, top)
  const farBottomRight = new THREE.Vector3(right, farY, bottom)
  const farBottomLeft = new THREE.Vector3(left, farY, bottom)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  appendQuad(positions, normals, uvs, [farTopLeft, farTopRight, farBottomRight, farBottomLeft], new THREE.Vector3(0, 1, 0))
  appendQuad(positions, normals, uvs, [nearTopLeft, farTopLeft, farBottomLeft, nearBottomLeft], new THREE.Vector3(1, 0, 0))
  appendQuad(positions, normals, uvs, [nearBottomRight, farBottomRight, farTopRight, nearTopRight], new THREE.Vector3(-1, 0, 0))
  appendQuad(positions, normals, uvs, [nearTopRight, farTopRight, farTopLeft, nearTopLeft], new THREE.Vector3(0, 0, -1))
  appendQuad(positions, normals, uvs, [nearBottomLeft, farBottomLeft, farBottomRight, nearBottomRight], new THREE.Vector3(0, 0, 1))

  const geometry = new THREE.BufferGeometry()
  const uvArray = new Float32Array(uvs)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2))
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  geometry.setAttribute('uv3', new THREE.Float32BufferAttribute(new Float32Array(uvArray), 2))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return geometry
}

export function createPhoneScreenBoxGeometry(
  width: number,
  height: number,
  depth: number,
  wallThickness: number,
  openTop = true,
) {
  const safeWidth = Math.max(width, 0.001)
  const safeHeight = Math.max(height, 0.001)
  const safeDepth = Math.max(depth, 0.001)
  const safeWallThickness = Math.min(
    Math.max(wallThickness, 0.0005),
    safeWidth * 0.49,
    safeDepth * 0.49,
    safeHeight * 0.49,
  )

  const wallHeight = Math.max(safeHeight - safeWallThickness, 0.0001)
  const frontBackWidth = Math.max(safeWidth - safeWallThickness * 2, 0.0001)

  const bottom = createPanelGeometry(
    safeWidth,
    safeWallThickness,
    safeDepth,
    [0, -safeHeight + safeWallThickness * 0.5, 0],
  )

  const leftWall = createPanelGeometry(
    safeWallThickness,
    wallHeight,
    safeDepth,
    [-safeWidth * 0.5 + safeWallThickness * 0.5, -wallHeight * 0.5, 0],
  )

  const rightWall = createPanelGeometry(
    safeWallThickness,
    wallHeight,
    safeDepth,
    [safeWidth * 0.5 - safeWallThickness * 0.5, -wallHeight * 0.5, 0],
  )

  const frontWall = createPanelGeometry(
    frontBackWidth,
    wallHeight,
    safeWallThickness,
    [0, -wallHeight * 0.5, safeDepth * 0.5 - safeWallThickness * 0.5],
  )

  const backWall = createPanelGeometry(
    frontBackWidth,
    wallHeight,
    safeWallThickness,
    [0, -wallHeight * 0.5, -safeDepth * 0.5 + safeWallThickness * 0.5],
  )

  const geometries = [bottom, leftWall, rightWall, frontWall, backWall]

  if (!openTop) {
    geometries.push(createPanelGeometry(safeWidth, safeWallThickness, safeDepth, [0, -safeWallThickness * 0.5, 0]))
  }

  return mergePanelGeometries(geometries)
}
