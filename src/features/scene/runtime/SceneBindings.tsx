import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

export function SceneBindings() {
  const { scene, camera } = useThree()
  const environment = useEditorStore((state) => state.environment)
  const ambient = useEditorStore((state) => state.lights.ambient)
  const viewer = useEditorStore((state) => state.viewer)
  const runtimeTextures = useEditorStore((state) => state.runtimeTextures)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const backgroundColor = new THREE.Color(environment.backgroundColor)
  const ambientRef = useRef<THREE.AmbientLight | null>(null)

  useFrame(() => {
    const fallbackEnvironment = environment.isEnvironmentEnabled ? (scene.environment as THREE.Texture | null) : null
    const reflectionsTexture = runtimeTextures.environmentMap ?? fallbackEnvironment
    const shouldShowReflectionPreview =
      environment.previewReflections &&
      Boolean(environment.customHdriUrl) &&
      Boolean(reflectionsTexture)

    scene.environment = runtimeTextures.environmentMap ?? (environment.isEnvironmentEnabled ? fallbackEnvironment : null)
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    scene.backgroundIntensity = environment.backgroundIntensity
    scene.backgroundBlurriness = environment.backgroundBlur
    scene.backgroundRotation.set(
      0,
      THREE.MathUtils.degToRad(environment.previewReflections ? environment.rotation : environment.backgroundRotation),
      0,
    )

    if (shouldShowReflectionPreview && reflectionsTexture) {
      scene.background = reflectionsTexture
      return
    }

    if (!environment.backgroundVisible || environment.background === 'none') {
      scene.background = null
      return
    }

    if (runtimeTextures.environmentBackground && environment.background === 'environment') {
      scene.background = runtimeTextures.environmentBackground
      return
    }

    if (environment.background === 'reflections' && reflectionsTexture) {
      scene.background = reflectionsTexture
      return
    }

    scene.background = backgroundColor
  })

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    perspectiveCamera.position.set(...viewer.cameraPosition)
    perspectiveCamera.setFocalLength(viewer.focalLength)
    perspectiveCamera.updateProjectionMatrix()
  }, [camera, viewer.cameraPosition, viewer.focalLength])

  useEffect(() => {
    registerObjectRef('light:ambient:system', ambientRef.current)
    return () => {
      registerObjectRef('light:ambient:system', null)
    }
  }, [ambient.exists, registerObjectRef])

  return (
    <Suspense fallback={null}>
      {ambient.exists ? (
        <ambientLight
          ref={ambientRef}
          color={ambient.color}
          intensity={ambient.visible ? ambient.intensity : 0}
          visible={ambient.visible}
        />
      ) : null}
      {environment.isEnvironmentEnabled && !runtimeTextures.environmentMap ? <Environment preset="city" /> : null}
    </Suspense>
  )
}
