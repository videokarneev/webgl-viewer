import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { CustomSceneBoxes } from '../features/scene/runtime/CustomSceneBoxes'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { ShowcaseInteractionController } from '../features/scene/runtime/ShowcaseInteractionController'
import { applyCameraFrame, applyViewerCameraOptics, fitCameraToObject } from '../features/scene/runtime/shared'
import { useShowcaseMotionSensor } from '../features/scene/runtime/useShowcaseMotionSensor'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import {
  DEFAULT_VIEWER_CAMERA_FOV,
  DEFAULT_VIEWER_FOCAL_LENGTH,
  getGodRaysDirectionArrowId,
  getGodRaysStoredDirectionFromArrowObject,
  getStencilVolumeEndHandleId,
  type FrameAspectPreset,
  useEditorStore,
} from '../store/editorStore'
import { MaterialEffectController } from './MaterialEffectController'
import { SceneAnimationController } from './SceneAnimationController'
import { TransformToolbar } from './TransformToolbar'
import { ViewportHud } from './ViewportHud'
import { WEB_PUBLISH_STATUS_EVENT, type WebPublishDeploymentStatus } from '../features/publish/exportWebPackage'
import { GodRaysBoxes } from './viewport/effects/GodRaysBoxes'
import { StencilVolumes } from './viewport/effects/StencilVolumes'
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

function supportsGyroShowcaseInput(mode: string) {
  return mode === 'gyro' || mode === 'mouse+gyro'
}
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
const EDITOR_CLEAR_COLOR = 0x0d1116
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
const FRAME_ASPECT_VALUES: Record<Exclude<FrameAspectPreset, 'auto'>, number> = {
  '1:1': 1,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
  '9:16': 9 / 16,
}

function getFrameAspectValue(preset: FrameAspectPreset, fallbackAspect: number) {
  if (preset === 'auto') {
    return Math.max(fallbackAspect, 0.0001)
  }

  return FRAME_ASPECT_VALUES[preset] ?? Math.max(fallbackAspect, 0.0001)
}

function buildIframeEmbedCode(url: string) {
  return `<iframe src="${url}" width="100%" height="700" style="border:0;" allow="autoplay; fullscreen; accelerometer; gyroscope; magnetometer"></iframe>`
}

function buildPublishedPlayerUrl(sceneUrl: string, deployOrigin: string) {
  const normalizedOrigin = deployOrigin.replace(/\/+$/, '')
  const params = new URLSearchParams()
  params.set('player', '1')
  params.set('scene', sceneUrl)
  params.set('transparent', '1')
  return `${normalizedOrigin}/?${params.toString()}`
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

type ViewportFrameRect = {
  width: number
  height: number
  left: number
  top: number
}

type ViewportFrameInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

type OrientationQuaternion = [number, number, number, number]
type OrientationFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

type ViewOrientationAnimation = {
  startTime: number
  duration: number
  fromPosition: THREE.Vector3
  toPosition: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
}

function unwrapAngleRadians(next: number, previous: number) {
  const fullTurn = Math.PI * 2
  const delta = THREE.MathUtils.euclideanModulo(next - previous + Math.PI, fullTurn) - Math.PI
  return previous + delta
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

function getUrlFrameInsetParam(params: URLSearchParams, key: string) {
  const value = params.get(key)
  if (!value) {
    return 0
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function getUrlFrameInsetParamWithAuto(params: URLSearchParams, key: string, autoValue: number) {
  const value = params.get(key)
  if (!value) {
    return 0
  }

  if (value.toLowerCase() === 'auto') {
    return autoValue
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function getPublishedViewportFrameInsets(viewportWidth: number): ViewportFrameInsets {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  const params = new URL(window.location.href).searchParams
  const autoTopInset = viewportWidth <= 960 ? 92 : 80
  const responsiveTopKey = viewportWidth <= 960 ? 'frameInsetTopMobile' : 'frameInsetTopDesktop'
  const responsiveTop = getUrlFrameInsetParam(params, responsiveTopKey)

  return {
    top: responsiveTop || getUrlFrameInsetParamWithAuto(params, 'frameInsetTop', autoTopInset),
    right: getUrlFrameInsetParam(params, 'frameInsetRight'),
    bottom: getUrlFrameInsetParam(params, 'frameInsetBottom'),
    left: getUrlFrameInsetParam(params, 'frameInsetLeft'),
  }
}

function hasViewportFrameInsets(insets: ViewportFrameInsets) {
  return insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0
}

function getInsetViewportFrameRect(
  width: number,
  height: number,
  insets: ViewportFrameInsets,
): ViewportFrameRect {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const left = THREE.MathUtils.clamp(insets.left, 0, safeWidth - 1)
  const right = THREE.MathUtils.clamp(insets.right, 0, safeWidth - left - 1)
  const top = THREE.MathUtils.clamp(insets.top, 0, safeHeight - 1)
  const bottom = THREE.MathUtils.clamp(insets.bottom, 0, safeHeight - top - 1)

  return {
    width: Math.max(safeWidth - left - right, 1),
    height: Math.max(safeHeight - top - bottom, 1),
    left,
    top,
  }
}

function OrientationTracker({
  onChange,
}: {
  onChange: (quaternion: OrientationQuaternion) => void
}) {
  const camera = useThree((state) => state.camera)
  const previousQuaternionRef = useRef<OrientationQuaternion | null>(null)

  useFrame(() => {
    const nextQuaternion: OrientationQuaternion = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ]

    const previous = previousQuaternionRef.current
    if (
      previous &&
      Math.abs(previous[0] - nextQuaternion[0]) < 0.0001 &&
      Math.abs(previous[1] - nextQuaternion[1]) < 0.0001 &&
      Math.abs(previous[2] - nextQuaternion[2]) < 0.0001 &&
      Math.abs(previous[3] - nextQuaternion[3]) < 0.0001
    ) {
      return
    }

    previousQuaternionRef.current = nextQuaternion
    onChange(nextQuaternion)
  })

  return null
}

function ViewportOrientationCube({
  quaternion,
  onFaceClick,
  onDragRotate,
}: {
  quaternion: OrientationQuaternion
  onFaceClick: (face: OrientationFace) => void
  onDragRotate: (deltaX: number, deltaY: number) => void
}) {
  const displayedEulerRef = useRef<[number, number, number] | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const rotationStyle = useMemo(() => {
    const q = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3])
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    const previousEuler = displayedEulerRef.current
    const stabilizedEuler: [number, number, number] = previousEuler
      ? [
          unwrapAngleRadians(euler.x, previousEuler[0]),
          unwrapAngleRadians(euler.y, previousEuler[1]),
          unwrapAngleRadians(euler.z, previousEuler[2]),
        ]
      : [euler.x, euler.y, euler.z]

    displayedEulerRef.current = stabilizedEuler
    return {
      transform: `rotateX(${THREE.MathUtils.radToDeg(stabilizedEuler[0])}deg) rotateY(${THREE.MathUtils.radToDeg(stabilizedEuler[1])}deg) rotateZ(${-THREE.MathUtils.radToDeg(stabilizedEuler[2])}deg)`,
    } satisfies CSSProperties
  }, [quaternion])

  const faces: Array<{ face: OrientationFace; label: string; className: string }> = [
    { face: 'front', label: 'FRONT', className: 'is-front' },
    { face: 'back', label: 'BACK', className: 'is-back' },
    { face: 'left', label: 'LEFT', className: 'is-right' },
    { face: 'right', label: 'RIGHT', className: 'is-left' },
    { face: 'top', label: 'TOP', className: 'is-top' },
    { face: 'bottom', label: 'BOTTOM', className: 'is-bottom' },
  ]

  return (
    <div className="viewport-orientation" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div
        className="viewport-orientation__scene"
        onPointerDown={(event) => {
          event.stopPropagation()
          dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return
          }

          const deltaX = event.clientX - dragState.x
          const deltaY = event.clientY - dragState.y
          if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
            dragState.moved = dragState.moved || Math.abs(deltaX) + Math.abs(deltaY) > 2
            dragState.x = event.clientX
            dragState.y = event.clientY
            onDragRotate(deltaX, deltaY)
          }
        }}
        onPointerUp={(event) => {
          const dragState = dragStateRef.current
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return
          }

          const faceButton = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLButtonElement>('.viewport-orientation__face')
          const face = faceButton?.dataset.face as OrientationFace | undefined

          dragStateRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }

          if (!dragState.moved && face) {
            onFaceClick(face)
          }
        }}
        onPointerCancel={(event) => {
          const dragState = dragStateRef.current
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return
          }

          dragStateRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
      >
        <div className="viewport-orientation__cube" style={rotationStyle}>
          {faces.map((entry) => (
            <button
              key={entry.face}
              type="button"
              className={`viewport-orientation__face ${entry.className}`}
              data-face={entry.face}
              title={`View ${entry.label.toLowerCase()}`}
              aria-label={`View ${entry.label.toLowerCase()}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
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

function CameraBridge({
  controlsRef,
  cameraOffsetRef,
  targetOffsetRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  cameraOffsetRef: React.MutableRefObject<THREE.Vector3>
  targetOffsetRef: React.MutableRefObject<THREE.Vector3>
}) {
  const { camera } = useThree()
  const viewer = useEditorStore((state) => state.viewer)

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const orbitTarget = new THREE.Vector3(...viewer.orbitTarget)
    perspectiveCamera.position.set(...viewer.cameraPosition)
    perspectiveCamera.lookAt(orbitTarget)
    applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)
    if (controlsRef.current) {
      controlsRef.current.target.copy(orbitTarget).add(targetOffsetRef.current)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, targetOffsetRef, viewer.cameraPosition, viewer.focalLength, viewer.orbitTarget])

  return <ViewerSync controlsRef={controlsRef} cameraOffsetRef={cameraOffsetRef} targetOffsetRef={targetOffsetRef} />
}

function RendererBridge({
  transparentBackground = false,
  clearColor = EDITOR_CLEAR_COLOR,
}: {
  transparentBackground?: boolean
  clearColor?: number
}) {
  const { gl } = useThree()
  const exposure = useEditorStore((state) => state.viewer.exposure)

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.setClearColor(clearColor, transparentBackground ? 0 : 1)
  }, [clearColor, exposure, gl, transparentBackground])

  return null
}

function TransparentEnvironmentBridge() {
  const { scene } = useThree()
  const environment = useEditorStore((state) => state.environment)
  const currentEnvMap = useEditorStore((state) => state.runtimeTextures.environmentMap)

  useEffect(() => {
    scene.background = null
    scene.environment = environment.isEnvironmentEnabled ? currentEnvMap : null
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
  }, [currentEnvMap, environment.intensity, environment.isEnvironmentEnabled, environment.rotation, scene])

  useFrame(() => {
    scene.background = null
    scene.environment = environment.isEnvironmentEnabled ? currentEnvMap : null
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
  })

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
    const isSelectedGodRays =
      Boolean(selectedObjectId && selectedObjectId.startsWith('effect:god-rays:'))
    const isSelectedStencilVolume =
      Boolean(selectedObjectId && selectedObjectId.startsWith('effect:stencil-volume:'))

    if (!selectedObjectId || !selectedObject || isSelectedGodRays || isSelectedStencilVolume) {
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
  const isSelectedGodRays =
    Boolean(selectedObjectId && selectedNode?.type === 'effect' && selectedObjectId.startsWith('effect:god-rays:'))

  useFrame(() => {
    if (
      isSelectedGodRays ||
      !anchorModeEnabled ||
      !selectedObjectId ||
      !selectedNode ||
      selectedNode.type === 'material' ||
      !object
    ) {
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

  if (
    isSelectedGodRays ||
    !anchorModeEnabled ||
    !selectedObjectId ||
    !selectedNode ||
    selectedNode.type === 'material' ||
    !object
  ) {
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
  const selectedRuntimeObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const directionObject = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.runtime.objectById[getGodRaysDirectionArrowId(state.hud.activeGodRaysDirectionBoxId)] ?? null
      : null,
  )
  const activeGodRaysEntry = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.godRaysBoxes.find((entry) => entry.id === state.hud.activeGodRaysDirectionBoxId) ?? null
      : null,
  )
  const activeGodRaysObject = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.runtime.objectById[state.hud.activeGodRaysDirectionBoxId] ?? null
      : null,
  )
  const activeStencilVolumeEndHandleId = useEditorStore((state) => state.hud.activeStencilVolumeEndHandleId)
  const stencilEndObject = useEditorStore((state) =>
    state.hud.activeStencilVolumeEndHandleId
      ? state.runtime.objectById[getStencilVolumeEndHandleId(state.hud.activeStencilVolumeEndHandleId)] ?? null
      : null,
  )
  const activeStencilVolumeEntry = useEditorStore((state) =>
    state.hud.activeStencilVolumeEndHandleId
      ? state.stencilVolumes.find((entry) => entry.id === state.hud.activeStencilVolumeEndHandleId) ?? null
      : null,
  )
  const transformMode = useEditorStore((state) => state.hud.transformMode)
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const selectedAnchorIndex = useEditorStore((state) => state.selectedAnchorIndex)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const updateGodRaysBox = useEditorStore((state) => state.updateGodRaysBox)
  const updateStencilVolume = useEditorStore((state) => state.updateStencilVolume)
  const setGodRaysGlobalDirection = useEditorStore((state) => state.setGodRaysGlobalDirection)
  const duplicateExtraLight = useEditorStore((state) => state.duplicateExtraLight)
  const duplicateGodRaysBox = useEditorStore((state) => state.duplicateGodRaysBox)
  const duplicateStencilVolume = useEditorStore((state) => state.duplicateStencilVolume)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const isEditingGodRaysDirection = Boolean(
    activeGodRaysDirectionBoxId &&
      selectedObjectId === activeGodRaysDirectionBoxId &&
      directionObject,
  )
  const wantsStencilVolumeEndEdit = Boolean(
    activeStencilVolumeEndHandleId &&
      selectedObjectId === activeStencilVolumeEndHandleId,
  )
  const isEditingStencilVolumeEnd = wantsStencilVolumeEndEdit && Boolean(stencilEndObject)
  const object = isEditingGodRaysDirection
    ? directionObject
    : wantsStencilVolumeEndEdit
      ? stencilEndObject
      : selectedRuntimeObject
  const canRotate = isEditingGodRaysDirection || wantsStencilVolumeEndEdit || selectedNode?.type !== 'light'
  const canScale = !isEditingGodRaysDirection && (wantsStencilVolumeEndEdit || selectedNode?.type !== 'light')
  const pivotObject = useMemo(() => new THREE.Object3D(), [])
  const previousPivotStateRef = useRef<{
    position: THREE.Vector3
    quaternion: THREE.Quaternion
  } | null>(null)
  const duplicateDragSessionRef = useRef<{
    sourceId: string
    duplicateId: string
    sourceTransform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
      visible: boolean
    }
    sourceLightTargetPosition?: [number, number, number]
  } | null>(null)
  const isDraggingRef = useRef(false)
  const directionWriteArmedRef = useRef(false)
  const stencilEndWriteArmedRef = useRef(false)
  const shiftPressedRef = useRef(false)
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
  const usesRootPivot = !isEditingGodRaysDirection && !wantsStencilVolumeEndEdit && isRootSelection && transformMode === 'rotate'
  const usesAnchorPivot = !isEditingGodRaysDirection && !wantsStencilVolumeEndEdit && hasSelectedAnchor
  const usesCustomPivot = usesRootPivot || usesAnchorPivot
  const activeTransformMode = transformMode

  useEffect(() => {
    pivotObject.visible = false
    scene.add(pivotObject)

    return () => {
      scene.remove(pivotObject)
    }
  }, [pivotObject, scene])

  useEffect(() => {
    if (!isEditingGodRaysDirection) {
      directionWriteArmedRef.current = false
    }
    if (!isEditingStencilVolumeEnd) {
      stencilEndWriteArmedRef.current = false
    }
  }, [isEditingGodRaysDirection, isEditingStencilVolumeEnd])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft') {
        shiftPressedRef.current = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft') {
        shiftPressedRef.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])
  const translationSnapValue =
    transformSettings.isGridSnapping
      ? transformSettings.gridSize > 0
        ? transformSettings.gridSize
        : transformSettings.translationStep > 0
          ? transformSettings.translationStep
          : undefined
      : undefined
  const canRender =
    activeTransformMode !== 'none' &&
    Boolean(selectedObjectId && selectedNode && selectedNode.type !== 'material' && object) &&
    cameraMode === 'orbit' &&
    !(isEditingGodRaysDirection && activeTransformMode !== 'rotate') &&
    !(activeTransformMode === 'rotate' && !canRotate) &&
    !(activeTransformMode === 'scale' && !canScale)

  const syncTransform = () => {
    if (!selectedObjectId || !selectedNode || !object) {
      return
    }

    if (isEditingGodRaysDirection && activeGodRaysDirectionBoxId && activeGodRaysEntry && activeGodRaysObject) {
      const nextDirection = getGodRaysStoredDirectionFromArrowObject(
        object,
        activeGodRaysEntry.dustDirectionMode,
        activeGodRaysObject,
      )
      const patch =
        activeGodRaysEntry.dustDirectionMode === 'local'
          ? {
              dustDirectionMode: activeGodRaysEntry.dustDirectionMode,
              dustDirectionLocal: nextDirection,
            }
          : null
      if (activeGodRaysEntry.dustDirectionMode === 'global') {
        setGodRaysGlobalDirection(nextDirection)
      } else if (patch) {
        updateGodRaysBox(activeGodRaysDirectionBoxId, patch)
      }
      return
    }

    if (isEditingStencilVolumeEnd && activeStencilVolumeEndHandleId && activeStencilVolumeEntry) {
      if (activeTransformMode === 'rotate') {
        updateStencilVolume(activeStencilVolumeEndHandleId, {
          endRotationX: object.rotation.x,
          endRotationY: object.rotation.y,
        })
        return
      }

      if (activeTransformMode === 'scale') {
        updateStencilVolume(activeStencilVolumeEndHandleId, {
          endScaleX: object.scale.x,
          endScaleY: object.scale.y,
        })
        return
      }

      updateStencilVolume(activeStencilVolumeEndHandleId, {
        extrudeEnd: [object.position.x, object.position.y, object.position.z],
      })
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
      mode={activeTransformMode}
      showX
      showY
      showZ={!isEditingStencilVolumeEnd || activeTransformMode === 'translate'}
      translationSnap={translationSnapValue}
      rotationSnap={
        transformSettings.rotationStep > 0 ? THREE.MathUtils.degToRad(transformSettings.rotationStep) : undefined
      }
      onObjectChange={() => {
        if (isEditingGodRaysDirection && (!isDraggingRef.current || !directionWriteArmedRef.current)) {
          return
        }
        if (isEditingStencilVolumeEnd && (!isDraggingRef.current || !stencilEndWriteArmedRef.current)) {
          return
        }
        if (usesCustomPivot) {
          applyPivotDelta()
        }
        syncTransform()
      }}
      onMouseDown={() => {
        beginHistoryGesture()
        isDraggingRef.current = true
        if (isEditingGodRaysDirection) {
          directionWriteArmedRef.current = true
        }
        if (isEditingStencilVolumeEnd) {
          stencilEndWriteArmedRef.current = true
        }
        if (
          activeTransformMode === 'translate' &&
          !isEditingStencilVolumeEnd &&
          shiftPressedRef.current &&
          selectedObjectId &&
          selectedNode
        ) {
          if (selectedNode.type === 'light') {
            const nextId = duplicateExtraLight(selectedObjectId, { selectDuplicate: false })
            if (nextId) {
              const selectedLight = useEditorStore.getState().extraLights.find((entry) => entry.id === selectedObjectId) ?? null
              duplicateDragSessionRef.current = {
                sourceId: selectedObjectId,
                duplicateId: nextId,
                sourceTransform: {
                  position: [object.position.x, object.position.y, object.position.z],
                  rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
                  scale: [object.scale.x, object.scale.y, object.scale.z],
                  visible: object.visible,
                },
                sourceLightTargetPosition: selectedLight ? [...selectedLight.targetPosition] as [number, number, number] : undefined,
              }
            }
          } else if (selectedNode.type === 'effect' && selectedObjectId.startsWith('effect:god-rays:')) {
            const nextId = duplicateGodRaysBox(selectedObjectId, { selectDuplicate: false })
            if (nextId) {
              duplicateDragSessionRef.current = {
                sourceId: selectedObjectId,
                duplicateId: nextId,
                sourceTransform: {
                  position: [object.position.x, object.position.y, object.position.z],
                  rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
                  scale: [object.scale.x, object.scale.y, object.scale.z],
                  visible: object.visible,
                },
              }
            }
          } else if (selectedNode.type === 'effect' && selectedObjectId.startsWith('effect:stencil-volume:')) {
            const nextId = duplicateStencilVolume(selectedObjectId, { selectDuplicate: false })
            if (nextId) {
              duplicateDragSessionRef.current = {
                sourceId: selectedObjectId,
                duplicateId: nextId,
                sourceTransform: {
                  position: [object.position.x, object.position.y, object.position.z],
                  rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
                  scale: [object.scale.x, object.scale.y, object.scale.z],
                  visible: object.visible,
                },
              }
            }
          }
        } else if (
          activeTransformMode === 'rotate' &&
          !isEditingGodRaysDirection &&
          shiftPressedRef.current &&
          selectedObjectId &&
          selectedNode?.type === 'effect' &&
          selectedObjectId.startsWith('effect:god-rays:')
        ) {
          const nextId = duplicateGodRaysBox(selectedObjectId, { selectDuplicate: false })
          if (nextId) {
            duplicateDragSessionRef.current = {
              sourceId: selectedObjectId,
              duplicateId: nextId,
              sourceTransform: {
                position: [object.position.x, object.position.y, object.position.z],
                rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
                scale: [object.scale.x, object.scale.y, object.scale.z],
                visible: object.visible,
              },
            }
          }
        }
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
        if (duplicateDragSessionRef.current) {
          const session = duplicateDragSessionRef.current
          const movedTransform = {
            position: [object.position.x, object.position.y, object.position.z] as [number, number, number],
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z] as [number, number, number],
            scale: [object.scale.x, object.scale.y, object.scale.z] as [number, number, number],
            visible: object.visible,
          }

          updateObjectTransform(session.duplicateId, movedTransform)
          updateObjectTransform(session.sourceId, session.sourceTransform)
          object.position.set(...session.sourceTransform.position)
          object.rotation.set(...session.sourceTransform.rotation)
          object.scale.set(...session.sourceTransform.scale)
          object.visible = session.sourceTransform.visible
          object.updateMatrixWorld(true)

          if (selectedNode?.type === 'light') {
            updateExtraLight(session.duplicateId, { position: movedTransform.position })
            updateExtraLight(session.sourceId, {
              position: session.sourceTransform.position,
              targetPosition: session.sourceLightTargetPosition,
            })
          }

          setSelectedObjectId(session.duplicateId)
          duplicateDragSessionRef.current = null
        }
        isDraggingRef.current = false
        directionWriteArmedRef.current = false
        stencilEndWriteArmedRef.current = false
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
  registerViewDirection,
  registerViewOrbitDrag,
  onCameraQuaternionChange,
  onTransformDraggingChange,
  transformDragging,
  allowSelection,
  autoFrameOnLoad,
  transparentBackground,
  clearColor,
  gyroSampleRef,
}: {
  onStats: (stats: PerformanceSnapshot) => void
  registerResetCamera: (handler: () => void) => void
  registerViewDirection: (handler: (direction: OrientationFace) => void) => void
  registerViewOrbitDrag: (handler: (deltaX: number, deltaY: number) => void) => void
  onCameraQuaternionChange: (quaternion: OrientationQuaternion) => void
  onTransformDraggingChange: (value: boolean) => void
  transformDragging: boolean
  allowSelection: boolean
  autoFrameOnLoad: boolean
  transparentBackground: boolean
  clearColor: number
  gyroSampleRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const showcaseCameraOffsetRef = useRef(new THREE.Vector3())
  const showcaseTargetOffsetRef = useRef(new THREE.Vector3())
  const { camera, size } = useThree()
  const viewer = useEditorStore((state) => state.viewer)
  const hud = useEditorStore((state) => state.hud)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const gridSize = useEditorStore((state) => state.transformSettings.gridSize)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
  )
  const autoFramedRootIdRef = useRef<string | null>(null)
  const orientationAnimationRef = useRef<ViewOrientationAnimation | null>(null)

  useFrame(({ clock }) => {
    const animation = orientationAnimationRef.current
    if (!animation) {
      return
    }

    const elapsed = performance.now() - animation.startTime
    const rawProgress = THREE.MathUtils.clamp(elapsed / animation.duration, 0, 1)
    const easedProgress = 1 - Math.pow(1 - rawProgress, 3)
    const nextPosition = animation.fromPosition.clone().lerp(animation.toPosition, easedProgress)
    const nextTarget = animation.fromTarget.clone().lerp(animation.toTarget, easedProgress)
    const perspectiveCamera = camera as THREE.PerspectiveCamera

    perspectiveCamera.position.copy(nextPosition)
    perspectiveCamera.lookAt(nextTarget)
    if (controlsRef.current) {
      controlsRef.current.target.copy(nextTarget)
      controlsRef.current.update()
    }

    if (rawProgress >= 1) {
      orientationAnimationRef.current = null
      useEditorStore.getState().setViewer({
        cameraMode: 'orbit',
        cameraPosition: [nextPosition.x, nextPosition.y, nextPosition.z],
        orbitTarget: [nextTarget.x, nextTarget.y, nextTarget.z],
      })
    }
  })

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

  useEffect(() => {
    registerViewDirection((direction) => {
      orientationAnimationRef.current = null
      const target = new THREE.Vector3(...viewer.orbitTarget)
      const currentPosition = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z)
      const distance = Math.max(currentPosition.distanceTo(target), 0.5)
      const directionVector =
        direction === 'front'
          ? new THREE.Vector3(0, 0, 1)
          : direction === 'back'
            ? new THREE.Vector3(0, 0, -1)
            : direction === 'left'
              ? new THREE.Vector3(-1, 0, 0)
              : direction === 'right'
                ? new THREE.Vector3(1, 0, 0)
                : direction === 'top'
                  ? new THREE.Vector3(0, 1, 0)
                  : new THREE.Vector3(0, -1, 0)

      const nextPosition = target.clone().add(directionVector.multiplyScalar(distance))
      useEditorStore.getState().setHud({ orbitEnabled: true })
      orientationAnimationRef.current = {
        startTime: performance.now(),
        duration: 340,
        fromPosition: currentPosition,
        toPosition: nextPosition,
        fromTarget: controlsRef.current?.target.clone() ?? target.clone(),
        toTarget: target,
      }
    })

    return () => {
      registerViewDirection(() => {})
    }
  }, [camera, controlsRef, registerViewDirection, viewer.focalLength, viewer.orbitTarget])

  useEffect(() => {
    registerViewOrbitDrag((deltaX, deltaY) => {
      orientationAnimationRef.current = null
      const target = controlsRef.current?.target.clone() ?? new THREE.Vector3(...viewer.orbitTarget)
      const offset = new THREE.Vector3().subVectors(camera.position, target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      const rotationSpeed = 0.012
      const phiLimit = 0.08

      spherical.theta += deltaX * rotationSpeed
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi - deltaY * rotationSpeed,
        phiLimit,
        Math.PI - phiLimit,
      )

      offset.setFromSpherical(spherical)
      camera.position.copy(target.clone().add(offset))
      camera.lookAt(target)
      const perspectiveCamera = camera as THREE.PerspectiveCamera
      applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)
      if (controlsRef.current) {
        controlsRef.current.target.copy(target)
        controlsRef.current.update()
      }
      useEditorStore.getState().setHud({ orbitEnabled: true })
      useEditorStore.getState().setViewer({ cameraMode: 'orbit' })
    })

    return () => {
      registerViewOrbitDrag(() => {})
    }
  }, [camera, registerViewOrbitDrag, viewer.focalLength, viewer.orbitTarget])

  return (
    <>
      <RendererBridge transparentBackground={transparentBackground} clearColor={clearColor} />
      <CameraBridge
        controlsRef={controlsRef}
        cameraOffsetRef={showcaseCameraOffsetRef}
        targetOffsetRef={showcaseTargetOffsetRef}
      />
      <OrientationTracker onChange={onCameraQuaternionChange} />
      <PerformanceProbe onSample={onStats} />
      <Suspense fallback={null}>
        {transparentBackground ? <TransparentEnvironmentBridge /> : <EnvironmentManager />}
        <LightRig />
        <SceneBridge allowSelection={allowSelection} />
        <CustomSceneBoxes selectable={allowSelection} />
        <ShowcaseInteractionController
          controlsRef={controlsRef}
          cameraOffsetRef={showcaseCameraOffsetRef}
          targetOffsetRef={showcaseTargetOffsetRef}
          gyroSampleRef={gyroSampleRef}
        />
        <StencilVolumes />
        <GodRaysBoxes />
        {allowSelection ? <SelectionHighlight /> : null}
        {allowSelection ? <AnchorHandles /> : null}
        {allowSelection ? <TransformGizmo onDraggingChange={onTransformDraggingChange} /> : null}
        <MaterialEffectController />
        <SceneAnimationController />
        {hud.postEffectsEnabled && hud.postEffectsVisible ? <PostEffects /> : null}
      </Suspense>
      {hud.gridVisible ? (
        <>
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
          <Grid
            args={[20, 20]}
            position={[0, -0.002, 0]}
            rotation={[Math.PI, 0, 0]}
            cellColor={VIEWPORT_GRID_CELL_COLOR}
            sectionColor={VIEWPORT_GRID_SECTION_COLOR}
            fadeDistance={22}
            fadeStrength={1.3}
            cellSize={Math.max(gridSize, 0.0001)}
            sectionSize={Math.max(gridSize * 5, 0.0005)}
            infiniteGrid={false}
          />
        </>
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

function ViewportMotionToggle({
  enabled,
  permissionState,
  onToggle,
}: {
  enabled: boolean
  permissionState: 'unsupported' | 'idle' | 'granted' | 'denied'
  onToggle: () => void
}) {
  const label =
    permissionState === 'denied'
      ? 'Motion Blocked'
      : enabled
        ? 'Motion On'
        : permissionState === 'granted'
          ? 'Motion Off'
          : 'Enable Motion'

  return (
    <button
      type="button"
      className={`viewport-motion-toggle${enabled ? ' is-active' : ''}${permissionState === 'denied' ? ' is-blocked' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      {label}
    </button>
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
  const phoneScreenBoxes = useEditorStore((state) => state.phoneScreenBoxes)
  const objects = useEditorStore((state) => state.objects)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const showcaseMotion = useShowcaseMotionSensor()
  const containerRef = useRef<HTMLElement | null>(null)
  const resetCameraRef = useRef<() => void>(() => {})
  const applyViewDirectionRef = useRef<(direction: OrientationFace) => void>(() => {})
  const applyViewOrbitDragRef = useRef<(deltaX: number, deltaY: number) => void>(() => {})
  const [metricTextPalette, setMetricTextPalette] = useState(LIGHT_METRIC_TEXT)
  const [isTransformDragging, setIsTransformDragging] = useState(false)
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 })
  const [cameraQuaternion, setCameraQuaternion] = useState<OrientationQuaternion>([0, 0, 0, 1])
  const [webPublishStatus, setWebPublishStatus] = useState<WebPublishDeploymentStatus | null>(null)
  const [webPublishCopyFeedback, setWebPublishCopyFeedback] = useState<'idle' | 'copied' | 'error'>('idle')
  const publishedFrameInsets = useMemo(
    () => getPublishedViewportFrameInsets(containerSize.width),
    [containerSize.width],
  )
  const hasPublishedFrameInsets = useMemo(
    () => hasViewportFrameInsets(publishedFrameInsets),
    [publishedFrameInsets],
  )
  const hasVisibleLockedShowcase = useMemo(
    () =>
      phoneScreenBoxes.some(
        (entry) => entry.screenBinding.lockToFrame && (objects[entry.id]?.visible ?? false),
      ),
    [objects, phoneScreenBoxes],
  )
  const shouldBypassPresetFrameForLockedShowcase = enforceFrameAspect && !showChrome && hasVisibleLockedShowcase
  const shouldInsetLockedShowcaseFrame = shouldBypassPresetFrameForLockedShowcase && hasPublishedFrameInsets
  const effectiveEnforceFrameAspect =
    ((enforceFrameAspect || viewer.frameGuidesEnabled) && !shouldBypassPresetFrameForLockedShowcase) ||
    shouldInsetLockedShowcaseFrame
  const frameAspect = getFrameAspectValue(
    viewer.frameAspectPreset,
    containerSize.width / Math.max(containerSize.height, 1),
  )
  const frameRect = useMemo(
    () =>
      shouldInsetLockedShowcaseFrame
        ? getInsetViewportFrameRect(containerSize.width, containerSize.height, publishedFrameInsets)
        : getViewportFrameRect(containerSize.width, containerSize.height, frameAspect),
    [
      containerSize.height,
      containerSize.width,
      frameAspect,
      publishedFrameInsets,
      shouldInsetLockedShowcaseFrame,
    ],
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
  const canvasStyle = useMemo(
    () => (transparentBackground ? ({ background: 'transparent' } as CSSProperties) : undefined),
    [transparentBackground],
  )
  const showMotionToggle = useMemo(
    () =>
      showcaseMotion.supported &&
      phoneScreenBoxes.some(
        (entry) =>
          supportsGyroShowcaseInput(entry.interaction.inputMode) &&
          (objects[entry.id]?.visible ?? false),
      ),
    [objects, phoneScreenBoxes, showcaseMotion.supported],
  )
  const clearColor = showChrome ? EDITOR_CLEAR_COLOR : 0x000000
  const webPublishEmbedUrl =
    webPublishStatus?.deployOrigin && webPublishStatus.publicSceneUrl
      ? buildPublishedPlayerUrl(webPublishStatus.publicSceneUrl, webPublishStatus.deployOrigin)
      : webPublishStatus?.prettySceneUrl ?? webPublishStatus?.publicSceneUrl ?? null
  const webPublishIframeCode = webPublishEmbedUrl ? buildIframeEmbedCode(webPublishEmbedUrl) : null

  useEffect(() => {
    const handleWebPublishStatus = (event: Event) => {
      setWebPublishStatus((event as CustomEvent<WebPublishDeploymentStatus | null>).detail ?? null)
    }

    window.addEventListener(WEB_PUBLISH_STATUS_EVENT, handleWebPublishStatus as EventListener)
    return () => {
      window.removeEventListener(WEB_PUBLISH_STATUS_EVENT, handleWebPublishStatus as EventListener)
    }
  }, [])

  useEffect(() => {
    setWebPublishCopyFeedback('idle')
  }, [webPublishIframeCode])

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
      {effectiveEnforceFrameAspect ? (
        <div
          className={`viewport-stage${transparentBackground ? ' viewport-stage--transparent' : ''}`}
          style={frameStyle}
        >
          <Canvas
            className="viewport-canvas"
            dpr={[1, 2]}
            style={canvasStyle}
            gl={{ alpha: true, antialias: true, premultipliedAlpha: !transparentBackground }}
            camera={{
              position: viewer.cameraPosition,
              fov: DEFAULT_VIEWER_CAMERA_FOV,
              near: 0.1,
              far: 2000,
            }}
            onCreated={({ gl, scene }) => {
              if (!transparentBackground) {
                return
              }
              gl.domElement.style.background = 'transparent'
              gl.setClearColor(0x000000, 0)
              scene.background = null
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
              clearColor={clearColor}
              gyroSampleRef={showcaseMotion.sampleRef}
              onCameraQuaternionChange={setCameraQuaternion}
              onStats={setViewportMetrics}
              onTransformDraggingChange={setIsTransformDragging}
              registerViewDirection={(handler) => {
                applyViewDirectionRef.current = handler
              }}
              registerViewOrbitDrag={(handler) => {
                applyViewOrbitDragRef.current = handler
              }}
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
          style={canvasStyle}
          gl={{ alpha: true, antialias: true, premultipliedAlpha: !transparentBackground }}
          camera={{
            position: viewer.cameraPosition,
            fov: DEFAULT_VIEWER_CAMERA_FOV,
            near: 0.1,
            far: 2000,
          }}
          onCreated={({ gl, scene }) => {
            if (!transparentBackground) {
              return
            }
            gl.domElement.style.background = 'transparent'
            gl.setClearColor(0x000000, 0)
            scene.background = null
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
            clearColor={clearColor}
            gyroSampleRef={showcaseMotion.sampleRef}
            onCameraQuaternionChange={setCameraQuaternion}
            onStats={setViewportMetrics}
            onTransformDraggingChange={setIsTransformDragging}
            registerViewDirection={(handler) => {
              applyViewDirectionRef.current = handler
            }}
            registerViewOrbitDrag={(handler) => {
              applyViewOrbitDragRef.current = handler
            }}
            transparentBackground={transparentBackground}
            transformDragging={isTransformDragging}
            registerResetCamera={(handler) => {
              resetCameraRef.current = handler
            }}
          />
        </Canvas>
      )}
      {!effectiveEnforceFrameAspect && viewer.frameGuidesEnabled ? (
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
      {showChrome ? (
        <ViewportOrientationCube
          quaternion={cameraQuaternion}
          onFaceClick={(face) => applyViewDirectionRef.current(face)}
          onDragRotate={(deltaX, deltaY) => applyViewOrbitDragRef.current(deltaX, deltaY)}
        />
      ) : null}
      {showChrome ? <PerformanceStats /> : null}
      {showChrome ? <ViewportHud onResetCamera={() => resetCameraRef.current()} /> : null}
      {showMotionToggle ? (
        <ViewportMotionToggle
          enabled={showcaseMotion.enabled}
          permissionState={showcaseMotion.permissionState}
          onToggle={() => {
            void showcaseMotion.toggle()
          }}
        />
      ) : null}
      {showChrome && webPublishStatus ? (
        <div className="viewport-web-publish-layer" onPointerDown={() => setWebPublishStatus(null)}>
          <section
            className={`web-publish-status web-publish-status--${webPublishStatus.phase} web-publish-status--floating`}
            aria-live="polite"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="web-publish-status__header">
              <span className="web-publish-status__eyebrow">WEB Deploy</span>
              <div className="web-publish-status__header-right">
                {webPublishStatus.gitCommitSha ? (
                  <span className="web-publish-status__meta">git {webPublishStatus.gitCommitSha}</span>
                ) : null}
                <button
                  type="button"
                  className="web-publish-status__close"
                  aria-label="Close web deploy status"
                  onClick={() => setWebPublishStatus(null)}
                >
                  x
                </button>
              </div>
            </div>
            <p className="web-publish-status__message">{webPublishStatus.message}</p>
            {webPublishStatus.prettySceneUrl ? (
              <div className="web-publish-status__actions">
                <a href={webPublishStatus.prettySceneUrl} target="_blank" rel="noreferrer">
                  Open live scene
                </a>
              </div>
            ) : null}
            {webPublishIframeCode ? (
              <div className="web-publish-status__embed">
                <div className="web-publish-status__embed-header">
                  <span className="web-publish-status__eyebrow">Iframe</span>
                  <button
                    type="button"
                    className="web-publish-status__copy"
                    onClick={() => {
                      void copyTextToClipboard(webPublishIframeCode)
                        .then(() => {
                          setWebPublishCopyFeedback('copied')
                        })
                        .catch(() => {
                          setWebPublishCopyFeedback('error')
                        })
                    }}
                  >
                    {webPublishCopyFeedback === 'copied'
                      ? 'Copied'
                      : webPublishCopyFeedback === 'error'
                        ? 'Copy failed'
                        : 'Copy iframe'}
                  </button>
                </div>
                <pre className="web-publish-status__code">
                  <code>{webPublishIframeCode}</code>
                </pre>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
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
