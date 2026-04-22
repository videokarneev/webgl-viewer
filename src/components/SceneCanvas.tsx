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
import { TransformGizmo } from '../features/scene/runtime/TransformGizmo'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import { fitCameraToObject } from '../features/scene/runtime/shared'
import { useViewportPresentation } from '../features/viewport/ViewportPresentationContext'
import type { ExtraLightState } from '../store/editorStore'

type RenderStats = {
  calls: number
  triangles: number
  selectedTriangles: number
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

function getTriangleCount(object: THREE.Object3D | null) {
  if (!object) {
    return 0
  }

  let triangleCount = 0
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }
    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry
    if (!geometry) {
      return
    }

    if (geometry.index) {
      triangleCount += geometry.index.count / 3
      return
    }

    const position = geometry.getAttribute('position')
    if (position) {
      triangleCount += position.count / 3
    }
  })

  return Math.round(triangleCount)
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

function PerformanceProbe({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const { gl } = useThree()
  const lastUpdateRef = useRef(0)

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdateRef.current < 0.2) {
      return
    }
    lastUpdateRef.current = state.clock.elapsedTime

    const editorState = useEditorStore.getState()
    const selectedNode = editorState.selectedObjectId ? editorState.sceneGraph[editorState.selectedObjectId] : null
    const selectedRuntimeObject =
      selectedNode?.type === 'material' && selectedNode.parentId
        ? editorState.runtime.objectById[selectedNode.parentId]
        : selectedNode
          ? editorState.runtime.objectById[selectedNode.id]
          : null

    onStats({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      selectedTriangles: getTriangleCount(selectedRuntimeObject ?? null),
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
  const sceneResetNonce = useEditorStore((state) => state.sceneResetNonce)
  const [root, setRoot] = useState<THREE.Object3D | null>(null)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  useEffect(() => {
    setRoot(null)
  }, [sceneResetNonce])

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera

    const resetCamera = () => {
      const fallbackPosition: [number, number, number] = [3.4, 2.2, 5.6]
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
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    if (viewer.cameraMode !== 'firstPerson') {
      return
    }

    const nextPosition: [number, number, number] = [0, 1.6, 5]
    const lookTarget = new THREE.Vector3(0, 1.6, 0)

    perspectiveCamera.position.set(...nextPosition)
    perspectiveCamera.lookAt(lookTarget)
    perspectiveCamera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }

    setHud({ orbitEnabled: false })
    setViewer({
      cameraPosition: nextPosition,
      orbitTarget: [0, 0, 0],
    })
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
      <PerformanceProbe onStats={onStats} />
      {hud.gridVisible ? (
        <Grid
          args={[6, 6]}
          position={[0, -0.002, 0]}
          cellColor="#101418"
          sectionColor="#171d22"
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
      <TransformGizmo />
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
      {viewer.cameraMode === 'firstPerson' ? <PointerLockControls makeDefault /> : null}
      <PostProcessingComposer />
      {hud.fpsEnabled ? <Stats showPanel={0} className="stats-panel" /> : null}
    </>
  )
}

export function SceneCanvas() {
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const [stats, setStats] = useState<RenderStats>({ calls: 0, triangles: 0, selectedTriangles: 0 })
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const resetCameraRef = useRef<() => void>(() => {})

  return (
    <div className="viewport-shell">
      <div className="performance-stats">
        <div>
          <span>Draw Calls</span>
          <strong>{stats.calls}</strong>
        </div>
        <div>
          <span>Triangles</span>
          <strong>{stats.triangles.toLocaleString()}</strong>
        </div>
        <div>
          <span>Selected</span>
          <strong>{stats.selectedTriangles.toLocaleString()}</strong>
        </div>
      </div>
      <ViewportHud onResetCamera={() => resetCameraRef.current()} />
      <Canvas
        camera={{ position: [3.4, 2.2, 5.6], fov: 55 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onPointerMissed={(event) => {
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
