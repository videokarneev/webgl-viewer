import { Suspense, useMemo } from 'react'
import { Environment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'

export function EnvironmentManager() {
  const { scene } = useThree()
  const environment = useEditorStore((state) => state.environment)
  const runtimeTextures = useEditorStore((state) => state.runtimeTextures)
  const fallbackBackgroundColor = useMemo(
    () => new THREE.Color(environment.backgroundColor),
    [environment.backgroundColor],
  )

  useFrame(() => {
    const fallbackEnvironment = environment.isEnvironmentEnabled
      ? (scene.environment as THREE.Texture | null)
      : null
    const reflectionsTexture = runtimeTextures.environmentMap ?? fallbackEnvironment
    const shouldPreviewReflections =
      environment.previewReflections &&
      Boolean(environment.customHdriUrl) &&
      Boolean(reflectionsTexture)

    scene.environment =
      runtimeTextures.environmentMap ?? (environment.isEnvironmentEnabled ? fallbackEnvironment : null)
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    scene.backgroundIntensity = environment.backgroundIntensity
    scene.backgroundBlurriness = environment.backgroundBlur
    scene.backgroundRotation.set(
      0,
      THREE.MathUtils.degToRad(
        environment.previewReflections ? environment.rotation : environment.backgroundRotation,
      ),
      0,
    )

    if (shouldPreviewReflections && reflectionsTexture) {
      scene.background = reflectionsTexture
      return
    }

    if (!environment.backgroundVisible || environment.background === 'none') {
      scene.background = null
      return
    }

    if (environment.background === 'environment' && runtimeTextures.environmentBackground) {
      scene.background = runtimeTextures.environmentBackground
      return
    }

    if (environment.background === 'reflections' && reflectionsTexture) {
      scene.background = reflectionsTexture
      return
    }

    scene.background = fallbackBackgroundColor
  })

  return (
    <Suspense fallback={null}>
      {environment.isEnvironmentEnabled && !runtimeTextures.environmentMap ? (
        <Environment preset="city" />
      ) : null}
    </Suspense>
  )
}
