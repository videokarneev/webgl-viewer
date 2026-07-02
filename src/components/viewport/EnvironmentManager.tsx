import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { useEditorStore } from '../../store/editorStore'

function loadEnvironmentTexture(url: string) {
  if (/\.exr($|\?)/i.test(url)) {
    return new EXRLoader().loadAsync(url)
  }

  if (/\.hdr($|\?)/i.test(url)) {
    return new RGBELoader().loadAsync(url)
  }

  return Promise.reject(new Error(`Unsupported environment format: ${url}`))
}

export function EnvironmentManager() {
  const { scene } = useThree()
  const environment = useEditorStore((state) => state.environment)
  const defaultEnvUrl = useEditorStore((state) => state.defaultEnvUrl)
  const backgroundMode = useEditorStore((state) => state.backgroundMode)
  const backgroundColorValue = useEditorStore((state) => state.backgroundColor)
  const backgroundRotation = useEditorStore((state) => state.backgroundRotation)
  const runtimeTextures = useEditorStore((state) => state.runtimeTextures)
  const setEnvironmentTextures = useEditorStore((state) => state.setEnvironmentTextures)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const fallbackBackgroundColor = useMemo(
    () => new THREE.Color(backgroundColorValue),
    [backgroundColorValue],
  )
  const currentEnvMap = runtimeTextures.environmentMap
  const currentBackgroundMap = runtimeTextures.environmentBackground
  const previewMaterialTexture = environment.previewMaterialEnvironmentId
    ? runtimeTextures.materialEnvironmentMaps[environment.previewMaterialEnvironmentId] ?? null
    : null

  useEffect(() => {
    if (!environment.isEnvironmentEnabled || currentEnvMap) {
      return
    }

    let disposed = false

    void loadEnvironmentTexture(defaultEnvUrl)
      .then((texture) => {
        if (disposed || !texture) {
          texture?.dispose()
          return
        }

        if (!texture.image) {
          texture.dispose()
          console.error(`[HDRI Error]: Default map not found at ${defaultEnvUrl}`)
          return
        }

        texture.mapping = THREE.EquirectangularReflectionMapping
        setEnvironmentTextures({ environmentMap: texture })
        setEnvironment({
          customHdriUrl: defaultEnvUrl,
          kind: 'hdri',
          isEnvironmentEnabled: true,
        })
      })
      .catch((error) => {
        console.error(`[HDRI Error]: Default map not found at ${defaultEnvUrl}`, error)
      })

    return () => {
      disposed = true
    }
  }, [currentEnvMap, defaultEnvUrl, environment.isEnvironmentEnabled, setEnvironment, setEnvironmentTextures])

  useEffect(() => {
    scene.environment = environment.isEnvironmentEnabled ? currentEnvMap : null

    if (previewMaterialTexture) {
      scene.background = previewMaterialTexture
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(environment.previewMaterialEnvironmentRotation), 0)
      return
    }

    if (environment.previewReflections && environment.isEnvironmentEnabled && currentEnvMap) {
      scene.background = currentEnvMap
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
      return
    }

    if (environment.isEnvironmentEnabled && backgroundMode === 'hdri' && currentEnvMap) {
      scene.background = currentEnvMap
      return
    }

    if (backgroundMode === 'background' && currentBackgroundMap) {
      scene.background = currentBackgroundMap
      return
    }

    if (backgroundMode === 'color') {
      scene.background = fallbackBackgroundColor
      return
    }

    scene.background = null
  }, [
    backgroundMode,
    currentBackgroundMap,
    currentEnvMap,
    previewMaterialTexture,
    environment.previewMaterialEnvironmentRotation,
    environment.isEnvironmentEnabled,
    environment.previewReflections,
    environment.rotation,
    fallbackBackgroundColor,
    scene,
  ])

  useEffect(() => {
    const backgroundTexture =
      previewMaterialTexture
        ? previewMaterialTexture
        : environment.previewReflections
        ? currentEnvMap
        : backgroundMode === 'hdri'
        ? currentEnvMap
        : backgroundMode === 'background'
          ? currentBackgroundMap
          : scene.background

    if (!(backgroundTexture instanceof THREE.Texture)) {
      return
    }

    backgroundTexture.offset.x = (environment.previewReflections ? environment.rotation : backgroundRotation) / 360
    if (previewMaterialTexture) {
      backgroundTexture.offset.x = environment.previewMaterialEnvironmentRotation / 360
    }
    backgroundTexture.needsUpdate = true
    scene.backgroundRotation.set(
      0,
      THREE.MathUtils.degToRad(
        previewMaterialTexture
          ? environment.previewMaterialEnvironmentRotation
          : environment.previewReflections
            ? environment.rotation
            : backgroundRotation,
      ),
      0,
    )
  }, [
    backgroundMode,
    backgroundRotation,
    currentBackgroundMap,
    currentEnvMap,
    previewMaterialTexture,
    environment.previewMaterialEnvironmentRotation,
    environment.previewReflections,
    environment.rotation,
    scene,
  ])

  useFrame(() => {
    scene.environment = environment.isEnvironmentEnabled ? currentEnvMap : null
    scene.environmentIntensity = environment.intensity
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    scene.backgroundIntensity = 1
    scene.backgroundBlurriness = 0

    if (previewMaterialTexture) {
      scene.background = previewMaterialTexture
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(environment.previewMaterialEnvironmentRotation), 0)
      return
    }

    if (environment.previewReflections && environment.isEnvironmentEnabled && currentEnvMap) {
      scene.background = currentEnvMap
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
      return
    }

    if (environment.isEnvironmentEnabled && backgroundMode === 'hdri' && currentEnvMap) {
      scene.background = currentEnvMap
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(backgroundRotation), 0)
      return
    }

    if (backgroundMode === 'background' && currentBackgroundMap) {
      scene.background = currentBackgroundMap
      scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(backgroundRotation), 0)
      return
    }

    if (backgroundMode === 'color') {
      scene.background = fallbackBackgroundColor
      return
    }

    if (backgroundMode === 'none' || backgroundMode === 'gradient') {
      scene.background = null
    }
  })

  return null
}
