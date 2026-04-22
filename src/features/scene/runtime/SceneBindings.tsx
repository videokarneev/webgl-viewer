import { Suspense, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

export function SceneBindings() {
  const { scene, camera } = useThree()
  const environment = useEditorStore((state) => state.environment)
  const viewer = useEditorStore((state) => state.viewer)
  const runtimeTextures = useEditorStore((state) => state.runtimeTextures)
  const backgroundColor = new THREE.Color(environment.backgroundColor)

  useFrame(() => {
    const fallbackEnvironment = scene.environment as THREE.Texture | null
    const reflectionsTexture = runtimeTextures.environmentMap ?? fallbackEnvironment
    if (runtimeTextures.environmentMap) {
      scene.environment = runtimeTextures.environmentMap
    }
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    scene.backgroundIntensity = environment.backgroundIntensity
    scene.backgroundBlurriness = environment.backgroundBlur
    scene.backgroundRotation.set(
      0,
      THREE.MathUtils.degToRad(environment.previewReflections ? environment.rotation : environment.backgroundRotation),
      0,
    )

    if (environment.previewReflections && reflectionsTexture) {
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

  return (
    <Suspense fallback={null}>
      {!runtimeTextures.environmentMap ? <Environment preset="city" /> : null}
    </Suspense>
  )
}
