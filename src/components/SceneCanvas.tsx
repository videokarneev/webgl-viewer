import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, PointerLockControls, Stats } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { ViewportHud } from './ViewportHud'
import { AssetController } from '../features/scene/runtime/AssetController'
import { ConfigController } from '../features/scene/runtime/ConfigController'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { SceneBindings } from '../features/scene/runtime/SceneBindings'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import { fitCameraToObject } from '../features/scene/runtime/shared'
import { useViewportPresentation } from '../features/viewport/ViewportPresentationContext'
import type { ExtraLightState } from '../store/editorStore'

type RenderStats = {
  calls: number
  fps: number
  totalVertices: number
  totalTriangles: number
  selectedName: string
  selectedVertices: number
  selectedTriangles: number
  textureCount: number
  textureMemoryMb: number
  fileSize: number | null
}

function formatCompactMetric(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function getMeshStats(object: THREE.Object3D | null) {
  if (!object) {
    return { vertices: 0, triangles: 0 }
  }

  let vertices = 0
  let triangles = 0

  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const geometry = (child as THREE.Mesh).geometry
    if (!geometry) {
      return
    }

    const position = geometry.getAttribute('position')
    if (position) {
      vertices += position.count
    }

    if (geometry.index) {
      triangles += geometry.index.count / 3
    } else if (position) {
      triangles += position.count / 3
    }
  })

  return {
    vertices: Math.round(vertices),
    triangles: Math.round(triangles),
  }
}

function countMeshObjects(object: THREE.Object3D | null) {
  let meshes = 0

  object?.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes += 1
    }
  })

  return meshes
}

function calculateAssetTextures(
  root: THREE.Object3D | null,
  environment: ReturnType<typeof useEditorStore.getState>['environment'],
  runtimeTextures: ReturnType<typeof useEditorStore.getState>['runtimeTextures'],
) {
  const uniqueTextures = new Map<unknown, THREE.Texture>()
  const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const

  const addTexture = (texture: THREE.Texture) => {
    uniqueTextures.set(texture.image ?? texture.source ?? texture.uuid, texture)
  }

  root?.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const mesh = child as THREE.Mesh
    const rawMaterial = mesh.material
    const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

    materials.forEach((material: THREE.Material) => {
      if (!material) {
        return
      }

      textureSlots.forEach((mapType) => {
        const texture = (material as THREE.MeshStandardMaterial)[mapType]
        if (texture?.isTexture) {
          addTexture(texture)
        }
      })
    })
  })

  if (environment.background === 'environment' && runtimeTextures.environmentBackground?.isTexture) {
    addTexture(runtimeTextures.environmentBackground)
  }

  if ((environment.kind === 'hdri' || environment.background === 'reflections') && runtimeTextures.environmentMap?.isTexture) {
    addTexture(runtimeTextures.environmentMap)
  }

  return [...uniqueTextures.values()]
}

function estimateTextureMemoryBytes(textures: THREE.Texture[]) {
  let totalBytes = 0

  textures.forEach((texture) => {
    const source = texture.source?.data
    const image = Array.isArray(source) ? source[0] : source ?? texture.image
    const width = image?.width ?? image?.videoWidth ?? 0
    const height = image?.height ?? image?.videoHeight ?? 0

    if (!width || !height) {
      return
    }

    const bytesPerPixel = 4
    const mipFactor = 4 / 3
    totalBytes += width * height * bytesPerPixel * mipFactor
  })

  return totalBytes
}

function getAdaptiveGridPalette(backgroundMode: 'none' | 'environment' | 'color' | 'reflections', backgroundColor: string) {
  if (backgroundMode !== 'color') {
    return {
      cellColor: 'rgba(255,255,255,0.4)',
      sectionColor: 'rgba(255,255,255,0.4)',
    }
  }

  const color = new THREE.Color(backgroundColor)
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  const neutralColor = luminance < 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'

  return {
    cellColor: neutralColor,
    sectionColor: neutralColor,
  }
}

function getAdaptiveHudStyle(backgroundMode: 'none' | 'environment' | 'color' | 'reflections', backgroundColor: string) {
  if (backgroundMode !== 'color') {
    return {
      color: 'rgba(245, 248, 250, 0.94)',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.65)',
      mutedColor: 'rgba(255, 255, 255, 0.76)',
      strongColor: 'rgba(255, 255, 255, 0.98)',
      headerColor: 'rgba(255, 255, 255, 0.92)',
    }
  }

  const color = new THREE.Color(backgroundColor)
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b

  if (luminance >= 0.5) {
    return {
      color: '#222222',
      textShadow: 'none',
      mutedColor: 'rgba(34, 34, 34, 0.82)',
      strongColor: '#111111',
      headerColor: '#000000',
    }
  }

  return {
    color: 'rgba(245, 248, 250, 0.94)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.65)',
    mutedColor: 'rgba(255, 255, 255, 0.76)',
    strongColor: 'rgba(255, 255, 255, 0.98)',
    headerColor: 'rgba(255, 255, 255, 0.92)',
  }
}

function FullscreenButton() {
  const [isFullscreenActive, setIsFullscreenActive] = useState(Boolean(document.fullscreenElement))

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement)
      setIsFullscreenActive(active)
      document.body.classList.toggle('is-fullscreen', active)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.body.classList.remove('is-fullscreen')
    }
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen()
    } else if (document.exitFullscreen) {
      void document.exitFullscreen()
    }
  }

  return (
    <button
      type="button"
      className={`fullscreen-button ${isFullscreenActive ? 'is-active' : ''}`}
      aria-label={isFullscreenActive ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={isFullscreenActive ? 'Exit fullscreen' : 'Enter fullscreen'}
      onClick={(event) => {
        event.stopPropagation()
        toggleFullscreen()
      }}
    >
      <svg className="fullscreen-button__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function RendererSettings() {
  const { gl } = useThree()

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.NoToneMapping
    gl.toneMappingExposure = 1
  }, [gl])

  return null
}

function PostProcessingComposer() {
  const { bloomEnabled, bloomIntensity, bloomThreshold, bloomSmoothing } = useViewportPresentation()
  const viewer = useEditorStore((state) => state.viewer)
  const normalizedFocusDistance = THREE.MathUtils.clamp((viewer.dofFocusDistance - 0.1) / (100 - 0.1), 0, 1)
  const apertureBlurMap: Record<number, number> = {
    1: 3.6,
    1.2: 3.1,
    1.4: 2.7,
    1.8: 2.1,
    2: 1.8,
    2.8: 1.1,
  }
  const physicalFocalLength = THREE.MathUtils.mapLinear(viewer.focalLength, 8, 200, 0.012, 0.14)
  const apertureBlur = apertureBlurMap[viewer.dofAperture] ?? 1.8
  const bokehScale = THREE.MathUtils.clamp(apertureBlur + viewer.dofManualBlur, 0, 10)

  return (
    <EffectComposer multisampling={0}>
      <ToneMapping
        mode={ToneMappingMode.REINHARD2}
        middleGrey={THREE.MathUtils.clamp(0.6 * viewer.exposure, 0.01, 4)}
        whitePoint={16}
        averageLuminance={1}
        minLuminance={0.01}
        adaptationRate={1}
      />
      {bloomEnabled ? (
        <Bloom
          luminanceThreshold={bloomThreshold}
          intensity={bloomIntensity}
          luminanceSmoothing={bloomSmoothing}
        />
      ) : (
        <></>
      )}
      {viewer.dofEnabled ? (
        <DepthOfField
          focusDistance={normalizedFocusDistance}
          focalLength={physicalFocalLength}
          bokehScale={bokehScale}
        />
      ) : (
        <></>
      )}
    </EffectComposer>
  )
}

function FocusAreaVisualizer() {
  const viewer = useEditorStore((state) => state.viewer)
  const planeRef = useRef<THREE.Mesh | null>(null)

  useFrame((state) => {
    if (!planeRef.current || !viewer.dofVisualizerEnabled) {
      return
    }

    planeRef.current.position.copy(state.camera.position)
    planeRef.current.rotation.copy(state.camera.rotation)
    planeRef.current.translateZ(-viewer.dofFocusDistance)
  })

  if (!viewer.dofVisualizerEnabled) {
    return null
  }

  return (
    <mesh ref={planeRef} visible={viewer.dofVisualizerEnabled} raycast={() => null}>
      <planeGeometry args={[500, 500]} />
      <meshBasicMaterial
        color="#00ff00"
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function FlightControls() {
  const { camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const lockInitialized = useRef(false)
  const keys = useRef({ KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyQ: false, KeyE: false })
  const flightSpeed = useEditorStore((state) => state.viewer.flightSpeed)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  useEffect(() => {
    const tryLock = () => {
      controlsRef.current?.lock()
    }

    tryLock()
    const frameId = window.requestAnimationFrame(tryLock)

    const handlePointerLockChange = () => {
      if (document.pointerLockElement) {
        lockInitialized.current = true
      } else if (lockInitialized.current) {
        setHud({ orbitEnabled: true })
        setViewer({ cameraMode: 'orbit' })
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^Digit[1-9]$/.test(event.code)) {
        setViewer({ flightSpeed: Number(event.key) })
      }

      if (event.code in keys.current) {
        keys.current[event.code as keyof typeof keys.current] = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code in keys.current) {
        keys.current[event.code as keyof typeof keys.current] = false
      }
    }

    const handleViewportClick = () => {
      if (!controlsRef.current?.isLocked) {
        controlsRef.current?.lock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    gl.domElement.addEventListener('click', handleViewportClick)
    document.addEventListener('pointerlockchange', handlePointerLockChange)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      gl.domElement.removeEventListener('click', handleViewportClick)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      lockInitialized.current = false
      keys.current = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyQ: false, KeyE: false }
      controlsRef.current?.unlock?.()
      if (document.pointerLockElement) {
        void document.exitPointerLock()
      }
    }
  }, [gl, setHud, setViewer])

  useFrame((_, delta) => {
    if (!controlsRef.current?.isLocked) {
      return
    }

    const speedMultiplier = Math.pow(1.7783, flightSpeed - 5)
    const moveSpeed = 10 * speedMultiplier * delta
    if (keys.current.KeyW) camera.translateZ(-moveSpeed)
    if (keys.current.KeyS) camera.translateZ(moveSpeed)
    if (keys.current.KeyA) camera.translateX(-moveSpeed)
    if (keys.current.KeyD) camera.translateX(moveSpeed)
    if (keys.current.KeyE) camera.position.y += moveSpeed
    if (keys.current.KeyQ) camera.position.y -= moveSpeed
  })

  return (
    <PointerLockControls ref={controlsRef} makeDefault />
  )
}

function SelectedLightHelper() {
  const { scene } = useThree()
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] : null,
  )
  const light = useEditorStore((state) =>
    selectedNode?.type === 'light' ? (state.runtime.objectById[selectedNode.id] as THREE.Light | null) : null,
  )
  const helperRef = useRef<THREE.Object3D | null>(null)

  useEffect(() => {
    if (helperRef.current) {
      scene.remove(helperRef.current)
      helperRef.current = null
    }

    if (!light) {
      return
    }

    let helper: THREE.Object3D | null = null

    if ((light as THREE.DirectionalLight).isDirectionalLight) {
      helper = new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 0.75, 0x8bcff2)
    } else if ((light as THREE.PointLight).isPointLight) {
      helper = new THREE.PointLightHelper(light as THREE.PointLight, 0.35, 0x8bcff2)
    } else if ((light as THREE.SpotLight).isSpotLight) {
      helper = new THREE.SpotLightHelper(light as THREE.SpotLight, 0x8bcff2)
    } else if ((light as THREE.HemisphereLight).isHemisphereLight) {
      helper = new THREE.HemisphereLightHelper(light as THREE.HemisphereLight, 0.45)
    }

    if (!helper) {
      return
    }

    helperRef.current = helper
    scene.add(helper)

    return () => {
      scene.remove(helper)
      helperRef.current = null
    }
  }, [light, scene, selectedObjectId])

  useFrame(() => {
    if (!helperRef.current) {
      return
    }

    if ('update' in helperRef.current && typeof helperRef.current.update === 'function') {
      helperRef.current.update()
    }
  })

  return null
}

function PerformanceProbe({
  root,
  onStats,
}: {
  root: THREE.Object3D | null
  onStats: (stats: RenderStats) => void
}) {
  const lastTelemetryRef = useRef(0)
  const fpsWindowRef = useRef({ lastTime: 0, frames: 0, fps: 0 })

  useFrame((state) => {
    fpsWindowRef.current.frames += 1
    if (state.clock.elapsedTime - fpsWindowRef.current.lastTime >= 1) {
      fpsWindowRef.current.fps =
        fpsWindowRef.current.frames / Math.max(state.clock.elapsedTime - fpsWindowRef.current.lastTime, 0.0001)
      fpsWindowRef.current.frames = 0
      fpsWindowRef.current.lastTime = state.clock.elapsedTime
    }

    if (state.clock.elapsedTime - lastTelemetryRef.current < 0.2) {
      return
    }
    lastTelemetryRef.current = state.clock.elapsedTime

    const editorState = useEditorStore.getState()
    const selectedNode = editorState.selectedObjectId ? editorState.sceneGraph[editorState.selectedObjectId] : null
    const selectedRuntimeObject =
      selectedNode?.type === 'material' && selectedNode.parentId
        ? editorState.runtime.objectById[selectedNode.parentId]
        : selectedNode
          ? editorState.runtime.objectById[selectedNode.id]
          : null
    const selectedMesh =
      selectedRuntimeObject && (selectedRuntimeObject as THREE.Mesh).isMesh ? (selectedRuntimeObject as THREE.Mesh) : null
    const totalStats = getMeshStats(root)
    const selectedStats = getMeshStats(selectedMesh)
    const meshCount = countMeshObjects(root)
    const environment = editorState.environment
    const runtimeTextures = editorState.runtimeTextures
    const assetTextures = calculateAssetTextures(root, environment, runtimeTextures)
    const textureMemoryMb = estimateTextureMemoryBytes(assetTextures) / (1024 * 1024)
    onStats({
      calls: meshCount,
      fps: Math.round(fpsWindowRef.current.fps),
      totalVertices: totalStats.vertices,
      totalTriangles: totalStats.triangles,
      selectedName: selectedNode?.label ?? selectedMesh?.name ?? 'None',
      selectedVertices: selectedStats.vertices,
      selectedTriangles: selectedStats.triangles,
      textureCount: assetTextures.length,
      textureMemoryMb,
      fileSize: editorState.assets.fileSize,
    })
  })

  return null
}

function SceneLights() {
  const extraLights = useEditorStore((state) => state.extraLights)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)

  return (
    <>
      {extraLights.map((light) => (
        <ManagedExtraLight
          key={light.id}
          light={light}
          registerObjectRef={registerObjectRef}
          updateExtraLight={updateExtraLight}
          updateObjectTransform={updateObjectTransform}
        />
      ))}
    </>
  )
}

function ManagedExtraLight({
  light,
  registerObjectRef,
  updateExtraLight,
  updateObjectTransform,
}: {
  light: ExtraLightState
  registerObjectRef: (id: string, object: THREE.Object3D | null) => void
  updateExtraLight: (id: string, patch: Partial<ExtraLightState>) => void
  updateObjectTransform: (id: string, patch: { position: [number, number, number] }) => void
}) {
  const ref = useRef<THREE.PointLight | null>(null)

  useEffect(() => {
    registerObjectRef(light.id, ref.current)
    return () => {
      registerObjectRef(light.id, null)
    }
  }, [light.id, registerObjectRef])

  useFrame(() => {
    if (!ref.current) {
      return
    }

    const nextPosition: [number, number, number] = [ref.current.position.x, ref.current.position.y, ref.current.position.z]
    if (
      nextPosition[0] !== light.position[0] ||
      nextPosition[1] !== light.position[1] ||
      nextPosition[2] !== light.position[2]
    ) {
      updateExtraLight(light.id, { position: nextPosition })
      updateObjectTransform(light.id, { position: nextPosition })
    }
  })

  return (
    <pointLight
      ref={ref}
      position={light.position}
      intensity={light.intensity}
      distance={light.distance}
      decay={light.decay}
      color={light.color}
      visible={light.visible}
    />
  )
}

function SceneRuntime({
  controlsRef,
  onStats,
  registerResetCamera,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  onStats: (stats: RenderStats) => void
  registerResetCamera: (handler: () => void) => void
}) {
  const { camera } = useThree()
  const hud = useEditorStore((state) => state.hud)
  const viewer = useEditorStore((state) => state.viewer)
  const runtimeTextures = useEditorStore((state) => state.runtimeTextures)
  const environment = useEditorStore((state) => state.environment)
  const sceneResetNonce = useEditorStore((state) => state.sceneResetNonce)
  const [root, setRoot] = useState<THREE.Object3D | null>(null)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)
  const gridPalette = getAdaptiveGridPalette(environment.background, environment.backgroundColor)

  useEffect(() => {
    setRoot(null)
  }, [sceneResetNonce])

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera

    const resetCamera = () => {
      const fallbackPosition: [number, number, number] = [4, 3, 5]
      const fallbackTarget: [number, number, number] = [0, 0, 0]
      const framed = root ? fitCameraToObject(perspectiveCamera, controlsRef.current, root) : null
      const nextPosition: [number, number, number] = framed
        ? [framed.position.x, framed.position.y, framed.position.z]
        : fallbackPosition
      const nextTarget: [number, number, number] = framed
        ? [framed.target.x, framed.target.y, framed.target.z]
        : fallbackTarget

      if (!framed) {
        perspectiveCamera.position.set(...nextPosition)
        perspectiveCamera.lookAt(...nextTarget)
        perspectiveCamera.updateProjectionMatrix()

        if (controlsRef.current) {
          controlsRef.current.target.set(...nextTarget)
          controlsRef.current.update()
        }
      }

      setHud({ orbitEnabled: true })
      setViewer({
        cameraMode: 'orbit',
        cameraPosition: nextPosition,
        orbitTarget: nextTarget,
      })
    }

    registerResetCamera(resetCamera)
    return () => {
      registerResetCamera(() => {})
    }
  }, [camera, controlsRef, registerResetCamera, root, setHud, setViewer])

  useEffect(() => {
    if (viewer.cameraMode !== 'firstPerson') {
      return
    }

    setHud({ orbitEnabled: false })
    setViewer({ cameraPosition: [camera.position.x, camera.position.y, camera.position.z] })
  }, [camera, controlsRef, setHud, setViewer, viewer.cameraMode])

  return (
    <>
      <AssetController controlsRef={controlsRef} onRootLoaded={setRoot} />
      <ConfigController root={root} controlsRef={controlsRef} />
      <SceneBindings />
      <RendererSettings />
      <ViewerSync controlsRef={controlsRef} />
      <color attach="background" args={['#808080']} />
      <SceneLights />
      <SelectedLightHelper />
      <PerformanceProbe root={root} onStats={onStats} />
      {hud.gridVisible ? (
        <Grid
          args={[6, 6]}
          position={[0, -0.002, 0]}
          cellColor={gridPalette.cellColor}
          sectionColor={gridPalette.sectionColor}
          fadeDistance={7}
          fadeStrength={1.7}
          cellSize={0.25}
          sectionSize={1}
          infiniteGrid={false}
        />
      ) : null}
      {hud.axesVisible ? <axesHelper args={[2]} /> : null}
      <FocusAreaVisualizer />
      {root ? <LoadedSceneRoot root={root} /> : null}
      {viewer.cameraMode === 'orbit' ? (
        <OrbitControls
          ref={controlsRef}
          enabled={hud.orbitEnabled}
          makeDefault
          onChange={() => {
            if (!controlsRef.current) {
              return
            }
            setViewer({
              orbitTarget: [
                controlsRef.current.target.x,
                controlsRef.current.target.y,
                controlsRef.current.target.z,
              ],
            })
          }}
        />
      ) : null}
      {viewer.cameraMode === 'firstPerson' ? <FlightControls /> : null}
      <PostProcessingComposer />
      {hud.fpsEnabled ? <Stats showPanel={0} className="stats-panel" /> : null}
    </>
  )
}

export function SceneCanvas() {
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const environment = useEditorStore((state) => state.environment)
  const [stats, setStats] = useState<RenderStats>({
    calls: 0,
    fps: 0,
    totalVertices: 0,
    totalTriangles: 0,
    selectedName: 'None',
    selectedVertices: 0,
    selectedTriangles: 0,
    textureCount: 0,
    textureMemoryMb: 0,
    fileSize: null,
  })
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const resetCameraRef = useRef<() => void>(() => {})
  const hudStyle = getAdaptiveHudStyle(environment.background, environment.backgroundColor)

  return (
    <div className="viewport-shell">
      <FullscreenButton />
      <div
        className="performance-stats"
        style={
          {
            color: hudStyle.color,
            textShadow: hudStyle.textShadow,
            '--performance-muted-color': hudStyle.mutedColor,
            '--performance-strong-color': hudStyle.strongColor,
            '--performance-header-color': hudStyle.headerColor,
          } as React.CSSProperties
        }
      >
        <div className="performance-stats__row performance-stats__row--header">
          <span />
          <span>TOTAL</span>
          <span>{stats.selectedName}</span>
        </div>
        <div className="performance-stats__row">
          <span>VERTICES</span>
          <strong>{formatCompactMetric(stats.totalVertices)}</strong>
          <strong>{formatCompactMetric(stats.selectedVertices)}</strong>
        </div>
        <div className="performance-stats__row">
          <span>TRIANGLES</span>
          <strong>{formatCompactMetric(stats.totalTriangles)}</strong>
          <strong>{formatCompactMetric(stats.selectedTriangles)}</strong>
        </div>
        <div className="performance-stats__spacer" />
        <div className="performance-stats__row">
          <span>VRAM TEXTURES</span>
          <strong>{`${stats.textureCount} (${(stats.textureMemoryMb + (stats.totalVertices * 44) / (1024 * 1024)).toFixed(1)} MB)`}</strong>
          <strong />
        </div>
        <div className="performance-stats__row">
          <span>DISK</span>
          <strong>{stats.fileSize == null ? '--' : `${(stats.fileSize / 1000 / 1000).toFixed(2)} MB`}</strong>
          <strong />
        </div>
        <div className="performance-stats__row">
          <span>DRAW CALLS</span>
          <strong>{formatCompactMetric(stats.calls)}</strong>
          <strong />
        </div>
        <div className="performance-stats__row">
          <span>FPS</span>
          <strong>{stats.fps}</strong>
          <strong />
        </div>
      </div>
      <ViewportHud onResetCamera={() => resetCameraRef.current()} />
      <Canvas
        camera={{ position: [4, 3, 5], fov: 55 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onPointerMissed={(event) => {
          window.dispatchEvent(new Event('scene-pointer-missed'))
          const pointerEvent = event as MouseEvent & { delta?: number }
          if ((pointerEvent.delta ?? 0) <= 2) {
            setSelectedObjectId(null)
          }
        }}
      >
        <SceneRuntime
          controlsRef={controlsRef}
          onStats={setStats}
          registerResetCamera={(handler) => {
            resetCameraRef.current = handler
          }}
        />
      </Canvas>
    </div>
  )
}
