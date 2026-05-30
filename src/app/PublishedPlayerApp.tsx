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
import {
  DEFAULT_GOD_RAYS_GLOBAL_DIRECTION,
  DEFAULT_GOD_RAYS_GLOBAL_NOISE,
  getGodRaysDustStrengthValue,
  useEditorStore,
  type ExtraLightType,
  type FrameAspectPreset,
  type MaterialTextureSlot,
  type ResponsiveFramePresetKind,
} from '../store/editorStore'
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

type PublishedCameraState = {
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]
  focalLength: number
  frameAspectPreset: FrameAspectPreset
}

const DEFAULT_RESPONSIVE_FRAME_ASPECTS: Record<ResponsiveFramePresetKind, FrameAspectPreset> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
}

function isFrameAspectPreset(value: string | null | undefined): value is FrameAspectPreset {
  return (
    value === '1:1' ||
    value === '3:2' ||
    value === '2:3' ||
    value === '16:9' ||
    value === '21:9' ||
    value === '9:16'
  )
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function resolvePublishedResponsivePresetKind(containerAspect: number): ResponsiveFramePresetKind {
  if (containerAspect > 1.2) {
    return 'landscape'
  }

  if (containerAspect < 0.85) {
    return 'portrait'
  }

  return 'square'
}

function resolvePublishedCameraState(
  scene: PublishedSceneV2,
  responsivePresetKind: ResponsiveFramePresetKind | null,
): PublishedCameraState {
  const fixedCameraState: PublishedCameraState = {
    cameraPosition: isVector3(scene.camera.position) ? scene.camera.position : [0, 0, 5],
    orbitTarget: isVector3(scene.camera.target) ? scene.camera.target : [0, 0, 0],
    focalLength: Number.isFinite(scene.camera.focalLength) ? scene.camera.focalLength : 20,
    frameAspectPreset: isFrameAspectPreset(scene.camera.frameAspectPreset) ? scene.camera.frameAspectPreset : '1:1',
  }

  if (!scene.responsiveFrame || !responsivePresetKind) {
    return fixedCameraState
  }

  const responsivePreset = scene.responsiveFrame[responsivePresetKind]

  return {
    cameraPosition: isVector3(responsivePreset?.cameraPosition) ? responsivePreset.cameraPosition : fixedCameraState.cameraPosition,
    orbitTarget: isVector3(responsivePreset?.orbitTarget) ? responsivePreset.orbitTarget : fixedCameraState.orbitTarget,
    focalLength: Number.isFinite(responsivePreset?.focalLength) ? responsivePreset.focalLength : fixedCameraState.focalLength,
    frameAspectPreset: isFrameAspectPreset(responsivePreset?.frameAspectPreset)
      ? responsivePreset.frameAspectPreset
      : DEFAULT_RESPONSIVE_FRAME_ASPECTS[responsivePresetKind],
  }
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
  publishedCameraState,
  transparentBackground,
}: {
  scene: PublishedSceneV2
  publishedCameraState: PublishedCameraState
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
  const replaceGodRaysBoxes = useEditorStore((state) => state.replaceGodRaysBoxes)
  const replaceStencilVolumes = useEditorStore((state) => state.replaceStencilVolumes)
  const setGodRaysGlobalNoise = useEditorStore((state) => state.setGodRaysGlobalNoise)
  const setGodRaysGlobalDirection = useEditorStore((state) => state.setGodRaysGlobalDirection)
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
    const publishedGlobalNoise = scene.godRaysGlobals?.noise
    const publishedGlobalDirection = scene.godRaysGlobals?.direction?.vector

    setHud({
      orbitEnabled: scene.camera.mode !== 'firstPerson',
      sidebarVisible: false,
      inspectorVisible: false,
      performanceStatsVisible: false,
      fpsEnabled: false,
      gridVisible: false,
      axesVisible: false,
      transformMode: 'none',
      postEffectsEnabled: scene.viewer.postEffectsEnabled,
      postEffectsVisible: scene.viewer.postEffectsEnabled,
    })
    setGodRaysGlobalNoise({
      rayNoiseAmount: publishedGlobalNoise?.amount ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayNoiseAmount,
      rayNoiseScale: publishedGlobalNoise?.scale ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayNoiseScale,
      rayGrain: publishedGlobalNoise?.grain ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayGrain,
      rayNoiseMotionMode: publishedGlobalNoise?.motionMode ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayNoiseMotionMode,
      rayNoiseMotionSpeed: publishedGlobalNoise?.motionSpeed ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayNoiseMotionSpeed,
      rayQuality: publishedGlobalNoise?.quality ?? DEFAULT_GOD_RAYS_GLOBAL_NOISE.rayQuality,
    })
    setGodRaysGlobalDirection(publishedGlobalDirection ?? DEFAULT_GOD_RAYS_GLOBAL_DIRECTION)
    setBackgroundMode((transparentBackground ? 'none' : scene.scene.background.mode) as never)
    setBackgroundColor(scene.scene.background.color)
    setBackgroundRotation(scene.scene.background.rotation)
    setViewer({
      cameraMode: scene.camera.mode === 'firstPerson' ? 'firstPerson' : 'orbit',
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
    replaceGodRaysBoxes(
      (scene.godRaysBoxes ?? []).map((entry, index) => ({
        id: `published:${entry.id}`,
        label: entry.label || `God Rays ${index + 1}`,
        visible: entry.visible,
        sideCount: entry.sideCount ?? 4,
        bottomRadius: entry.bottomRadius ?? 0.7071067811865476,
        topRadius: entry.topRadius ?? entry.bottomRadius ?? 0.7071067811865476,
        linkTopRadius: entry.linkTopRadius ?? true,
        helperVisible: entry.helperVisible ?? true,
        topDome: entry.topDome ?? 10,
        transform: {
          position: [...entry.transform.position] as [number, number, number],
          rotation: [...entry.transform.rotation] as [number, number, number],
          scale: [...entry.transform.scale] as [number, number, number],
          visible: entry.visible,
        },
        sourceFace: '-y' as never,
        raysEnabled: entry.rays.enabled,
        rayColor: entry.rays.color,
        rayIntensity: entry.rays.intensity,
        rayFalloff: entry.rays.falloff,
        rayEdgeFade: entry.rays.edgeFade,
        rayUseGlobalNoiseSettings: entry.rays.useGlobalSettings ?? true,
        rayNoiseAmount: entry.rays.noiseAmount,
        rayNoiseScale: entry.rays.noiseScale,
        rayGrain: entry.rays.grain ?? 0.18,
        rayNoiseMotionMode: (entry.rays.noiseMotionMode ?? 'off') as never,
        rayNoiseMotionSpeed: entry.rays.noiseMotionSpeed ?? 1.6,
        rayQuality: (entry.rays.quality ?? 'low') as never,
        dustEnabled: entry.dust.enabled,
        dustCount: entry.dust.count,
        dustSizeMin: entry.dust.sizeMin,
        dustSizeMax: entry.dust.sizeMax,
        dustSpeed: entry.dust.speed ?? 0.01,
        dustColorLinked: entry.dust.colorLinked ?? true,
        dustColor: entry.dust.color ?? entry.rays.color,
        dustStrength: getGodRaysDustStrengthValue(entry.dust.strength),
        dustDirectionMode: entry.dust.directionMode ?? 'local',
        dustDirectionLocal: [...(entry.dust.directionLocal ?? [0, 1, 0])] as [number, number, number],
        dustDrift: entry.dust.drift,
        dustEdgeFade: entry.dust.edgeFade,
      })),
    )
    replaceStencilVolumes(
      (scene.stencilVolumes ?? []).map((entry, index) => ({
        id: `published:${entry.id}`,
        label: entry.label || (index === 0 ? 'Stencil Volume' : `Stencil Volume ${index + 1}`),
        visible: entry.visible,
        sourceWidth: entry.source.width,
        sourceHeight: entry.source.height,
        maskAssetLabel: null,
        maskAssetUrl: null,
        bakedContourShapes: entry.source.bakedContourShapes,
        bakedPrimitiveShapeGroups: entry.source.bakedPrimitiveShapeGroups,
        bakedPreparedPrimitives: entry.source.bakedPreparedPrimitives,
        projectionVisible: false,
        maskInvert: false,
        contourDetail: 0.5,
        contourSimplify: 0.18,
        contourSmooth: 0.35,
        contourMinArea: 0.02,
        contourMode: 'silhouette',
        contourShowInnerLoops: true,
        contourDebugVisible: false,
        extrudeEnd: [...entry.extrude.end] as [number, number, number],
        endRotationX: entry.extrude.endRotationX,
        endRotationY: entry.extrude.endRotationY,
        endScaleX: entry.extrude.endScaleX,
        endScaleY: entry.extrude.endScaleY,
        volumeColor: entry.rays.color,
        volumeIntensity: entry.rays.intensity,
        volumeFalloff: entry.rays.falloff,
        rayEdgeFade: entry.rays.edgeFade,
        rayFillQuality: entry.rays.fillQuality ?? 0,
        rayNoiseAmount: entry.rays.noiseAmount,
        rayNoiseScale: entry.rays.noiseScale,
        rayGrain: entry.rays.grain ?? 0.18,
        rayNoiseMotionMode: (entry.rays.noiseMotionMode ?? 'off') as never,
        rayNoiseMotionSpeed: entry.rays.noiseMotionSpeed ?? 1.6,
        rayQuality: (entry.rays.quality ?? 'low') as never,
        rayUseGlobalNoiseSettings: entry.rays.useGlobalSettings ?? true,
        roundedTop: 6,
        dustEnabled: entry.dust.enabled,
        dustCount: entry.dust.count,
        dustSizeMin: entry.dust.sizeMin,
        dustSizeMax: entry.dust.sizeMax,
        dustSpeed: entry.dust.speed ?? 0.01,
        dustColorLinked: entry.dust.colorLinked ?? true,
        dustColor: entry.dust.color ?? entry.rays.color,
        dustDirectionMode: entry.dust.directionMode ?? 'global',
        dustDirectionLocal: [...(entry.dust.directionLocal ?? [0, 1, 0])] as [number, number, number],
        dustDrift: entry.dust.drift,
        dustStrength: getGodRaysDustStrengthValue(entry.dust.strength),
        dustEdgeFade: entry.dust.edgeFade,
        helperVisible: false,
        transform: {
          position: [...entry.transform.position] as [number, number, number],
          rotation: [...entry.transform.rotation] as [number, number, number],
          scale: [...entry.transform.scale] as [number, number, number],
          visible: entry.visible,
        },
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
    replaceGodRaysBoxes,
    replaceStencilVolumes,
    scene,
    setBackgroundAudio,
    setBackgroundColor,
    setBackgroundMode,
    setBackgroundRotation,
    setEnvironment,
    setGodRaysGlobalDirection,
    setGodRaysGlobalNoise,
    setHud,
    setLights,
    setViewer,
    transparentBackground,
  ])

  useEffect(() => {
    setViewer({
      cameraMode: scene.camera.mode === 'firstPerson' ? 'firstPerson' : 'orbit',
      cameraPosition: publishedCameraState.cameraPosition,
      orbitTarget: publishedCameraState.orbitTarget,
      resetCameraPosition: publishedCameraState.cameraPosition,
      resetOrbitTarget: publishedCameraState.orbitTarget,
      focalLength: publishedCameraState.focalLength,
      frameAspectPreset: publishedCameraState.frameAspectPreset,
    })
  }, [publishedCameraState, scene.camera.mode, setViewer])

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

    // Scenes that only contain baked effects like Stencil Volume have no model/material payload,
    // so the published player must not wait forever for runtime materials that will never appear.
    if (scene.materials.length > 0 && Object.keys(materials).length === 0) {
      return
    }

    const allSceneObjectsMapped = scene.objects.every((objectEntry) =>
      reversePublishIdMap.has(normalizePublishId(objectEntry.id)),
    )
    if (!allSceneObjectsMapped) {
      return
    }

    const allSceneMaterialsMapped = scene.materials.every((materialEntry) =>
      reversePublishIdMap.has(normalizePublishId(materialEntry.id)),
    )
    if (!allSceneMaterialsMapped) {
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

      setViewer({
        cameraMode: scene.camera.mode === 'firstPerson' ? 'firstPerson' : 'orbit',
        cameraPosition: publishedCameraState.cameraPosition,
        orbitTarget: publishedCameraState.orbitTarget,
        resetCameraPosition: publishedCameraState.cameraPosition,
        resetOrbitTarget: publishedCameraState.orbitTarget,
        focalLength: publishedCameraState.focalLength,
        frameAspectPreset: publishedCameraState.frameAspectPreset,
      })
      setSelectedObjectId(null)
      setSelectedMaterialId(null)
      setStatus('Published scene ready.')
    })().catch((error) => {
      console.error(error)
      setStatus('Failed to apply published scene.')
    })
  }, [addRotateAnimation, loadedModelCount, materials, publishedCameraState, reversePublishIdMap, scene, setSelectedMaterialId, setSelectedObjectId, setStatus, setViewer, updateMaterial, updateMaterialEffect, updateObjectTransform, updateRotateAnimation, upsertMaterialEnvironment])

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
  const containerRef = useRef<HTMLElement | null>(null)
  const [containerSize, setContainerSize] = useState(() => ({
    width: Math.max(window.innerWidth, 1),
    height: Math.max(window.innerHeight, 1),
  }))
  const transparentBackground = isTransparentPublishedPlayer()
  const transparentCanvasDiagnostic = isTransparentCanvasDiagnostic()
  const transparentDomDiagnostic = isTransparentDomDiagnostic()
  const transparentRawThreeDiagnostic = isTransparentRawThreeDiagnostic()
  const transparentRawWebGlDiagnostic = isTransparentRawWebGlDiagnostic()
  const backgroundOverride = getPublishedPlayerBackgroundOverride()
  const responsivePresetKind = useMemo(
    () =>
      scene?.responsiveFrame
        ? resolvePublishedResponsivePresetKind(containerSize.width / Math.max(containerSize.height, 1))
        : null,
    [containerSize.height, containerSize.width, scene],
  )
  const publishedCameraState = useMemo(
    () => (scene ? resolvePublishedCameraState(scene, responsivePresetKind) : null),
    [responsivePresetKind, scene],
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
  }, [scene])

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
      <main ref={containerRef} className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}>
        <TransparentCanvasDiagnostic />
      </main>
    )
  }

  if (transparentDomDiagnostic) {
    return (
      <main ref={containerRef} className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}>
        <TransparentDomDiagnostic />
      </main>
    )
  }

  if (transparentRawThreeDiagnostic) {
    return (
      <main
        ref={containerRef}
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
        ref={containerRef}
        className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}
        style={backgroundOverride ? { background: backgroundOverride } : undefined}
      >
        <TransparentRawWebGlDiagnostic />
      </main>
    )
  }

  if (!scene) {
    return <main ref={containerRef} className="published-player-error">Loading published scene...</main>
  }

  return (
    <main
      ref={containerRef}
      className={`published-player-shell${transparentBackground ? ' published-player-shell--transparent' : ''}`}
      style={backgroundOverride ? { background: backgroundOverride } : undefined}
    >
      <AssetController />
      <BackgroundAudioController autoplay />
      {publishedCameraState ? (
        <PublishedSceneController
          scene={scene}
          publishedCameraState={publishedCameraState}
          transparentBackground={transparentBackground}
        />
      ) : null}
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
