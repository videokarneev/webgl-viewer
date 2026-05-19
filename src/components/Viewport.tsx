import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { applyCameraFrame, applyViewerCameraOptics, fitCameraToObject } from '../features/scene/runtime/shared'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import {
  DEFAULT_VIEWER_CAMERA_FOV,
  DEFAULT_VIEWER_FOCAL_LENGTH,
  type FrameAspectPreset,
  useEditorStore,
} from '../store/editorStore'
import { MaterialEffectController } from './MaterialEffectController'
import { SceneAnimationController } from './SceneAnimationController'
import { TransformToolbar } from './TransformToolbar'
import { ViewportHud } from './ViewportHud'
import { FlightController } from './viewport/FlightController'
import { syncRuntimeObjectTransform } from './viewport/transformShared'
import {
  consumeFlightUnlockForEscape,
  consumeFlightUnlockFullscreenRestore,
  markFlightUnlockForEscape,
} from './viewport/flightLockBridge'

const EnvironmentManager = lazy(() =>
  import('./viewport/EnvironmentManager').then((module) => ({
    default: module.EnvironmentManager,
  })),
)
const LightRig = lazy(() =>
  import('./viewport/LightRig').then((module) => ({
    default: module.LightRig,
  })),
)
const PostEffects = lazy(() =>
  import('./viewport/PostEffects').then((module) => ({
    default: module.PostEffects,
  })),
)

const VIEWPORT_GRID_CELL_COLOR = 'rgba(80, 96, 107, 0.8)'
const VIEWPORT_GRID_SECTION_COLOR = 'rgba(35, 45, 52, 0.8)'
const LIGHT_METRIC_TEXT = {
  primary: 'rgba(240, 240, 240, 0.94)',
  muted: 'rgba(240, 240, 240, 0.82)',
}
const DARK_METRIC_TEXT = {
  primary: 'rgba(26, 26, 26, 0.94)',
  muted: 'rgba(26, 26, 26, 0.82)',
}
const ANCHOR_HANDLE_COLOR = '#cfe6f7'
const ANCHOR_HANDLE_HOVER_COLOR = '#eef9ff'
const ANCHOR_HANDLE_ACTIVE_COLOR = '#ffffff'
const ANCHOR_HANDLE_ACTIVE_GLOW_COLOR = '#7fd0ff'
const FRAME_ASPECT_VALUES: Record<FrameAspectPreset, number> = {
  '1:1': 1,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

type ViewportFrameRect = {
  width: number
  height: number
  left: number
  top: number
}

function getViewportFrameRect(width: number, height: number, aspect: number): ViewportFrameRect {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const safeAspect = Math.max(aspect, 0.0001)
  const containerAspect = safeWidth / safeHeight

  if (containerAspect > safeAspect) {
    const frameHeight = safeHeight
    const frameWidth = frameHeight * safeAspect
    return {
      width: frameWidth,
      height: frameHeight,
      left: (safeWidth - frameWidth) / 2,
      top: 0,
    }
  }

  const frameWidth = safeWidth
  const frameHeight = frameWidth / safeAspect
  return {
    width: frameWidth,
    height: frameHeight,
    left: 0,
    top: (safeHeight - frameHeight) / 2,
  }
}

function writeBoundingBoxCorners(box: THREE.Box3, corners: THREE.Vector3[]) {
  const min = box.min
  const max = box.max
  const values: [number, number, number][] = [
    [min.x, min.y, min.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z],
  ]

  values.forEach(([x, y, z], index) => {
    corners[index].set(x, y, z)
  })
}

function getLuminanceFromRgb(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function getMetricTextPalette(luminance: number) {
  return luminance > 0.5 ? DARK_METRIC_TEXT : LIGHT_METRIC_TEXT
}

function getLuminanceFromHex(colorValue: string) {
  const normalized = colorValue.replace('#', '')
  if (normalized.length !== 6) {
    return 0
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return 0
  }

  return getLuminanceFromRgb(red, green, blue)
}

function sampleTextureLuminance(texture: THREE.Texture) {
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | null
    | undefined

  if (!image) {
    return Promise.resolve<number | null>(null)
  }

  if (
    'data' in image &&
    image.data &&
    typeof image.width === 'number' &&
    typeof image.height === 'number' &&
    image.width > 0 &&
    image.height > 0
  ) {
    const channels = Math.max(3, Math.floor(image.data.length / (image.width * image.height)))
    const pixelCount = image.width * image.height
    const step = Math.max(1, Math.floor(pixelCount / 2048))
    let totalLuminance = 0
    let samples = 0

    for (let index = 0; index < pixelCount; index += step) {
      const offset = index * channels
      const red = Math.min(1, Math.max(0, Number(image.data[offset] ?? 0)))
      const green = Math.min(1, Math.max(0, Number(image.data[offset + 1] ?? 0)))
      const blue = Math.min(1, Math.max(0, Number(image.data[offset + 2] ?? 0)))
      totalLuminance += getLuminanceFromRgb(red, green, blue)
      samples += 1
    }

    return Promise.resolve(samples > 0 ? totalLuminance / samples : null)
  }

  if (typeof document === 'undefined') {
    return Promise.resolve<number | null>(null)
  }

  return new Promise<number | null>((resolve) => {
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const width = 'videoWidth' in image ? image.videoWidth : image.width
      const height = 'videoHeight' in image ? image.videoHeight : image.height

      if (!context || !width || !height) {
        resolve(null)
        return
      }

      canvas.width = 16
      canvas.height = 16
      context.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let totalLuminance = 0

      for (let index = 0; index < data.length; index += 4) {
        totalLuminance += getLuminanceFromRgb(
          data[index] / 255,
          data[index + 1] / 255,
          data[index + 2] / 255,
        )
      }

      resolve(totalLuminance / (data.length / 4))
    } catch (error) {
      console.warn('[MetricsOverlay]: Failed to sample background luminance', error)
      resolve(null)
    }
  })
}

type PerformanceSnapshot = {
  fps: number
  triangles: number
  vertices: number
  drawCalls: number
}

type GeometryStats = {
  vertices: number
  triangles: number
  drawCalls: number
  geometryBytes: number
}

type TextureMemoryInfo = {
  bytes: number
}

const MATERIAL_TEXTURE_SLOTS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
] as const

function getMeshDrawCallCount(mesh: THREE.Mesh) {
  const geometryGroups = mesh.geometry?.groups ?? []
  if (!geometryGroups.length) {
    return 1
  }

  const materials = mesh.material
  if (Array.isArray(materials)) {
    return geometryGroups.filter((group) => group.materialIndex == null || Boolean(materials[group.materialIndex])).length
  }

  return geometryGroups.length
}

function getTextureMemoryKey(
  texture: THREE.Texture,
  imageKeys: WeakMap<object, string>,
  nextImageKey: { current: number },
) {
  const sourceData = texture.source?.data as unknown
  const image = (sourceData || texture.image) as
    | ({ src?: string; currentSrc?: string; width?: number; height?: number } & object)
    | null
    | undefined

  if (image && typeof image === 'object') {
    const existingKey = imageKeys.get(image)
    if (existingKey) {
      return existingKey
    }

    const sourceUrl = image.currentSrc || image.src
    const nextKey = sourceUrl || `image:${nextImageKey.current++}`
    imageKeys.set(image, nextKey)
    return nextKey
  }

  return texture.source?.uuid ?? texture.uuid
}

function getTextureChannelCount(texture: THREE.Texture) {
  switch (texture.format) {
    case THREE.RedFormat:
    case THREE.AlphaFormat:
      return 1
    case THREE.RGFormat:
      return 2
    case THREE.RGBFormat:
      return 3
    default:
      return 4
  }
}

function getTextureBytesPerChannel(texture: THREE.Texture) {
  switch (texture.type) {
    case THREE.ByteType:
    case THREE.UnsignedByteType:
      return 1
    case THREE.ShortType:
    case THREE.UnsignedShortType:
    case THREE.UnsignedShort4444Type:
    case THREE.UnsignedShort5551Type:
    case THREE.UnsignedInt248Type:
    case THREE.HalfFloatType:
      return 2
    case THREE.IntType:
    case THREE.UnsignedIntType:
    case THREE.FloatType:
      return 4
    default:
      return 1
  }
}

function textureUsesMipmaps(texture: THREE.Texture) {
  return (
    texture.generateMipmaps ||
    texture.minFilter === THREE.NearestMipmapNearestFilter ||
    texture.minFilter === THREE.NearestMipmapLinearFilter ||
    texture.minFilter === THREE.LinearMipmapNearestFilter ||
    texture.minFilter === THREE.LinearMipmapLinearFilter ||
    Boolean(texture.mipmaps?.length)
  )
}

function getTextureMemoryInfo(texture: THREE.Texture): TextureMemoryInfo {
  if ((texture as THREE.CompressedTexture).isCompressedTexture && texture.mipmaps?.length) {
    const bytes = texture.mipmaps.reduce((sum, mipmap) => {
      const data = (mipmap as THREE.CompressedTextureMipmap).data as ArrayBufferView | undefined
      return sum + (data?.byteLength ?? mipmap.width * mipmap.height * 4)
    }, 0)

    return { bytes }
  }

  const sourceData = texture.source?.data as unknown
  const image = (sourceData || texture.image) as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | null
    | undefined
  const width = image?.width ?? image?.videoWidth ?? 512
  const height = image?.height ?? image?.videoHeight ?? 512
  const bytesPerPixel = getTextureChannelCount(texture) * getTextureBytesPerChannel(texture)
  const mipFactor = textureUsesMipmaps(texture) ? 4 / 3 : 1

  return {
    bytes: width * height * bytesPerPixel * mipFactor,
  }
}

function collectMaterialTextures(material: THREE.Material) {
  const materialRecord = material as THREE.Material & Partial<Record<(typeof MATERIAL_TEXTURE_SLOTS)[number], THREE.Texture | null>>
  const textures: THREE.Texture[] = []

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    const texture = materialRecord[slot]
    if (texture?.isTexture) {
      textures.push(texture)
    }
  })

  return textures
}

function getAttributeMemoryBytes(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
    const interleavedAttribute = attribute as THREE.InterleavedBufferAttribute
    return interleavedAttribute.data.array.byteLength
  }

  return (attribute as THREE.BufferAttribute).array.byteLength
}

function getGeometryMemoryBytes(geometry: THREE.BufferGeometry) {
  const buffers = new Set<ArrayBufferLike>()
  let bytes = 0

  Object.values(geometry.attributes).forEach((attribute) => {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      const array = (attribute as THREE.InterleavedBufferAttribute).data.array
      if (!buffers.has(array.buffer)) {
        buffers.add(array.buffer)
        bytes += array.byteLength
      }
      return
    }

    const array = (attribute as THREE.BufferAttribute).array
    if (!buffers.has(array.buffer)) {
      buffers.add(array.buffer)
      bytes += array.byteLength
    }
  })

  Object.values(geometry.morphAttributes).forEach((attributes) => {
    attributes.forEach((attribute) => {
      bytes += getAttributeMemoryBytes(attribute)
    })
  })

  if (geometry.index) {
    bytes += geometry.index.array.byteLength
  }

  return bytes
}

function collectSceneGpuStats(state: ReturnType<typeof useEditorStore.getState>) {
  const textures = new Map<string, TextureMemoryInfo>()
  const imageKeys = new WeakMap<object, string>()
  const nextImageKey = { current: 0 }
  const geometries = new Set<string>()
  let geometryBytes = 0
  const addTexture = (texture: THREE.Texture | null | undefined) => {
    if (!texture?.isTexture) {
      return
    }
    textures.set(getTextureMemoryKey(texture, imageKeys, nextImageKey), getTextureMemoryInfo(texture))
  }

  Object.values(state.runtime.materialById).forEach((material) => {
    collectMaterialTextures(material).forEach(addTexture)
  })

  addTexture(state.runtimeTextures.atlasTexture)
  addTexture(state.runtimeTextures.atlasFrameTexture)
  addTexture(state.runtimeTextures.environmentMap)
  addTexture(state.runtimeTextures.environmentBackground)
  Object.values(state.runtimeTextures.materialEnvironmentMaps).forEach(addTexture)

  state.rootNodeIds.forEach((rootNodeId) => {
    const root = state.runtime.objectById[rootNodeId] ?? null
    root?.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) {
        return
      }

      const geometry = (object as THREE.Mesh).geometry
      if (!geometry || geometries.has(geometry.uuid)) {
        return
      }

      geometries.add(geometry.uuid)
      geometryBytes += getGeometryMemoryBytes(geometry)
    })
  })

  const textureBytes = Array.from(textures.values()).reduce((sum, texture) => sum + texture.bytes, 0)
  const width = typeof window === 'undefined' ? 0 : window.innerWidth * window.devicePixelRatio
  const height = typeof window === 'undefined' ? 0 : window.innerHeight * window.devicePixelRatio
  const postProcessingBytes = state.hud.postEffectsEnabled && state.hud.postEffectsVisible ? width * height * 4 * 3 : 0
  const bytes = textureBytes + geometryBytes + postProcessingBytes

  return {
    count: textures.size,
    geometryCount: geometries.size,
    mb: bytes / (1024 * 1024),
  }
}

function getGeometryStats(object: THREE.Object3D | null): GeometryStats {
  if (!object) {
    return { vertices: 0, triangles: 0, drawCalls: 0, geometryBytes: 0 }
  }

  let vertices = 0
  let triangles = 0
  let drawCalls = 0
  let geometryBytes = 0
  const geometries = new Set<string>()

  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry
    const position = geometry?.getAttribute('position')
    if (!position) {
      return
    }

    vertices += position.count
    triangles += geometry.index ? geometry.index.count / 3 : position.count / 3
    drawCalls += getMeshDrawCallCount(mesh)
    if (!geometries.has(geometry.uuid)) {
      geometries.add(geometry.uuid)
      geometryBytes += getGeometryMemoryBytes(geometry)
    }
  })

  return {
    vertices: Math.round(vertices),
    triangles: Math.round(triangles),
    drawCalls,
    geometryBytes,
  }
}

function CameraBridge({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree()
  const viewer = useEditorStore((state) => state.viewer)

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    perspectiveCamera.position.set(...viewer.cameraPosition)
    applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)
  }, [camera, viewer.cameraPosition, viewer.focalLength])

  return <ViewerSync controlsRef={controlsRef} />
}

function RendererBridge({ transparentBackground = false }: { transparentBackground?: boolean }) {
  const { gl } = useThree()
  const exposure = useEditorStore((state) => state.viewer.exposure)

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.setClearColor(0x000000, transparentBackground ? 0 : 1)
  }, [exposure, gl, transparentBackground])

  return null
}

function TransparentCanvasController() {
  const { gl, scene } = useThree()

  useEffect(() => {
    gl.domElement.style.background = 'transparent'
    scene.background = null
    gl.setClearColor(0x000000, 0)
  }, [gl, scene])

  useFrame(() => {
    scene.background = null
    scene.backgroundBlurriness = 0
    scene.backgroundIntensity = 1
    gl.setClearColor(0x000000, 0)
  }, 1000)

  return null
}

function SceneBridge({ allowSelection }: { allowSelection: boolean }) {
  const loadedModels = useEditorStore((state) => state.loadedModels)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const roots = useMemo(
    () =>
      loadedModels
        .map((model) => ({
          rootNodeId: model.rootNodeId,
          root: runtimeObjectById[model.rootNodeId] ?? null,
        }))
        .filter((entry): entry is { rootNodeId: string; root: THREE.Object3D } => Boolean(entry.root)),
    [loadedModels, runtimeObjectById],
  )

  if (!loadedModels.length || !roots.length) {
    return null
  }

  return (
    <>
      {roots.map((entry) =>
        entry.root ? <LoadedSceneRoot key={entry.rootNodeId} root={entry.root} selectable={allowSelection} /> : null,
      )}
    </>
  )
}

function SelectionHighlight() {
  const scene = useThree((state) => state.scene)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const helper = useMemo(() => {
    const nextHelper = new THREE.BoxHelper(new THREE.Object3D(), '#7fd0ff')
    nextHelper.visible = false
    nextHelper.raycast = () => null
    return nextHelper
  }, [])

  useEffect(() => {
    scene.add(helper)
    return () => {
      scene.remove(helper)
      helper.geometry.dispose()
      ;(helper.material as THREE.Material).dispose()
    }
  }, [helper, scene])

  useFrame(() => {
    if (!selectedObjectId || !selectedObject) {
      helper.visible = false
      return
    }

    helper.visible = true
    helper.setFromObject(selectedObject)
    helper.updateMatrixWorld(true)
  })

  return null
}

function AnchorHandles() {
  const { camera, size } = useThree()
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )
  const object = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const selectedAnchorIndex = useEditorStore((state) => state.selectedAnchorIndex)
  const setSelectedAnchorIndex = useEditorStore((state) => state.setSelectedAnchorIndex)
  const tempBox = useMemo(() => new THREE.Box3(), [])
  const tempSphere = useMemo(() => new THREE.Sphere(), [])
  const corners = useMemo(() => Array.from({ length: 8 }, () => new THREE.Vector3()), [])
  const handleRefs = useRef<Array<THREE.Group | null>>([])
  const [hoveredAnchorIndex, setHoveredAnchorIndex] = useState<number | null>(null)
  const perspectiveCamera = camera as THREE.PerspectiveCamera

  useFrame(() => {
    if (!anchorModeEnabled || !selectedObjectId || !selectedNode || selectedNode.type === 'material' || !object) {
      return
    }

    object.updateWorldMatrix(true, true)
    tempBox.setFromObject(object)
    if (tempBox.isEmpty()) {
      return
    }

    writeBoundingBoxCorners(tempBox, corners)
    tempBox.getBoundingSphere(tempSphere)

    const verticalFovRadians = THREE.MathUtils.degToRad(
      perspectiveCamera.isPerspectiveCamera ? perspectiveCamera.fov : DEFAULT_VIEWER_CAMERA_FOV,
    )
    const viewportHeight = Math.max(size.height, 1)
    const minHandleRadius = Math.max(tempSphere.radius * 0.015, 0.006)
    const maxHandleRadius = Math.max(tempSphere.radius * 0.06, minHandleRadius)

    corners.forEach((corner, index) => {
      const handle = handleRefs.current[index]
      if (!handle) {
        return
      }

      handle.position.copy(corner)
      const distanceToCamera = corner.distanceTo(camera.position)
      const worldUnitsPerPixel = (2 * Math.tan(verticalFovRadians / 2) * distanceToCamera) / viewportHeight
      const desiredRadius = worldUnitsPerPixel * 7
      const clampedRadius = THREE.MathUtils.clamp(desiredRadius, minHandleRadius, maxHandleRadius)
      const isActive = selectedAnchorIndex === index
      const isHovered = hoveredAnchorIndex === index
      const visualScale = isActive ? 1.38 : isHovered ? 1.18 : 1
      handle.scale.setScalar(clampedRadius)
      handle.scale.multiplyScalar(visualScale)
    })
  }, -1)

  if (!anchorModeEnabled || !selectedObjectId || !selectedNode || selectedNode.type === 'material' || !object) {
    return null
  }

  object.updateWorldMatrix(true, true)
  tempBox.setFromObject(object)
  if (tempBox.isEmpty()) {
    return null
  }

  writeBoundingBoxCorners(tempBox, corners)

  return (
    <group>
      {corners.map((corner, index) => {
        const isActive = selectedAnchorIndex === index
        const isHovered = hoveredAnchorIndex === index
        const baseColor = isActive ? ANCHOR_HANDLE_ACTIVE_COLOR : isHovered ? ANCHOR_HANDLE_HOVER_COLOR : ANCHOR_HANDLE_COLOR

        return (
          <group
            key={`anchor-${index}`}
            ref={(node) => {
              handleRefs.current[index] = node
            }}
            position={corner}
            onPointerOver={(event) => {
              event.stopPropagation()
              setHoveredAnchorIndex(index)
            }}
            onPointerOut={(event) => {
              event.stopPropagation()
              setHoveredAnchorIndex((current) => (current === index ? null : current))
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
              setSelectedAnchorIndex(index)
            }}
          >
            {isActive || isHovered ? (
              <mesh>
                <sphereGeometry args={[1.55, 18, 18]} />
                <meshBasicMaterial
                  color={isActive ? ANCHOR_HANDLE_ACTIVE_GLOW_COLOR : ANCHOR_HANDLE_HOVER_COLOR}
                  transparent
                  opacity={isActive ? 0.34 : 0.2}
                  depthTest={false}
                  toneMapped={false}
                />
              </mesh>
            ) : null}
            <mesh>
              <sphereGeometry args={[1, 18, 18]} />
              <meshBasicMaterial
                color={baseColor}
                transparent
                opacity={isActive ? 1 : isHovered ? 0.94 : 0.78}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function TransformGizmo({ onDraggingChange }: { onDraggingChange: (value: boolean) => void }) {
  const scene = useThree((state) => state.scene)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )
  const rootNodeIds = useEditorStore((state) => state.rootNodeIds)
  const object = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const transformMode = useEditorStore((state) => state.hud.transformMode)
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const selectedAnchorIndex = useEditorStore((state) => state.selectedAnchorIndex)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const canRotate = selectedNode?.type !== 'light'
  const pivotObject = useMemo(() => new THREE.Object3D(), [])
  const previousPivotStateRef = useRef<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
  } | null>(null)
  const isDraggingRef = useRef(false)
  const tempBox = useMemo(() => new THREE.Box3(), [])
  const tempCenter = useMemo(() => new THREE.Vector3(), [])
  const tempObjectWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const tempObjectWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentWorldScale = useMemo(() => new THREE.Vector3(), [])
  const tempNextWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const tempPositionOffset = useMemo(() => new THREE.Vector3(), [])
  const tempDeltaQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempInversePreviousQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentInverseQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const tempLocalPosition = useMemo(() => new THREE.Vector3(), [])
  const tempWorldScale = useMemo(() => new THREE.Vector3(), [])
  const anchorCorners = useMemo(() => Array.from({ length: 8 }, () => new THREE.Vector3()), [])
  const isRootSelection = Boolean(selectedObjectId && rootNodeIds.includes(selectedObjectId))
  const hasSelectedAnchor = anchorModeEnabled && selectedAnchorIndex !== null && selectedAnchorIndex >= 0 && selectedAnchorIndex < 8
  const usesRootPivot = isRootSelection && transformMode === 'rotate'
  const usesAnchorPivot = hasSelectedAnchor
  const usesCustomPivot = usesRootPivot || usesAnchorPivot

  useEffect(() => {
    pivotObject.visible = false
    scene.add(pivotObject)

    return () => {
      scene.remove(pivotObject)
    }
  }, [pivotObject, scene])
  const translationSnapValue =
    transformSettings.isGridSnapping
      ? transformSettings.gridSize > 0
        ? transformSettings.gridSize
        : transformSettings.translationStep > 0
          ? transformSettings.translationStep
          : undefined
      : undefined
  const canRender =
    transformMode !== 'none' &&
    Boolean(selectedObjectId && selectedNode && selectedNode.type !== 'material' && object) &&
    cameraMode === 'orbit' &&
    !(transformMode === 'rotate' && !canRotate)

  const syncTransform = () => {
    if (!selectedObjectId || !selectedNode || !object) {
      return
    }

    syncRuntimeObjectTransform({
      selectedObjectId,
      selectedNode,
      runtimeObject: object,
      updateObjectTransform,
      updateExtraLight,
    })

    const lightWithTarget = object as THREE.Object3D & { target?: { updateMatrixWorld: () => void } }
    lightWithTarget.target?.updateMatrixWorld()
  }

  useEffect(() => {
    if (!canRender || !usesCustomPivot || isDraggingRef.current || !object) {
      return
    }

    object.updateWorldMatrix(true, true)
    if (usesAnchorPivot) {
      tempBox.setFromObject(object)
      if (tempBox.isEmpty()) {
        object.getWorldPosition(tempCenter)
      } else {
        writeBoundingBoxCorners(tempBox, anchorCorners)
        tempCenter.copy(anchorCorners[selectedAnchorIndex ?? 0])
      }
    } else {
      tempBox.setFromObject(object)
      if (tempBox.isEmpty()) {
        object.getWorldPosition(tempCenter)
      } else {
        tempBox.getCenter(tempCenter)
      }
    }

    object.getWorldQuaternion(tempObjectWorldQuaternion)
    pivotObject.position.copy(tempCenter)
    pivotObject.quaternion.copy(tempObjectWorldQuaternion)
    pivotObject.scale.set(1, 1, 1)
    pivotObject.updateMatrixWorld(true)
    previousPivotStateRef.current = {
      position: pivotObject.position.clone(),
      quaternion: pivotObject.quaternion.clone(),
    }
  }, [
    anchorCorners,
    usesRootPivot,
    usesAnchorPivot,
    usesCustomPivot,
    object,
    pivotObject,
    rootNodeIds,
    selectedObjectId,
    selectedAnchorIndex,
    tempBox,
    tempCenter,
    tempObjectWorldQuaternion,
    canRender,
  ])

  const applyPivotDelta = () => {
    if (!object) {
      return
    }

    const previous = previousPivotStateRef.current
    if (!previous) {
      previousPivotStateRef.current = {
        position: pivotObject.position.clone(),
        quaternion: pivotObject.quaternion.clone(),
      }
      return
    }

    object.updateWorldMatrix(true, true)
    object.getWorldPosition(tempObjectWorldPosition)
    object.getWorldQuaternion(tempObjectWorldQuaternion)
    object.getWorldScale(tempWorldScale)

    if (transformMode === 'translate') {
      tempPositionOffset.copy(pivotObject.position).sub(previous.position)
      tempNextWorldPosition.copy(tempObjectWorldPosition).add(tempPositionOffset)

      const parent = object.parent
      if (parent) {
        parent.updateWorldMatrix(true, true)
        parent.getWorldQuaternion(tempParentWorldQuaternion)
        parent.getWorldPosition(tempParentWorldPosition)
        parent.getWorldScale(tempParentWorldScale)
        tempParentInverseQuaternion.copy(tempParentWorldQuaternion).invert()
        tempLocalPosition.copy(tempNextWorldPosition).sub(tempParentWorldPosition)
        tempLocalPosition.applyQuaternion(tempParentInverseQuaternion)
        tempLocalPosition.divide(tempParentWorldScale)
        object.position.copy(tempLocalPosition)
      } else {
        object.position.copy(tempNextWorldPosition)
      }

      object.updateMatrixWorld(true)
      previousPivotStateRef.current = {
        position: pivotObject.position.clone(),
        quaternion: pivotObject.quaternion.clone(),
      }
      return
    }

    tempInversePreviousQuaternion.copy(previous.quaternion).invert()
    tempDeltaQuaternion.copy(pivotObject.quaternion).multiply(tempInversePreviousQuaternion)
    tempPositionOffset.copy(tempObjectWorldPosition).sub(previous.position).applyQuaternion(tempDeltaQuaternion)
    tempNextWorldPosition.copy(pivotObject.position).add(tempPositionOffset)

    const parent = object.parent
    if (parent) {
      parent.updateWorldMatrix(true, true)
      parent.getWorldQuaternion(tempParentWorldQuaternion)
      parent.getWorldPosition(tempParentWorldPosition)
      parent.getWorldScale(tempParentWorldScale)
      tempParentInverseQuaternion.copy(tempParentWorldQuaternion).invert()
      tempLocalPosition.copy(tempNextWorldPosition).sub(tempParentWorldPosition)
      tempLocalPosition.applyQuaternion(tempParentInverseQuaternion)
      tempLocalPosition.divide(tempParentWorldScale)
      object.position.copy(tempLocalPosition)
      object.quaternion.copy(tempParentInverseQuaternion.multiply(tempDeltaQuaternion).multiply(tempObjectWorldQuaternion))
    } else {
      object.position.copy(tempNextWorldPosition)
      object.quaternion.copy(tempDeltaQuaternion.multiply(tempObjectWorldQuaternion))
    }

    object.updateMatrixWorld(true)
    previousPivotStateRef.current = {
      position: pivotObject.position.clone(),
      quaternion: pivotObject.quaternion.clone(),
    }
  }

  if (!canRender || !object) {
    return null
  }

  const gizmoObject = usesCustomPivot ? pivotObject : object

  return (
    <TransformControls
      object={gizmoObject}
      mode={transformMode}
      translationSnap={translationSnapValue}
      rotationSnap={
        transformSettings.rotationStep > 0 ? THREE.MathUtils.degToRad(transformSettings.rotationStep) : undefined
      }
      onObjectChange={() => {
        if (usesCustomPivot) {
          applyPivotDelta()
        }
        syncTransform()
      }}
      onMouseDown={() => {
        beginHistoryGesture()
        isDraggingRef.current = true
        if (usesCustomPivot) {
          previousPivotStateRef.current = {
            position: pivotObject.position.clone(),
            quaternion: pivotObject.quaternion.clone(),
          }
        }
        onDraggingChange(true)
      }}
      onMouseUp={() => {
        if (usesCustomPivot) {
          applyPivotDelta()
        }
        syncTransform()
        isDraggingRef.current = false
        if (usesCustomPivot) {
          previousPivotStateRef.current = {
            position: pivotObject.position.clone(),
            quaternion: pivotObject.quaternion.clone(),
          }
        }
        onDraggingChange(false)
        endHistoryGesture()
      }}
    />
  )
}

function PerformanceProbe({
  onSample,
}: {
  onSample: (sample: PerformanceSnapshot) => void
}) {
  const rootNodeIds = useEditorStore((state) => state.rootNodeIds)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const roots = useMemo(
    () =>
      rootNodeIds
        .map((rootNodeId) => runtimeObjectById[rootNodeId] ?? null)
        .filter((root): root is THREE.Object3D => Boolean(root)),
    [rootNodeIds, runtimeObjectById],
  )
  const fpsWindowRef = useRef({ lastTime: 0, frames: 0, fps: 0 })
  const lastSampleRef = useRef(0)

  useFrame((state) => {
    fpsWindowRef.current.frames += 1
    if (state.clock.elapsedTime - fpsWindowRef.current.lastTime >= 1) {
      fpsWindowRef.current.fps =
        fpsWindowRef.current.frames /
        Math.max(state.clock.elapsedTime - fpsWindowRef.current.lastTime, 0.0001)
      fpsWindowRef.current.frames = 0
      fpsWindowRef.current.lastTime = state.clock.elapsedTime
    }

    if (state.clock.elapsedTime - lastSampleRef.current < 0.2) {
      return
    }

    lastSampleRef.current = state.clock.elapsedTime
    const totalStats = roots.reduce(
      (accumulator, root) => {
        const nextStats = getGeometryStats(root)
        return {
          vertices: accumulator.vertices + nextStats.vertices,
          triangles: accumulator.triangles + nextStats.triangles,
          drawCalls: accumulator.drawCalls + nextStats.drawCalls,
        }
      },
      { vertices: 0, triangles: 0, drawCalls: 0 },
    )
    onSample({
      fps: Math.round(fpsWindowRef.current.fps),
      triangles: totalStats.triangles,
      vertices: totalStats.vertices,
      drawCalls: totalStats.drawCalls,
    })
  })

  return null
}

function ViewportScene({
  onStats,
  registerResetCamera,
  onTransformDraggingChange,
  transformDragging,
  allowSelection,
  autoFrameOnLoad,
  transparentBackground,
}: {
  onStats: (stats: PerformanceSnapshot) => void
  registerResetCamera: (handler: () => void) => void
  onTransformDraggingChange: (value: boolean) => void
  transformDragging: boolean
  allowSelection: boolean
  autoFrameOnLoad: boolean
  transparentBackground: boolean
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera, size } = useThree()
  const viewer = useEditorStore((state) => state.viewer)
  const hud = useEditorStore((state) => state.hud)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const gridSize = useEditorStore((state) => state.transformSettings.gridSize)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
  )
  const autoFramedRootIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (viewer.cameraMode !== 'firstPerson') {
      return
    }

    useEditorStore.getState().setHud({ orbitEnabled: false })
    useEditorStore.getState().setViewer({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
    })
  }, [camera, viewer.cameraMode])

  useEffect(() => {
    if (!autoFrameOnLoad) {
      return
    }

    if (!rootNodeId || !root || autoFramedRootIdRef.current === rootNodeId) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      perspectiveCamera.aspect = size.width / Math.max(size.height, 1)
      applyViewerCameraOptics(perspectiveCamera, DEFAULT_VIEWER_FOCAL_LENGTH)
      const framed = fitCameraToObject(perspectiveCamera, controlsRef.current, root)

      autoFramedRootIdRef.current = rootNodeId
      useEditorStore.getState().setHud({ orbitEnabled: true })
      useEditorStore.getState().setViewer(
        framed
          ? {
              cameraMode: 'orbit',
              focalLength: DEFAULT_VIEWER_FOCAL_LENGTH,
              resetCameraPosition: [framed.position.x, framed.position.y, framed.position.z],
              resetOrbitTarget: [framed.target.x, framed.target.y, framed.target.z],
            }
          : {
              cameraMode: 'orbit',
              focalLength: DEFAULT_VIEWER_FOCAL_LENGTH,
            },
      )
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [autoFrameOnLoad, camera, root, rootNodeId, size.height, size.width])

  useEffect(() => {
    registerResetCamera(() => {
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)
      applyCameraFrame(perspectiveCamera, controlsRef.current, {
        position: new THREE.Vector3(...viewer.resetCameraPosition),
        target: new THREE.Vector3(...viewer.resetOrbitTarget),
        distance: new THREE.Vector3(...viewer.resetCameraPosition).distanceTo(new THREE.Vector3(...viewer.resetOrbitTarget)),
        radius: 0,
      })
      useEditorStore.getState().setHud({ orbitEnabled: true })
      useEditorStore.getState().setViewer({ cameraMode: 'orbit' })
    })

    return () => {
      registerResetCamera(() => {})
    }
  }, [camera, registerResetCamera, viewer.focalLength, viewer.resetCameraPosition, viewer.resetOrbitTarget])

  return (
    <>
      <RendererBridge transparentBackground={transparentBackground} />
      {transparentBackground ? <TransparentCanvasController /> : null}
      <CameraBridge controlsRef={controlsRef} />
      <PerformanceProbe onSample={onStats} />
      <Suspense fallback={null}>
        <EnvironmentManager />
        <LightRig />
        <SceneBridge allowSelection={allowSelection} />
        {allowSelection ? <SelectionHighlight /> : null}
        {allowSelection ? <AnchorHandles /> : null}
        {allowSelection ? <TransformGizmo onDraggingChange={onTransformDraggingChange} /> : null}
        <MaterialEffectController />
        <SceneAnimationController />
        {hud.postEffectsEnabled && hud.postEffectsVisible ? <PostEffects /> : null}
      </Suspense>
      {hud.gridVisible ? (
        <Grid
          args={[20, 20]}
          position={[0, -0.002, 0]}
          cellColor={VIEWPORT_GRID_CELL_COLOR}
          sectionColor={VIEWPORT_GRID_SECTION_COLOR}
          fadeDistance={22}
          fadeStrength={1.3}
          cellSize={Math.max(gridSize, 0.0001)}
          sectionSize={Math.max(gridSize * 5, 0.0005)}
          infiniteGrid={false}
        />
      ) : null}
      {hud.axesVisible ? <axesHelper args={[2]} /> : null}
      {viewer.cameraMode === 'orbit' ? (
        <OrbitControls ref={controlsRef} enabled={hud.orbitEnabled && !transformDragging} makeDefault />
      ) : null}
      <FlightController />
    </>
  )
}

function PerformanceStats() {
  const performanceStatsVisible = useEditorStore((state) => state.hud.performanceStatsVisible)
  const setHud = useEditorStore((state) => state.setHud)
  const metrics = useEditorStore((state) => state.viewportMetrics)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )
  const selectedObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const selectedMeshStats = selectedNode?.type === 'mesh' ? getGeometryStats(selectedObject) : null
  const selectedColumnLabel = selectedNode?.type === 'mesh' ? selectedNode.label || selectedObjectId || 'MESH' : 'NONE'
  const assets = useEditorStore((state) => state.assets)
  const sceneTextureStatsLabel = useEditorStore((state) => {
    const stats = collectSceneGpuStats(state)
    return `${stats.mb.toFixed(1)} MB`
  })

  return (
    <div className={`performance-stats-wrap${performanceStatsVisible ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`performance-stats__toggle${performanceStatsVisible ? ' is-open' : ''}`}
        aria-label={performanceStatsVisible ? 'Hide statistics' : 'Show statistics'}
        title={performanceStatsVisible ? 'Hide statistics' : 'Show statistics'}
        onClick={() => setHud({ performanceStatsVisible: !performanceStatsVisible })}
      >
        ˅
      </button>
      {performanceStatsVisible ? (
        <div className="performance-stats">
          <div className="performance-stats__row performance-stats__row--header">
            <span />
            <span>TOTAL</span>
            <span title={selectedColumnLabel}>{selectedColumnLabel}</span>
          </div>
          <div className="performance-stats__row">
            <span>VERTICES</span>
            <strong>{metrics.vertices.toLocaleString('en-US')}</strong>
            <strong>{(selectedMeshStats?.vertices ?? 0).toLocaleString('en-US')}</strong>
          </div>
          <div className="performance-stats__row">
            <span>TRIANGLES</span>
            <strong>{metrics.triangles.toLocaleString('en-US')}</strong>
            <strong>{(selectedMeshStats?.triangles ?? 0).toLocaleString('en-US')}</strong>
          </div>
          <div className="performance-stats__spacer" />
          <div className="performance-stats__row">
            <span>VRAM SCENE</span>
            <strong>{sceneTextureStatsLabel}</strong>
            <strong />
          </div>
          <div className="performance-stats__row">
            <span>DISK</span>
            <strong>{assets.fileSize ? `${(assets.fileSize / 1024 / 1024).toFixed(1)} MB` : '--'}</strong>
            <strong />
          </div>
          <div className="performance-stats__row">
            <span>DRAW CALLS</span>
            <strong>{metrics.drawCalls.toLocaleString('en-US')}</strong>
            <strong />
          </div>
          <div className="performance-stats__row">
            <span>FPS</span>
            <strong>{metrics.fps.toLocaleString('en-US')}</strong>
            <strong />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function Viewport({
  showChrome = true,
  allowSelection = true,
  enforceFrameAspect = false,
  autoFrameOnLoad = true,
  transparentBackground = false,
}: {
  showChrome?: boolean
  allowSelection?: boolean
  enforceFrameAspect?: boolean
  autoFrameOnLoad?: boolean
  transparentBackground?: boolean
}) {
  const hud = useEditorStore((state) => state.hud)
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const backgroundMode = useEditorStore((state) => state.backgroundMode)
  const backgroundColor = useEditorStore((state) => state.backgroundColor)
  const currentEnvMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const currentBackgroundMap = useEditorStore((state) => state.runtimeTextures.environmentBackground)
  const viewer = useEditorStore((state) => state.viewer)
  const setHud = useEditorStore((state) => state.setHud)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setZenMode = useEditorStore((state) => state.setZenMode)
  const setViewportMetrics = useEditorStore((state) => state.setViewportMetrics)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const containerRef = useRef<HTMLElement | null>(null)
  const resetCameraRef = useRef<() => void>(() => {})
  const [metricTextPalette, setMetricTextPalette] = useState(LIGHT_METRIC_TEXT)
  const [isTransformDragging, setIsTransformDragging] = useState(false)
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 })
  const frameAspect = FRAME_ASPECT_VALUES[viewer.frameAspectPreset] ?? 1
  const frameRect = useMemo(
    () => getViewportFrameRect(containerSize.width, containerSize.height, frameAspect),
    [containerSize.height, containerSize.width, frameAspect],
  )
  const frameStyle = useMemo(
    () =>
      ({
        left: `${frameRect.left}px`,
        top: `${frameRect.top}px`,
        width: `${frameRect.width}px`,
        height: `${frameRect.height}px`,
      }) as CSSProperties,
    [frameRect.height, frameRect.left, frameRect.top, frameRect.width],
  )

  const viewportStyle = useMemo(
    () =>
      ({
        '--viewport-grid-cell-color': VIEWPORT_GRID_CELL_COLOR,
        '--viewport-grid-section-color': VIEWPORT_GRID_SECTION_COLOR,
        '--viewport-grid-text-color': metricTextPalette.primary,
        '--viewport-grid-text-muted-color': metricTextPalette.muted,
      }) as CSSProperties & Record<string, string>,
    [metricTextPalette],
  )

  useEffect(() => {
    setIsTransformDragging(false)
  }, [selectedObjectId, viewer.cameraMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const updateSize = () => {
      const bounds = container.getBoundingClientRect()
      setContainerSize({
        width: Math.max(Math.round(bounds.width), 1),
        height: Math.max(Math.round(bounds.height), 1),
      })
    }

    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') {
        return
      }

      const state = useEditorStore.getState()
      if (consumeFlightUnlockForEscape()) {
        event.stopPropagation()
        event.preventDefault()
        if (state.isZenMode && !document.fullscreenElement) {
          setZenMode(true)
          void document.documentElement.requestFullscreen().catch(() => {
            setZenMode(false)
          })
        }
        return
      }

      if (state.viewer.cameraMode === 'firstPerson') {
        event.stopPropagation()
        event.preventDefault()
        const shouldRestoreFullscreen = state.isZenMode || Boolean(document.fullscreenElement)
        if (shouldRestoreFullscreen) {
          markFlightUnlockForEscape()
        }
        setHud({ orbitEnabled: true })
        state.setViewer({ cameraMode: 'orbit' })
        void document.exitPointerLock()
        if (shouldRestoreFullscreen && !document.fullscreenElement) {
          setZenMode(true)
          void document.documentElement.requestFullscreen().catch(() => {
            setZenMode(false)
          })
        }
        return
      }

      if (state.viewer.cameraMode === 'orbit') {
        if (document.fullscreenElement) {
          setZenMode(false)
          void document.exitFullscreen()
          return
        }

        state.setSelectedObjectId(null)
        state.setHud({ transformMode: 'none' })
      }
    }

    window.addEventListener('keydown', handleEscape, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [setHud, setZenMode])

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        if (consumeFlightUnlockFullscreenRestore()) {
          setZenMode(true)
          void document.documentElement.requestFullscreen().catch(() => {
            setZenMode(false)
          })
          return
        }

        setZenMode(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [setZenMode])

  useEffect(() => {
    let disposed = false

    const updateMetricContrast = async () => {
      if (backgroundMode === 'none') {
        setMetricTextPalette(LIGHT_METRIC_TEXT)
        return
      }

      if (backgroundMode === 'color') {
        setMetricTextPalette(getMetricTextPalette(getLuminanceFromHex(backgroundColor)))
        return
      }

      const texture = backgroundMode === 'hdri' ? currentEnvMap : currentBackgroundMap
      if (!texture) {
        setMetricTextPalette(LIGHT_METRIC_TEXT)
        return
      }

      const luminance = await sampleTextureLuminance(texture)
      if (disposed) {
        return
      }

      setMetricTextPalette(getMetricTextPalette(luminance ?? 0))
    }

    void updateMetricContrast()

    return () => {
      disposed = true
    }
  }, [backgroundColor, backgroundMode, currentBackgroundMap, currentEnvMap])

  return (
    <main
      ref={containerRef}
      className={`viewport-wrap${transparentBackground ? ' viewport-wrap--transparent' : ''}`}
      style={viewportStyle}
    >
      {enforceFrameAspect ? (
        <div className="viewport-stage" style={frameStyle}>
          <Canvas
            className="viewport-canvas"
            dpr={[1, 2]}
            gl={{ alpha: true, antialias: true }}
            camera={{
              position: viewer.cameraPosition,
              fov: DEFAULT_VIEWER_CAMERA_FOV,
              near: 0.1,
              far: 2000,
            }}
            onPointerMissed={() => {
              if (!allowSelection) {
                return
              }
              setSelectedObjectId(null)
              setHud({ transformMode: 'none' })
            }}
          >
            <ViewportScene
              allowSelection={allowSelection}
              autoFrameOnLoad={autoFrameOnLoad}
              onStats={setViewportMetrics}
              onTransformDraggingChange={setIsTransformDragging}
              transparentBackground={transparentBackground}
              transformDragging={isTransformDragging}
              registerResetCamera={(handler) => {
                resetCameraRef.current = handler
              }}
            />
          </Canvas>
        </div>
      ) : (
        <Canvas
          className="viewport-canvas"
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          camera={{
            position: viewer.cameraPosition,
            fov: DEFAULT_VIEWER_CAMERA_FOV,
            near: 0.1,
            far: 2000,
          }}
          onPointerMissed={() => {
            if (!allowSelection) {
              return
            }
            setSelectedObjectId(null)
            setHud({ transformMode: 'none' })
          }}
        >
          <ViewportScene
            allowSelection={allowSelection}
            autoFrameOnLoad={autoFrameOnLoad}
            onStats={setViewportMetrics}
            onTransformDraggingChange={setIsTransformDragging}
            transparentBackground={transparentBackground}
            transformDragging={isTransformDragging}
            registerResetCamera={(handler) => {
              resetCameraRef.current = handler
            }}
          />
        </Canvas>
      )}
      {!enforceFrameAspect && viewer.frameGuidesEnabled ? (
        <>
          <div className="viewport-frame-mask viewport-frame-mask--top" style={{ height: `${frameRect.top}px` }} />
          <div
            className="viewport-frame-mask viewport-frame-mask--bottom"
            style={{ height: `${frameRect.top}px` }}
          />
          <div
            className="viewport-frame-mask viewport-frame-mask--left"
            style={{
              top: `${frameRect.top}px`,
              width: `${frameRect.left}px`,
              height: `${frameRect.height}px`,
            }}
          />
          <div
            className="viewport-frame-mask viewport-frame-mask--right"
            style={{
              top: `${frameRect.top}px`,
              width: `${frameRect.left}px`,
              height: `${frameRect.height}px`,
            }}
          />
          <div className="viewport-frame-guide" style={frameStyle} />
        </>
      ) : null}
      {showChrome ? <TransformToolbar /> : null}
      {showChrome ? <PerformanceStats /> : null}
      {showChrome ? <ViewportHud onResetCamera={() => resetCameraRef.current()} /> : null}
      {!isZenMode && showChrome ? (
        <div className="viewport-toggle-bar">
          {!hud.sidebarVisible ? (
            <button type="button" className="ghost small" onClick={() => setHud({ sidebarVisible: true })}>
              Show sidebar
            </button>
          ) : null}
          {!hud.inspectorVisible ? (
            <button type="button" className="ghost small" onClick={() => setHud({ inspectorVisible: true })}>
              Show inspector
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
