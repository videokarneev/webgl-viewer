import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { applyViewerCameraOptics } from '../features/scene/runtime/shared'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import { DEFAULT_VIEWER_CAMERA_FOV, useEditorStore } from '../store/editorStore'
import { MaterialEffectController } from './MaterialEffectController'
import { SceneAnimationController } from './SceneAnimationController'
import { LightRig } from './viewport/LightRig'

function TransparentRendererBridge() {
  const { gl } = useThree()
  const exposure = useEditorStore((state) => state.viewer.exposure)

  useEffect(() => {
    gl.domElement.style.background = 'transparent'
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.setClearColor(0x000000, 0)
  }, [exposure, gl])

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

  return null
}

function TransparentCameraBridge({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree()
  const viewer = useEditorStore((state) => state.viewer)

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    perspectiveCamera.position.set(...viewer.cameraPosition)
    applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)

    if (controlsRef.current) {
      controlsRef.current.target.set(...viewer.orbitTarget)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, viewer.cameraPosition, viewer.focalLength, viewer.orbitTarget])

  return <ViewerSync controlsRef={controlsRef} />
}

function TransparentSceneBridge() {
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

  if (!roots.length) {
    return null
  }

  return (
    <>
      {roots.map((entry) => (
        <LoadedSceneRoot key={entry.rootNodeId} root={entry.root} selectable={false} />
      ))}
    </>
  )
}

function TransparentPublishedScene() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const viewer = useEditorStore((state) => state.viewer)

  return (
    <>
      <TransparentRendererBridge />
      <TransparentEnvironmentBridge />
      <TransparentCameraBridge controlsRef={controlsRef} />
      <Suspense fallback={null}>
        <LightRig />
        <TransparentSceneBridge />
        <MaterialEffectController />
        <SceneAnimationController />
      </Suspense>
      {viewer.cameraMode === 'orbit' ? <OrbitControls ref={controlsRef} makeDefault /> : null}
    </>
  )
}

export function TransparentPublishedViewport() {
  const viewer = useEditorStore((state) => state.viewer)

  return (
    <div className="transparent-published-viewport">
      <Canvas
        className="transparent-published-viewport__canvas"
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        gl={(defaults) =>
          new THREE.WebGLRenderer({
            ...defaults,
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
          })
        }
        camera={{
          position: viewer.cameraPosition,
          fov: DEFAULT_VIEWER_CAMERA_FOV,
          near: 0.1,
          far: 2000,
        }}
        onCreated={({ gl, scene }) => {
          gl.domElement.style.background = 'transparent'
          gl.setClearColor(0x000000, 0)
          gl.setClearAlpha(0)
          scene.background = null
        }}
      >
        <TransparentPublishedScene />
      </Canvas>
    </div>
  )
}
