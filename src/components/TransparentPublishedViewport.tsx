import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { CustomSceneBoxes } from '../features/scene/runtime/CustomSceneBoxes'
import { FocusInteractionController } from '../features/scene/runtime/FocusInteractionController'
import { LoadedSceneRoot } from '../features/scene/runtime/LoadedSceneRoot'
import { ShowcaseInteractionController } from '../features/scene/runtime/ShowcaseInteractionController'
import { applyViewerCameraOptics } from '../features/scene/runtime/shared'
import { useShowcaseMotionSensor } from '../features/scene/runtime/useShowcaseMotionSensor'
import { ViewerSync } from '../features/scene/runtime/ViewerSync'
import { DEFAULT_VIEWER_CAMERA_FOV, type FrameAspectPreset, useEditorStore } from '../store/editorStore'
import { MaterialEffectController } from './MaterialEffectController'
import { SceneAnimationController } from './SceneAnimationController'
import { LightRig } from './viewport/LightRig'

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

function getBackgroundOverrideColor() {
  const value = new URL(window.location.href).searchParams.get('bg')
  if (!value) {
    return null
  }

  const normalized = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null
}

function TransparentRendererBridge() {
  const { gl } = useThree()
  const exposure = useEditorStore((state) => state.viewer.exposure)
  const backgroundOverride = getBackgroundOverrideColor()

  useEffect(() => {
    gl.domElement.style.background = 'transparent'
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.setClearColor(new THREE.Color(backgroundOverride ?? '#000000'), backgroundOverride ? 1 : 0)
    gl.setClearAlpha(backgroundOverride ? 1 : 0)
  }, [backgroundOverride, exposure, gl])

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

function TransparentCameraBridge({
  controlsRef,
  cameraOffsetRef,
  targetOffsetRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  cameraOffsetRef: React.MutableRefObject<THREE.Vector3>
  targetOffsetRef: React.MutableRefObject<THREE.Vector3>
}) {
  const { camera, size } = useThree()
  const viewer = useEditorStore((state) => state.viewer)

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    perspectiveCamera.aspect = size.width / Math.max(size.height, 1)
    perspectiveCamera.position.set(...viewer.cameraPosition)
    applyViewerCameraOptics(perspectiveCamera, viewer.focalLength)

    if (controlsRef.current) {
      controlsRef.current.target
        .set(...viewer.orbitTarget)
        .add(targetOffsetRef.current)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, size.height, size.width, targetOffsetRef, viewer.cameraPosition, viewer.focalLength, viewer.orbitTarget])

  return <ViewerSync controlsRef={controlsRef} cameraOffsetRef={cameraOffsetRef} targetOffsetRef={targetOffsetRef} />
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
  const showcaseCameraOffsetRef = useRef(new THREE.Vector3())
  const showcaseTargetOffsetRef = useRef(new THREE.Vector3())
  const showcaseMotion = useShowcaseMotionSensor()
  const viewer = useEditorStore((state) => state.viewer)
  const focusOrbitBlocked = useEditorStore((state) =>
    Boolean(state.focusAnimation.isAdded && state.focusAnimation.enabled && state.focusAnimation.focused),
  )

  return (
    <>
      <TransparentRendererBridge />
      <TransparentEnvironmentBridge />
      <TransparentCameraBridge
        controlsRef={controlsRef}
        cameraOffsetRef={showcaseCameraOffsetRef}
        targetOffsetRef={showcaseTargetOffsetRef}
      />
      <Suspense fallback={null}>
        <LightRig />
        <TransparentSceneBridge />
        <CustomSceneBoxes selectable={false} />
        <MaterialEffectController />
        <SceneAnimationController />
        <FocusInteractionController />
        <ShowcaseInteractionController
          controlsRef={controlsRef}
          cameraOffsetRef={showcaseCameraOffsetRef}
          targetOffsetRef={showcaseTargetOffsetRef}
          gyroSampleRef={showcaseMotion.sampleRef}
        />
      </Suspense>
      {viewer.cameraMode === 'orbit' ? <OrbitControls ref={controlsRef} enabled={!focusOrbitBlocked} makeDefault /> : null}
    </>
  )
}

export function TransparentPublishedViewport() {
  const viewer = useEditorStore((state) => state.viewer)
  const backgroundOverride = getBackgroundOverrideColor()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 })
  const frameAspect = getFrameAspectValue(
    viewer.frameAspectPreset,
    containerSize.width / Math.max(containerSize.height, 1),
  )
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

  return (
    <div ref={containerRef} className="transparent-published-viewport">
      <div className="transparent-published-viewport__stage" style={frameStyle}>
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
            gl.setClearColor(new THREE.Color(backgroundOverride ?? '#000000'), backgroundOverride ? 1 : 0)
            gl.setClearAlpha(backgroundOverride ? 1 : 0)
            scene.background = null
          }}
        >
          <TransparentPublishedScene />
        </Canvas>
      </div>
    </div>
  )
}
