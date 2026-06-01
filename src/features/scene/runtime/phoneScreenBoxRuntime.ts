import * as THREE from 'three'
import type {
  FrameAspectPreset,
  ObjectTransformState,
  PhoneScreenBoxResponsivePresetKind,
  PhoneScreenBoxState,
  ResponsiveFramePresetKind,
  ResponsiveFrameState,
} from '../../../store/editorStore'

const FRAME_ASPECT_VALUES: Record<FrameAspectPreset, number> = {
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

function getFrameAspectValue(preset: FrameAspectPreset) {
  return FRAME_ASPECT_VALUES[preset]
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

  switch (box.screenBinding.mode) {
    case 'viewport':
      return {
        aspect: safeContainerAspect,
        frameAspectPreset: null,
        responsivePresetKind: null,
      }

    case 'phonePortrait':
      return {
        aspect: getFrameAspectValue('9:16'),
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
        aspect: getFrameAspectValue(frameAspectPreset),
        frameAspectPreset,
        responsivePresetKind,
      }
    }

    case 'fixed':
    default:
      return {
        aspect: getFrameAspectValue(box.geometry.aspectPreset),
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

  let width = safeAspect >= 1 ? safeBaseLongEdge : safeBaseLongEdge * safeAspect
  let footprintDepth = safeAspect >= 1 ? safeBaseLongEdge / safeAspect : safeBaseLongEdge

  const marginScale = Math.max(0.05, 1 - clampNumber(box.screenBinding.margin, 0, 0.45) * 2)
  width *= marginScale
  footprintDepth *= marginScale

  const longEdge = Math.max(width, footprintDepth)
  const shortEdge = Math.min(width, footprintDepth)

  let boxHeight = Math.max(box.geometry.depth, 0.001)
  if (box.screenBinding.depthScaleMode === 'shortEdge') {
    boxHeight = Math.max(shortEdge * box.geometry.depth, 0.001)
  }
  if (box.screenBinding.depthScaleMode === 'longEdge') {
    boxHeight = Math.max(longEdge * box.geometry.depth, 0.001)
  }
  if (box.screenBinding.mode !== 'fixed') {
    // Keep responsive showcase boxes visually deep enough to read as open containers from the default camera.
    boxHeight = Math.max(boxHeight, longEdge * 0.45)
  }

  const maxWallThickness = Math.max(shortEdge * 0.49, 0.0005)
  const minWallThickness = box.screenBinding.mode === 'fixed' ? 0.0005 : shortEdge * 0.08
  const wallThickness = clampNumber(box.geometry.wallThickness, minWallThickness, maxWallThickness)

  return {
    aspect: safeAspect,
    frameAspectPreset,
    responsivePresetKind,
    width,
    footprintDepth,
    boxHeight,
    wallThickness,
    innerWidth: Math.max(width - wallThickness * 2, 0.0001),
    innerFootprintDepth: Math.max(footprintDepth - wallThickness * 2, 0.0001),
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
  const targetVector = new THREE.Vector3(...box.content.anchor).applyMatrix4(transformMatrix)
  const halfWidth = dimensions.width * 0.5
  const halfDepth = dimensions.footprintDepth * 0.5
  const topY = 0
  const bottomY = -dimensions.boxHeight
  const corners = [
    new THREE.Vector3(-halfWidth, topY, -halfDepth),
    new THREE.Vector3(-halfWidth, topY, halfDepth),
    new THREE.Vector3(halfWidth, topY, -halfDepth),
    new THREE.Vector3(halfWidth, topY, halfDepth),
    new THREE.Vector3(-halfWidth, bottomY, -halfDepth),
    new THREE.Vector3(-halfWidth, bottomY, halfDepth),
    new THREE.Vector3(halfWidth, bottomY, -halfDepth),
    new THREE.Vector3(halfWidth, bottomY, halfDepth),
  ].map((corner) => corner.applyMatrix4(transformMatrix))
  const radius = Math.max(
    corners.reduce((maxDistance, corner) => Math.max(maxDistance, corner.distanceTo(targetVector)), 0),
    0.05,
  )
  const verticalFov = THREE.MathUtils.degToRad(cameraFovDegrees)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(cameraAspect, 0.0001))
  const limitingFov = Math.max(Math.min(verticalFov, horizontalFov), 0.001)
  const distance = (radius / Math.sin(limitingFov / 2)) * 1.08
  const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(boxQuaternion).normalize()
  const depthAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(boxQuaternion).normalize()
  const viewDirection = upAxis.clone().multiplyScalar(1.4).addScaledVector(depthAxis, 0.12).normalize()
  const cameraPosition = targetVector
    .clone()
    .addScaledVector(viewDirection, distance)
    .addScaledVector(upAxis, dimensions.boxHeight * 0.04)

  return {
    target: [targetVector.x, targetVector.y, targetVector.z],
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
