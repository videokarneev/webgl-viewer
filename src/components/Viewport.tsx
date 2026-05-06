import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { fitCameraToObject } from '../features/scene/runtime/shared'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import { useEditorStore } from '../store/editorStore'
import { MaterialEffectController } from './MaterialEffectController'
import { ViewportHud } from './ViewportHud'
import { FlightController } from './viewport/FlightController'
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
const ViewportContactShadows = lazy(() =>
  import('./viewport/ViewportContactShadows').then((module) => ({
    default: module.ViewportContactShadows,
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

  const root = state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null
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

  const textureBytes = Array.from(textures.values()).reduce((sum, texture) => sum + texture.bytes, 0)
  const width = typeof window === 'undefined' ? 0 : window.innerWidth * window.devicePixelRatio
  const height = typeof window === 'undefined' ? 0 : window.innerHeight * window.devicePixelRatio
  const postProcessingBytes = state.hud.postEffectsEnabled ? width * height * 4 * 3 : 0
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
    perspectiveCamera.setFocalLength(viewer.focalLength)
    perspectiveCamera.updateProjectionMatrix()
  }, [camera, viewer.cameraPosition, viewer.focalLength])

  return <ViewerSync controlsRef={controlsRef} />
}

function RendererBridge() {
  const { gl } = useThree()
  const exposure = useEditorStore((state) => state.viewer.exposure)

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
  }, [exposure, gl])

  return null
}

function SceneBridge() {
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
  )

  if (!rootNodeId || !root) {
    return null
  }

  return <LoadedSceneRoot root={root} />
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

function PerformanceProbe({
  onSample,
}: {
  onSample: (sample: PerformanceSnapshot) => void
}) {
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
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
    const totalStats = rootNodeId && root ? getGeometryStats(root) : { vertices: 0, triangles: 0, drawCalls: 0 }
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
}: {
  onStats: (stats: PerformanceSnapshot) => void
  registerResetCamera: (handler: () => void) => void
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()
  const viewer = useEditorStore((state) => state.viewer)
  const hud = useEditorStore((state) => state.hud)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
  )

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
    registerResetCamera(() => {
      if (!root) {
        return
      }

      fitCameraToObject(camera as THREE.PerspectiveCamera, controlsRef.current, root)
      useEditorStore.getState().setHud({ orbitEnabled: true })
      useEditorStore.getState().setViewer({ cameraMode: 'orbit' })
    })

    return () => {
      registerResetCamera(() => {})
    }
  }, [camera, registerResetCamera, root])

  return (
    <>
      <RendererBridge />
      <CameraBridge controlsRef={controlsRef} />
      <PerformanceProbe onSample={onStats} />
      <Suspense fallback={null}>
        <EnvironmentManager />
        <LightRig />
        <ViewportContactShadows />
        <SceneBridge />
        <SelectionHighlight />
        <MaterialEffectController />
        {hud.postEffectsEnabled ? <PostEffects /> : null}
      </Suspense>
      {hud.gridVisible ? (
        <Grid
          args={[20, 20]}
          position={[0, -0.002, 0]}
          cellColor={VIEWPORT_GRID_CELL_COLOR}
          sectionColor={VIEWPORT_GRID_SECTION_COLOR}
          fadeDistance={22}
          fadeStrength={1.3}
          cellSize={1}
          sectionSize={5}
          infiniteGrid={false}
        />
      ) : null}
      {hud.axesVisible ? <axesHelper args={[2]} /> : null}
      {viewer.cameraMode === 'orbit' ? (
        <OrbitControls ref={controlsRef} enabled={hud.orbitEnabled} makeDefault />
      ) : null}
      <FlightController />
    </>
  )
}

function PerformanceStats() {
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
  )
}

export function Viewport() {
  const status = useEditorStore((state) => state.status)
  const hud = useEditorStore((state) => state.hud)
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const backgroundMode = useEditorStore((state) => state.backgroundMode)
  const backgroundColor = useEditorStore((state) => state.backgroundColor)
  const currentEnvMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const currentBackgroundMap = useEditorStore((state) => state.runtimeTextures.environmentBackground)
  const setHud = useEditorStore((state) => state.setHud)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setZenMode = useEditorStore((state) => state.setZenMode)
  const setViewportMetrics = useEditorStore((state) => state.setViewportMetrics)
  const viewer = useEditorStore((state) => state.viewer)
  const resetCameraRef = useRef<() => void>(() => {})
  const [metricTextPalette, setMetricTextPalette] = useState(LIGHT_METRIC_TEXT)

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

      if (state.viewer.cameraMode === 'orbit' && document.fullscreenElement) {
        setZenMode(false)
        void document.exitFullscreen()
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
    <main className="viewport-wrap" style={viewportStyle}>
      <Canvas
        className="viewport-canvas"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: viewer.cameraPosition, fov: 55, near: 0.1, far: 2000 }}
        onPointerMissed={() => {
          setSelectedObjectId(null)
        }}
      >
        <ViewportScene
          onStats={setViewportMetrics}
          registerResetCamera={(handler) => {
            resetCameraRef.current = handler
          }}
        />
      </Canvas>
      <PerformanceStats />
      <ViewportHud onResetCamera={() => resetCameraRef.current()} />
      <div className="hud">
        <span id="statusLabel">{status}</span>
      </div>
      {!isZenMode ? (
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
