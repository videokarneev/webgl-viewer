import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
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

type PerformanceSnapshot = {
  fps: number
  triangles: number
  vertices: number
  drawCalls: number
}

function getVertexCount(object: THREE.Object3D | null) {
  if (!object) {
    return 0
  }

  let vertices = 0
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const geometry = (child as THREE.Mesh).geometry
    const position = geometry?.getAttribute('position')
    if (!position) {
      return
    }

    vertices += position.count
  })

  return Math.round(vertices)
}

function getTriangleCount(object: THREE.Object3D | null) {
  if (!object) {
    return 0
  }

  let triangles = 0
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const geometry = (child as THREE.Mesh).geometry
    const position = geometry?.getAttribute('position')
    if (!position) {
      return
    }

    triangles += geometry.index ? geometry.index.count / 3 : position.count / 3
  })

  return Math.round(triangles)
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
    onSample({
      fps: Math.round(fpsWindowRef.current.fps),
      triangles: rootNodeId && root ? getTriangleCount(root) : 0,
      vertices: rootNodeId && root ? getVertexCount(root) : 0,
      drawCalls: state.gl.info.render.calls,
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
  const viewer = useEditorStore((state) => state.viewer)
  const hud = useEditorStore((state) => state.hud)
  const root = useEditorStore((state) =>
    state.rootNodeId ? state.runtime.objectById[state.rootNodeId] ?? null : null,
  )

  useEffect(() => {
    registerResetCamera(() => {
      if (!root) {
        return
      }

      const camera = controlsRef.current?.object as THREE.PerspectiveCamera | undefined
      if (!camera) {
        return
      }

      fitCameraToObject(camera, controlsRef.current, root)
      useEditorStore.getState().setHud({ orbitEnabled: true })
      useEditorStore.getState().setViewer({ cameraMode: 'orbit' })
    })

    return () => {
      registerResetCamera(() => {})
    }
  }, [registerResetCamera, root])

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
          cellColor="rgba(80, 96, 107, 0.8)"
          sectionColor="rgba(35, 45, 52, 0.8)"
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
    </>
  )
}

function PerformanceStats() {
  const metrics = useEditorStore((state) => state.viewportMetrics)
  const textureCount = useEditorStore((state) =>
    Object.values(state.runtime.materialById).reduce((count, material) => {
      const standardMaterial = material as {
        map?: unknown
        emissiveMap?: unknown
        normalMap?: unknown
        roughnessMap?: unknown
        metalnessMap?: unknown
        aoMap?: unknown
      }

      return (
        count +
        Number(Boolean(standardMaterial.map)) +
        Number(Boolean(standardMaterial.emissiveMap)) +
        Number(Boolean(standardMaterial.normalMap)) +
        Number(Boolean(standardMaterial.roughnessMap)) +
        Number(Boolean(standardMaterial.metalnessMap)) +
        Number(Boolean(standardMaterial.aoMap))
      )
    }, 0),
  )
  const assets = useEditorStore((state) => state.assets)
  const vramMb = useEditorStore((state) => {
    const textures = new Map<string, { width: number; height: number }>()

    Object.values(state.runtime.materialById).forEach((material) => {
      const standardMaterial = material as {
        map?: { uuid: string; image?: { width?: number; height?: number } }
        emissiveMap?: { uuid: string; image?: { width?: number; height?: number } }
        normalMap?: { uuid: string; image?: { width?: number; height?: number } }
        roughnessMap?: { uuid: string; image?: { width?: number; height?: number } }
        metalnessMap?: { uuid: string; image?: { width?: number; height?: number } }
        aoMap?: { uuid: string; image?: { width?: number; height?: number } }
      }

      ;['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((slot) => {
        const texture = standardMaterial[slot as keyof typeof standardMaterial] as
          | { uuid: string; image?: { width?: number; height?: number } }
          | undefined
        if (!texture?.uuid) {
          return
        }
        textures.set(texture.uuid, {
          width: texture.image?.width ?? 512,
          height: texture.image?.height ?? 512,
        })
      })
    })

    const totalBytes = Array.from(textures.values()).reduce(
      (sum, texture) => sum + texture.width * texture.height * 4 * 1.33,
      0,
    )

    return totalBytes / (1024 * 1024)
  })

  return (
    <div className="performance-stats">
      <div className="performance-stats__row performance-stats__row--header">
        <span>METRIC</span>
        <span>TOTAL</span>
        <span>NONE</span>
      </div>
      <div className="performance-stats__row">
        <span>VERTICES</span>
        <strong>{metrics.vertices.toLocaleString('en-US')}</strong>
        <strong>0</strong>
      </div>
      <div className="performance-stats__row">
        <span>TRIANGLES</span>
        <strong>{metrics.triangles.toLocaleString('en-US')}</strong>
        <strong>0</strong>
      </div>
      <div className="performance-stats__spacer" />
      <div className="performance-stats__row">
        <span>VRAM TEXTURES</span>
        <strong>{textureCount} ({vramMb.toFixed(1)} MB)</strong>
        <strong>--</strong>
      </div>
      <div className="performance-stats__row">
        <span>DISK</span>
        <strong>{assets.fileSize ? `${(assets.fileSize / 1024 / 1024).toFixed(1)} MB` : '--'}</strong>
        <strong>--</strong>
      </div>
      <div className="performance-stats__row">
        <span>DRAW CALLS</span>
        <strong>{metrics.drawCalls.toLocaleString('en-US')}</strong>
        <strong>--</strong>
      </div>
      <div className="performance-stats__row">
        <span>FPS</span>
        <strong>{metrics.fps.toLocaleString('en-US')}</strong>
        <strong>--</strong>
      </div>
    </div>
  )
}

export function Viewport() {
  const status = useEditorStore((state) => state.status)
  const hud = useEditorStore((state) => state.hud)
  const setHud = useEditorStore((state) => state.setHud)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setViewportMetrics = useEditorStore((state) => state.setViewportMetrics)
  const viewer = useEditorStore((state) => state.viewer)
  const resetCameraRef = useRef<() => void>(() => {})

  return (
    <main className="viewport-wrap">
      <Canvas
        className="viewport-canvas"
        dpr={[1, 2]}
        gl={{ antialias: true }}
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
    </main>
  )
}
