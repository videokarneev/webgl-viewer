import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AssetController } from '../components/AssetController'
import { BackgroundAudioController } from '../components/BackgroundAudioController'
import { TransparentCanvasDiagnostic } from '../components/TransparentCanvasDiagnostic'
import { TransparentDomDiagnostic } from '../components/TransparentDomDiagnostic'
import { TransparentRawThreeDiagnostic } from '../components/TransparentRawThreeDiagnostic'
import { TransparentRawWebGlDiagnostic } from '../components/TransparentRawWebGlDiagnostic'
import { Viewport } from '../components/Viewport'
import { loadHdri, loadTexture } from '../features/scene/runtime/shared'
import { buildPublishIdMap } from '../features/publish/publishNodeIds'
import { useEditorStore, type ExtraLightType, type MaterialTextureSlot } from '../store/editorStore'
import type { PublishedSceneV2 } from '../features/publish/buildPublishedScene'

function isTransparentPublishedPlayer() {
  return new URL(window.location.href).searchParams.get('transparent') === '1'
}

function isTransparentCanvasDiagnostic() {
  return new URL(window.location.href).searchParams.get('diag') === 'canvas'
}

function isTransparentDomDiagnostic() {
  return new URL(window.location.href).searchParams.get('diag') === 'dom'
}

function isTransparentRawThreeDiagnostic() {
  return new URL(window.location.href).searchParams.get('diag') === 'rawthree'
}

function isTransparentRawWebGlDiagnostic() {
  return new URL(window.location.href).searchParams.get('diag') === 'webgl'
}

function getPublishedPlayerBackgroundOverride() {
  const value = new URL(window.location.href).searchParams.get('bg')
  if (!value) {
    return null
  }

  const normalized = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null
}

type RuntimePublishedMaterial = THREE.Material & {
  needsUpdate: boolean
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  aoMap?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  alphaMap?: THREE.Texture | null
  bumpMap?: THREE.Texture | null
  displacementMap?: THREE.Texture | null
  specularMap?: THREE.Texture | null
  userData: THREE.Material['userData'] & {
    originalTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    customTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
  }
}

function normalizePublishId(publishId: string) {
  return publishId.replace(/^root:[^/]+/, 'root')
}

function copyTextureSettings(texture: THREE.Texture, previousTexture: THREE.Texture | null, slot: MaterialTextureSlot) {
  if (previousTexture) {
    texture.colorSpace = previousTexture.colorSpace
    texture.flipY = previousTexture.flipY
    texture.wrapS = previousTexture.wrapS
    texture.wrapT = previousTexture.wrapT
    texture.minFilter = previousTexture.minFilter
    texture.magFilter = previousTexture.magFilter
    texture.generateMipmaps = previousTexture.generateMipmaps
    texture.anisotropy = previousTexture.anisotropy
    texture.rotation = previousTexture.rotation
    texture.channel = previousTexture.channel
    texture.offset.copy(previousTexture.offset)
    texture.repeat.copy(previousTexture.repeat)
    texture.center.copy(previousTexture.center)
    return
  }

  texture.flipY = false
  if (slot === 'map' || slot === 'emissiveMap' || slot === 'specularMap') {
    texture.colorSpace = THREE.SRGBColorSpace
  } else {
    texture.colorSpace = THREE.NoColorSpace
  }
}

function getTextureSlotValue(material: RuntimePublishedMaterial, slot: MaterialTextureSlot) {
  return material[slot] instanceof THREE.Texture
    ? material[slot]
    : material.userData.originalTextureSlots?.[slot] instanceof THREE.Texture
      ? material.userData.originalTextureSlots?.[slot] ?? null
      : null
}

function isHdriAsset(value: string | null | undefined) {
  return Boolean(value && /\.(hdr|exr)$/i.test(value))
}

async function loadPublishedEnvironmentTexture(url: string, label: string | null) {
  const texture = isHdriAsset(url) || isHdriAsset(label) ? await loadHdri(url) : await loadTexture(url)
  texture.mapping = THREE.EquirectangularReflectionMapping

  if (!isHdriAsset(url) && !isHdriAsset(label)) {
    texture.colorSpace = THREE.SRGBColorSpace
  }

  texture.needsUpdate = true
  return texture
}

function PublishedSceneController({
  scene,
  transparentBackground,
}: {
  scene: PublishedSceneV2
  transparentBackground: boolean
}) {
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const setBackgroundMode = useEditorStore((state) => state.setBackgroundMode)
  const setBackgroundColor = useEditorStore((state) => state.setBackgroundColor)
  const setBackgroundRotation = useEditorStore((state) => state.setBackgroundRotation)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setLights = useEditorStore((state) => state.setLights)
  const replaceExtraLights = useEditorStore((state) => state.replaceExtraLights)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setHud = useEditorStore((state) => state.setHud)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const updateMaterialEffect = useEditorStore((state) => state.updateMaterialEffect)
  const upsertMaterialEnvironment = useEditorStore((state) => state.upsertMaterialEnvironment)
  const addRotateAnimation = useEditorStore((state) => state.addRotateAnimation)
  const updateRotateAnimation = useEditorStore((state) => state.updateRotateAnimation)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setBackgroundAudio = useEditorStore((state) => state.setBackgroundAudio)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const materials = useEditorStore((state) => state.materials)
  const loadedModelCount = useEditorStore((state) => state.loadedModels.length)
  const requestedRef = useRef(false)
  const appliedRef = useRef(false)

  const reversePublishIdMap = useMemo(() => {
    const map = new Map<string, string>()
    const forward = buildPublishIdMap(sceneGraph)
    forward.forEach((publishId, storeId) => {
      map.set(normalizePublishId(publishId), storeId)
    })
    return map
  }, [sceneGraph])

  useEffect(() => {
    setHud({
      orbitEnabled: scene.camera.mode !== 'firstPerson',
      sidebarVisible: false,
      inspectorVisible: false,
      performanceStatsVisible: false,
      fpsEnabled: false,
      gridVisible: false,
      axesVisible: false,
      transformMode: 'none',
      postEffectsEnabled: transparentBackground ? false : scene.viewer.postEffectsEnabled,
      postEffectsVisible: transparentBackground ? false : scene.viewer.postEffectsEnabled,
    })
    setBackgroundMode((transparentBackground ? 'none' : scene.scene.background.mode) as never)
    setBackgroundColor(scene.scene.background.color)
    setBackgroundRotation(scene.scene.background.rotation)
    setViewer({
      cameraMode: scene.camera.mode === 'firstPerson' ? 'firstPerson' : 'orbit',
      cameraPosition: scene.camera.position,
      orbitTarget: scene.camera.target,
      resetCameraPosition: scene.camera.position,
      resetOrbitTarget: scene.camera.target,
      focalLength: scene.camera.focalLength,
      frameAspectPreset: (scene.camera.frameAspectPreset || '1:1') as never,
      frameGuidesEnabled: false,
      exposure: scene.camera.exposure,
      bloomIntensity: scene.viewer.bloomIntensity,
      bloomRadius: scene.viewer.bloomRadius,
      bloomThreshold: scene.viewer.bloomThreshold,
      toneMappingWhitePoint: scene.viewer.toneMappingWhitePoint,
      toneMappingAdaptation: scene.viewer.toneMappingAdaptation,
      dofEnabled: scene.viewer.dofEnabled,
      dofFocusDistance: scene.viewer.dofFocusDistance,
      dofAperture: scene.viewer.dofAperture,
      dofManualBlur: scene.viewer.dofManualBlur,
    })
    setLights({
      ambient: {
        exists: scene.lights.ambient.exists,
        visible: scene.lights.ambient.visible,
        color: scene.lights.ambient.color,
        intensity: scene.lights.ambient.intensity,
      },
      rig: scene.lights.rig,
    })
    replaceExtraLights(
      scene.lights.extra.map((light) => ({
        ...light,
        type: light.type as ExtraLightType,
        id: `published:${light.id}`,
      })),
    )
    setEnvironment({
      isEnvironmentEnabled: scene.scene.environment.enabled,
      kind: scene.scene.environment.kind as never,
      intensity: scene.scene.environment.intensity,
      rotation: scene.scene.environment.rotation,
      background: (transparentBackground ? 'none' : scene.scene.environment.backgroundMode) as never,
      backgroundVisible: transparentBackground ? false : scene.scene.environment.backgroundVisible,
      backgroundIntensity: scene.scene.environment.backgroundIntensity,
      backgroundBlur: scene.scene.environment.backgroundBlur,
    })
    setBackgroundAudio({
      isAdded: scene.audio?.isAdded ?? Boolean(scene.audio?.assetUrl),
      enabled: scene.audio?.enabled ?? false,
      previewEnabled: true,
      previewPlaying: false,
      previewCurrentTime: 0,
      previewDuration: 0,
      assetLabel: scene.audio?.assetLabel ?? null,
      assetUrl: scene.audio?.assetUrl ?? null,
      fileSize: null,
      volume: scene.audio?.volume ?? 0.16,
      loop: scene.audio?.loop ?? true,
    })
  }, [
    replaceExtraLights,
    scene,
    setBackgroundAudio,
    setBackgroundColor,
    setBackgroundMode,
    setBackgroundRotation,
    setEnvironment,
    setHud,
    setLights,
    setViewer,
    transparentBackground,
  ])

  useEffect(() => {
    if (requestedRef.current) {
      return
    }

    requestedRef.current = true
    setStatus('Loading published scene...')

    const primaryModel = scene.model
    if (primaryModel?.assetUrl) {
      requestModelLoad({
        url: primaryModel.assetUrl,
        label: primaryModel.assetLabel ?? 'Published Model',
        revokeAfter: false,
        fileSize: null,
      })
    }

    const flipbookAtlasUrl =
      scene.materials.find((entry) => entry.effects.flipbook?.atlasAssetUrl)?.effects.flipbook?.atlasAssetUrl ?? null

    if (flipbookAtlasUrl) {
      requestAtlasLoad({
        url: flipbookAtlasUrl,
        label: scene.materials.find((entry) => entry.effects.flipbook?.atlasAssetLabel)?.effects.flipbook?.atlasAssetLabel ?? 'Atlas',
        revokeAfter: false,
        fileSize: null,
      })
    }

    if (scene.scene.environment.assetUrl) {
      requestEnvironmentLoad({
        url: scene.scene.environment.assetUrl,
        label: scene.scene.environment.assetLabel ?? 'Environment',
        kind: scene.scene.environment.kind === 'panorama' ? 'image' : 'hdri',
        revokeAfter: false,
        fileSize: null,
      })
    }

    if (!transparentBackground && scene.scene.environment.backgroundAssetUrl) {
      requestEnvironmentLoad({
        url: scene.scene.environment.backgroundAssetUrl,
        label: scene.scene.environment.backgroundAssetLabel ?? 'Background',
        kind: 'background',
        revokeAfter: false,
        fileSize: null,
      })
    }
  }, [requestAtlasLoad, requestEnvironmentLoad, requestModelLoad, scene, setStatus, transparentBackground])

  useEffect(() => {
    if (appliedRef.current) {
      return
    }

    if (scene.model?.assetUrl && loadedModelCount === 0) {
      return
    }

    if (!scene.materials.length || Object.keys(materials).length === 0) {
      return
    }

    appliedRef.current = true

    void (async () => {
      for (const objectEntry of scene.objects) {
        const storeObjectId = reversePublishIdMap.get(normalizePublishId(objectEntry.id))
        if (!storeObjectId || !objectEntry.transform) {
          continue
        }

        updateObjectTransform(storeObjectId, {
          position: objectEntry.transform.position,
          rotation: objectEntry.transform.rotation,
          scale: objectEntry.transform.scale,
          visible: objectEntry.visible,
        })
      }

      for (const materialEntry of scene.materials) {
        const storeMaterialId = reversePublishIdMap.get(normalizePublishId(materialEntry.id))
        if (!storeMaterialId || !materials[storeMaterialId]) {
          continue
        }

        const currentMaterialState = useEditorStore.getState().materials[storeMaterialId]
        updateMaterial(storeMaterialId, {
          useSystemMaterial: materialEntry.useSystemMaterial,
          color: materialEntry.color ?? undefined,
          emissive: materialEntry.emissive ?? undefined,
          metalness: materialEntry.metalness ?? undefined,
          roughness: materialEntry.roughness ?? undefined,
          envMapIntensity: materialEntry.envMapIntensity ?? undefined,
          emissiveIntensity: materialEntry.emissiveIntensity ?? undefined,
          clearcoat: materialEntry.clearcoat ?? undefined,
          environmentOverrideId: null,
          environmentRotation: materialEntry.environmentOverride?.rotation ?? 0,
          textureSlots: {
            ...currentMaterialState.textureSlots,
          },
        })

        if (materialEntry.environmentOverride?.assetUrl) {
          const overrideId = `published-material-environment:${storeMaterialId}`
          const texture = await loadPublishedEnvironmentTexture(
            materialEntry.environmentOverride.assetUrl,
            materialEntry.environmentOverride.assetLabel,
          )
          texture.name = materialEntry.environmentOverride.assetLabel ?? 'Material Environment'
          upsertMaterialEnvironment(
            {
              id: overrideId,
              label: materialEntry.environmentOverride.assetLabel ?? 'Material Environment',
              kind: isHdriAsset(materialEntry.environmentOverride.assetUrl) ? 'hdri' : 'panorama',
              assetUrl: materialEntry.environmentOverride.assetUrl,
            },
            texture,
          )
          updateMaterial(storeMaterialId, {
            environmentOverrideId: overrideId,
            environmentRotation: materialEntry.environmentOverride.rotation ?? 0,
          })
        }

        const runtimeMaterial = useEditorStore.getState().runtime.materialById[storeMaterialId] as RuntimePublishedMaterial | undefined
        if (runtimeMaterial) {
          runtimeMaterial.userData.customTextureSlots ??= {}
        }

        const nextTextureSlots = { ...useEditorStore.getState().materials[storeMaterialId].textureSlots }

        for (const [slotName, slotEntry] of Object.entries(materialEntry.textureSlots) as Array<
          [MaterialTextureSlot, { source: 'none' | 'original' | 'custom' | 'flipbook'; label: string | null; assetUrl: string | null }]
        >) {
          if (slotEntry.source === 'custom' && slotEntry.assetUrl && runtimeMaterial) {
            const texture = await loadTexture(slotEntry.assetUrl)
            texture.name = slotEntry.label ?? `${slotName} Texture`
            copyTextureSettings(texture, getTextureSlotValue(runtimeMaterial, slotName), slotName)
            texture.needsUpdate = true
            runtimeMaterial.userData.customTextureSlots = {
              ...(runtimeMaterial.userData.customTextureSlots ?? {}),
              [slotName]: texture,
            }
            nextTextureSlots[slotName] = {
              ...nextTextureSlots[slotName],
              customLabel: slotEntry.label,
              customUrl: slotEntry.assetUrl,
              selectedSource: 'custom',
            }
            continue
          }

          if (slotEntry.source === 'original') {
            nextTextureSlots[slotName] = {
              ...nextTextureSlots[slotName],
              selectedSource: 'original',
            }
            continue
          }

          if (slotEntry.source === 'none') {
            nextTextureSlots[slotName] = {
              ...nextTextureSlots[slotName],
              selectedSource: null,
            }
          }
        }

        updateMaterial(storeMaterialId, {
          textureSlots: nextTextureSlots,
        })

        if (materialEntry.effects.flipbook) {
          updateMaterialEffect(storeMaterialId, {
            isAdded: true,
            enabled: materialEntry.effects.flipbook.enabled,
            targetSlot: materialEntry.effects.flipbook.targetSlot as never,
            frameOrder: materialEntry.effects.flipbook.frameOrder as never,
            gridX: materialEntry.effects.flipbook.gridX,
            gridY: materialEntry.effects.flipbook.gridY,
            fps: materialEntry.effects.flipbook.fps,
            frameCount: materialEntry.effects.flipbook.frameCount,
            currentFrame: materialEntry.effects.flipbook.currentFrame,
            opacity: materialEntry.effects.flipbook.opacity,
            frameBlend: materialEntry.effects.flipbook.frameBlend,
            // The published player has no playback controls, so enabled effects should start automatically.
            play: materialEntry.effects.flipbook.enabled,
            loop: materialEntry.effects.flipbook.loop,
            uvChannel: materialEntry.effects.flipbook.uvChannel as never,
            wrapMode: materialEntry.effects.flipbook.wrapMode as never,
            offsetX: materialEntry.effects.flipbook.offsetX,
            offsetY: materialEntry.effects.flipbook.offsetY,
            scaleX: materialEntry.effects.flipbook.scaleX,
            scaleY: materialEntry.effects.flipbook.scaleY,
            rotation: materialEntry.effects.flipbook.rotation,
            swapXY: materialEntry.effects.flipbook.swapXY,
          })
        }
      }

      const rotateEntry = scene.animations.find((entry) => entry.type === 'rotate')
      if (rotateEntry) {
        const targetObjectId = reversePublishIdMap.get(normalizePublishId(rotateEntry.targetObjectId)) ?? null
        addRotateAnimation(targetObjectId)
        updateRotateAnimation({
          enabled: rotateEntry.enabled,
          // The published player has no playback controls, so enabled animations should start automatically.
          play: rotateEntry.enabled,
          loop: rotateEntry.loop,
          pivot: rotateEntry.pivot as never,
          axis: rotateEntry.axis as never,
          speed: rotateEntry.speed,
          progress: rotateEntry.progress,
          targetObjectId,
        })
      }

      setSelectedObjectId(null)
      setSelectedMaterialId(null)
      setStatus('Published scene ready.')
    })().catch((error) => {
      console.error(error)
      setStatus('Failed to apply published scene.')
    })
  }, [addRotateAnimation, loadedModelCount, materials, reversePublishIdMap, scene, setStatus, updateMaterial, updateMaterialEffect, updateObjectTransform, updateRotateAnimation, upsertMaterialEnvironment])

  return null
}

async function loadPublishedSceneFromLocation() {
  const url = new URL(window.location.href)
  const previewKey = url.searchParams.get('preview')
  if (previewKey) {
    const raw = localStorage.getItem(previewKey)
    if (!raw) {
      throw new Error('Preview scene not found in local storage.')
    }
    return JSON.parse(raw) as PublishedSceneV2
  }

  const sceneUrl = url.searchParams.get('scene')
  if (!sceneUrl) {
    throw new Error('No published scene source provided.')
  }

  const response = await fetch(sceneUrl)
  if (!response.ok) {
    throw new Error(`Failed to load published scene: ${response.status}`)
  }

  const scene = (await response.json()) as PublishedSceneV2
  const sceneBaseUrl = new URL(sceneUrl, window.location.href)
  const resolveAssetUrl = (value: string | null | undefined) => {
    if (!value) {
      return value ?? null
    }

    try {
      return new URL(value, sceneBaseUrl).toString()
    } catch {
      return value
    }
  }

  if (scene.model?.assetUrl) {
    scene.model.assetUrl = resolveAssetUrl(scene.model.assetUrl)
  }

  scene.scene.environment.assetUrl = resolveAssetUrl(scene.scene.environment.assetUrl)
  scene.scene.environment.backgroundAssetUrl = resolveAssetUrl(scene.scene.environment.backgroundAssetUrl)
  scene.audio.assetUrl = resolveAssetUrl(scene.audio.assetUrl)

  scene.materials.forEach((material) => {
    if (material.environmentOverride?.assetUrl) {
      material.environmentOverride.assetUrl = resolveAssetUrl(material.environmentOverride.assetUrl)
    }

    Object.values(material.textureSlots).forEach((slotEntry) => {
      if (slotEntry?.assetUrl) {
        slotEntry.assetUrl = resolveAssetUrl(slotEntry.assetUrl)
      }
    })

    if (material.effects.flipbook?.atlasAssetUrl) {
      material.effects.flipbook.atlasAssetUrl = resolveAssetUrl(material.effects.flipbook.atlasAssetUrl)
    }
  })

  return scene
}

export function PublishedPlayerApp() {
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const [scene, setScene] = useState<PublishedSceneV2 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const transparentBackground = isTransparentPublishedPlayer()
  const transparentCanvasDiagnostic = isTransparentCanvasDiagnostic()
  const transparentDomDiagnostic = isTransparentDomDiagnostic()
  const transparentRawThreeDiagnostic = isTransparentRawThreeDiagnostic()
  const transparentRawWebGlDiagnostic = isTransparentRawWebGlDiagnostic()
  const backgroundOverride = getPublishedPlayerBackgroundOverride()

  useEffect(() => {
    if (transparentCanvasDiagnostic || transparentDomDiagnostic || transparentRawThreeDiagnostic || transparentRawWebGlDiagnostic) {
      requestSceneReset()
      return
    }

    requestSceneReset()
    void loadPublishedSceneFromLocation()
      .then((loadedScene) => {
        setScene(loadedScene)
      })
      .catch((loadError) => {
        console.error(loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load published scene.')
      })
  }, [requestSceneReset, transparentCanvasDiagnostic, transparentDomDiagnostic, transparentRawThreeDiagnostic, transparentRawWebGlDiagnostic])

  useEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const appElement = document.getElementById('app')
    const previousRootBackground = rootElement.style.background
    const previousBodyBackground = bodyElement.style.background
    const previousAppBackground = appElement?.style.background ?? ''
    const nextBackground = backgroundOverride ?? 'transparent'

    document.documentElement.classList.toggle('player-transparent', transparentBackground)
    document.body.classList.toggle('player-transparent', transparentBackground)

    if (transparentBackground) {
      rootElement.style.background = nextBackground
      bodyElement.style.background = nextBackground
      if (appElement) {
        appElement.style.background = nextBackground
      }
    }

    return () => {
      document.documentElement.classList.remove('player-transparent')
      document.body.classList.remove('player-transparent')
      rootElement.style.background = previousRootBackground
      bodyElement.style.background = previousBodyBackground
      if (appElement) {
        appElement.style.background = previousAppBackground
      }
    }
  }, [backgroundOverride, transparentBackground])

  if (error) {
    return <main className="published-player-error">{error}</main>
  }

  if (transparentCanvasDiagnostic) {
    return (
      <main className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}>
        <TransparentCanvasDiagnostic />
      </main>
    )
  }

  if (transparentDomDiagnostic) {
    return <TransparentDomDiagnostic />
  }

  if (transparentRawThreeDiagnostic) {
    return (
      <main
        className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}
        style={backgroundOverride ? { background: backgroundOverride } : undefined}
      >
        <TransparentRawThreeDiagnostic />
      </main>
    )
  }

  if (transparentRawWebGlDiagnostic) {
    return (
      <main
        className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}
        style={backgroundOverride ? { background: backgroundOverride } : undefined}
      >
        <TransparentRawWebGlDiagnostic />
      </main>
    )
  }

  if (!scene) {
    return <main className="published-player-error">Loading published scene...</main>
  }

  return (
    <main
      className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}
      style={backgroundOverride ? { background: backgroundOverride } : undefined}
    >
      <AssetController />
      <BackgroundAudioController autoplay />
      <PublishedSceneController scene={scene} transparentBackground={transparentBackground} />
      <Viewport
        showChrome={false}
        allowSelection={false}
        enforceFrameAspect
        autoFrameOnLoad={false}
        transparentBackground={transparentBackground}
      />
    </main>
  )
}
