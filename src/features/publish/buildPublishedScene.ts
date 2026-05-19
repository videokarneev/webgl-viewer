import { useEditorStore, type MaterialTextureSlot, type SceneGraphNode } from '../../store/editorStore'
import { getPublishNodeId } from './publishNodeIds'

type PublishedTextureSource = 'none' | 'original' | 'custom' | 'flipbook'

export interface PublishedSceneV2 {
  version: 2
  scene: {
    background: {
      mode: string
      color: string
      rotation: number
    }
    environment: {
      enabled: boolean
      kind: string
      assetLabel: string | null
      assetUrl: string | null
      intensity: number
      rotation: number
      backgroundMode: string
      backgroundVisible: boolean
      backgroundAssetLabel: string | null
      backgroundAssetUrl: string | null
      backgroundIntensity: number
      backgroundBlur: number
    }
  }
  camera: {
    mode: string
    position: [number, number, number]
    target: [number, number, number]
    focalLength: number
    frameAspectPreset: string
    exposure: number
  }
  viewer: {
    postEffectsEnabled: boolean
    bloomIntensity: number
    bloomRadius: number
    bloomThreshold: number
    toneMappingWhitePoint: number
    toneMappingAdaptation: number
    dofEnabled: boolean
    dofFocusDistance: number
    dofAperture: number
    dofManualBlur: number
  }
  audio: {
    isAdded: boolean
    enabled: boolean
    assetLabel: string | null
    assetUrl: string | null
    volume: number
    loop: boolean
  }
  lights: {
    ambient: {
      exists: boolean
      visible: boolean
      color: string
      intensity: number
    }
    rig: {
      hemisphere: number
      key: number
      fill: number
      rim: number
    }
    extra: Array<{
      id: string
      label: string
      type: string
      visible: boolean
      color: string
      intensity: number
      distance: number
      decay: number
      angle: number
      penumbra: number
      castShadow: boolean
      shadowBias: number
      position: [number, number, number]
      targetPosition: [number, number, number]
    }>
  }
  models: Array<{
    id: string
    assetLabel: string | null
    assetUrl: string | null
    visible: boolean
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    }
  }>
  objects: Array<{
    id: string
    nodeId: string
    parentId: string | null
    type: SceneGraphNode['type']
    label: string
    visible: boolean
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    } | null
  }>
  materials: Array<{
    id: string
    nodeId: string
    name: string
    type: string
    useSystemMaterial: boolean
    color: string | null
    emissive: string | null
    metalness: number | null
    roughness: number | null
    envMapIntensity: number | null
    emissiveIntensity: number | null
    clearcoat: number | null
    environmentOverride: {
      assetLabel: string | null
      assetUrl: string | null
      rotation: number
    } | null
    textureSlots: Partial<
      Record<
        MaterialTextureSlot,
        {
          source: PublishedTextureSource
          label: string | null
          assetUrl: string | null
        }
      >
    >
    effects: {
      flipbook: {
        enabled: boolean
        atlasAssetLabel: string | null
        atlasAssetUrl: string | null
        targetSlot: string
        frameOrder: string
        gridX: number
        gridY: number
        fps: number
        frameCount: number
        currentFrame: number
        opacity: number
        frameBlend: boolean
        playOnLoad: boolean
        loop: boolean
        uvChannel: string
        wrapMode: string
        offsetX: number
        offsetY: number
        scaleX: number
        scaleY: number
        rotation: number
        swapXY: boolean
      } | null
    }
  }>
  animations: Array<{
    type: 'rotate'
    targetObjectId: string
    enabled: boolean
    playOnLoad: boolean
    loop: boolean
    pivot: string
    axis: string
    speed: number
    progress: number
  }>
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildPublishedSceneInternal() {
  const state = useEditorStore.getState()
  const warnings: string[] = []
  const nodeIdCache = new Map<string, string>()

  const models = state.loadedModels
    .map((entry) => {
      const objectState = state.objects[entry.rootNodeId]
      if (!objectState) {
        return null
      }

      return {
        id: getPublishNodeId(entry.rootNodeId, state.sceneGraph, nodeIdCache),
        assetLabel: entry.label ?? null,
        assetUrl: state.assets.modelUrl ?? null,
        visible: objectState.visible,
        transform: {
          position: [...objectState.position] as [number, number, number],
          rotation: [...objectState.rotation] as [number, number, number],
          scale: [...objectState.scale] as [number, number, number],
        },
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const objects = Object.entries(state.sceneGraph)
    .filter(([, node]) => node.type !== 'material')
    .map(([nodeId, node]) => {
      const objectState = state.objects[nodeId] ?? null
      return {
        id: getPublishNodeId(nodeId, state.sceneGraph, nodeIdCache),
        nodeId,
        parentId: node.parentId ? getPublishNodeId(node.parentId, state.sceneGraph, nodeIdCache) : null,
        type: node.type,
        label: node.label,
        visible: node.visible ?? objectState?.visible ?? true,
        transform: objectState
          ? {
              position: [...objectState.position] as [number, number, number],
              rotation: [...objectState.rotation] as [number, number, number],
              scale: [...objectState.scale] as [number, number, number],
            }
          : null,
      }
    })

  const materials = Object.values(state.materials).map((material) => {
    const textureSlots = Object.fromEntries(
      Object.entries(material.textureSlots)
        .map(([slot, textureState]) => {
          let source: PublishedTextureSource = textureState.selectedSource ?? 'none'
          let label = textureState.selectedSource === 'custom' ? textureState.customLabel : textureState.originalLabel
          let assetUrl = textureState.selectedSource === 'custom' ? textureState.customUrl : textureState.originalUrl

          if (material.effect.isAdded && material.effect.enabled) {
            if (material.effect.targetSlot === 'baseColor' && slot === 'map') {
              source = 'flipbook'
              label = state.assets.atlas ?? 'Flipbook texture'
              assetUrl = state.assets.atlasUrl ?? null
            }
            if (material.effect.targetSlot === 'emissive' && slot === 'emissiveMap') {
              source = 'flipbook'
              label = state.assets.atlas ?? 'Flipbook texture'
              assetUrl = state.assets.atlasUrl ?? null
            }
          }

          if (textureState.selectedSource === 'custom' && textureState.customLabel) {
            warnings.push(
              `Material "${material.name}" uses custom ${slot} texture "${textureState.customLabel}", but publish asset packaging is not wired yet.`,
            )
          }

          if (source === 'none' && !label) {
            return null
          }

          return [slot, { source, label: label ?? null, assetUrl: assetUrl ?? null }]
        })
        .filter(
          (entry): entry is [string, { source: PublishedTextureSource; label: string | null; assetUrl: string | null }] =>
            Boolean(entry),
        ),
    ) as PublishedSceneV2['materials'][number]['textureSlots']

    const environmentOverride =
      material.environmentOverrideId && state.materialEnvironments[material.environmentOverrideId]
        ? {
            assetLabel: state.materialEnvironments[material.environmentOverrideId]?.label ?? null,
            assetUrl: state.materialEnvironments[material.environmentOverrideId]?.assetUrl ?? null,
            rotation: material.environmentRotation ?? 0,
          }
        : null

    return {
      id: getPublishNodeId(material.id, state.sceneGraph, nodeIdCache),
      nodeId: material.id,
      name: material.name,
      type: material.type,
      useSystemMaterial: Boolean(material.useSystemMaterial),
      color: material.color ?? null,
      emissive: material.emissive ?? null,
      metalness: material.metalness ?? null,
      roughness: material.roughness ?? null,
      envMapIntensity: material.envMapIntensity ?? null,
      emissiveIntensity: material.emissiveIntensity ?? null,
      clearcoat: material.clearcoat ?? null,
      environmentOverride,
      textureSlots,
      effects: {
        flipbook: material.effect.isAdded
          ? {
              enabled: material.effect.enabled,
              atlasAssetLabel: state.assets.atlas ?? null,
              atlasAssetUrl: state.assets.atlasUrl ?? null,
              targetSlot: material.effect.targetSlot,
              frameOrder: material.effect.frameOrder,
              gridX: material.effect.gridX,
              gridY: material.effect.gridY,
              fps: material.effect.fps,
              frameCount: material.effect.frameCount,
              currentFrame: material.effect.currentFrame,
              opacity: material.effect.opacity,
              frameBlend: material.effect.frameBlend,
              playOnLoad: material.effect.play,
              loop: material.effect.loop,
              uvChannel: material.effect.uvChannel,
              wrapMode: material.effect.wrapMode,
              offsetX: material.effect.offsetX,
              offsetY: material.effect.offsetY,
              scaleX: material.effect.scaleX,
              scaleY: material.effect.scaleY,
              rotation: material.effect.rotation,
              swapXY: material.effect.swapXY,
            }
          : null,
      },
    }
  })

  const animations: PublishedSceneV2['animations'] = []
  if (state.rotateAnimation.isAdded && state.rotateAnimation.targetObjectId) {
    animations.push({
      type: 'rotate',
      targetObjectId: getPublishNodeId(state.rotateAnimation.targetObjectId, state.sceneGraph, nodeIdCache),
      enabled: state.rotateAnimation.enabled,
      playOnLoad: state.rotateAnimation.play,
      loop: state.rotateAnimation.loop,
      pivot: state.rotateAnimation.pivot,
      axis: state.rotateAnimation.axis,
      speed: state.rotateAnimation.speed,
      progress: state.rotateAnimation.progress,
    })
  }

  const scene: PublishedSceneV2 = {
    version: 2,
    scene: {
      background: {
        mode: state.backgroundMode,
        color: state.backgroundColor,
        rotation: state.backgroundRotation,
      },
      environment: {
        enabled: state.environment.isEnvironmentEnabled,
        kind: state.environment.kind,
        assetLabel: state.assets.reflections,
        assetUrl: state.assets.reflectionsUrl ?? null,
        intensity: state.environment.intensity,
        rotation: state.environment.rotation,
        backgroundMode: state.environment.background,
        backgroundVisible: state.environment.backgroundVisible,
        backgroundAssetLabel: state.assets.background,
        backgroundAssetUrl: state.assets.backgroundUrl ?? null,
        backgroundIntensity: state.environment.backgroundIntensity,
        backgroundBlur: state.environment.backgroundBlur,
      },
    },
    camera: {
      mode: state.viewer.cameraMode,
      position: [...state.viewer.cameraPosition],
      target: [...state.viewer.orbitTarget],
      focalLength: state.viewer.focalLength,
      frameAspectPreset: state.viewer.frameAspectPreset,
      exposure: state.viewer.exposure,
    },
    viewer: {
      postEffectsEnabled: state.hud.postEffectsEnabled,
      bloomIntensity: state.viewer.bloomIntensity,
      bloomRadius: state.viewer.bloomRadius,
      bloomThreshold: state.viewer.bloomThreshold,
      toneMappingWhitePoint: state.viewer.toneMappingWhitePoint,
      toneMappingAdaptation: state.viewer.toneMappingAdaptation,
      dofEnabled: state.viewer.dofEnabled,
      dofFocusDistance: state.viewer.dofFocusDistance,
      dofAperture: state.viewer.dofAperture,
      dofManualBlur: state.viewer.dofManualBlur,
    },
    audio: {
      isAdded: state.backgroundAudio.isAdded,
      enabled: state.backgroundAudio.enabled,
      assetLabel: state.backgroundAudio.assetLabel,
      assetUrl: state.backgroundAudio.assetUrl,
      volume: state.backgroundAudio.volume,
      loop: state.backgroundAudio.loop,
    },
    lights: {
      ambient: {
        exists: state.lights.ambient.exists,
        visible: state.lights.ambient.visible,
        color: state.lights.ambient.color,
        intensity: state.lights.ambient.intensity,
      },
      rig: {
        hemisphere: state.lights.rig.hemisphere,
        key: state.lights.rig.key,
        fill: state.lights.rig.fill,
        rim: state.lights.rig.rim,
      },
      extra: state.extraLights.map((light) => ({
        id: light.id,
        label: light.label,
        type: light.type,
        visible: light.visible,
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
        decay: light.decay,
        angle: light.angle,
        penumbra: light.penumbra,
        castShadow: light.castShadow,
        shadowBias: light.shadowBias,
        position: [...light.position] as [number, number, number],
        targetPosition: [...light.targetPosition] as [number, number, number],
      })),
    },
    models,
    objects,
    materials,
    animations,
  }

  return { scene, warnings }
}

export function buildPublishedScene() {
  return buildPublishedSceneInternal()
}

export function downloadPublishedScene(filename = 'scene.json') {
  const { scene, warnings } = buildPublishedSceneInternal()
  downloadJson(filename, scene)
  return warnings
}

export function openPublishedScenePreview() {
  const { scene, warnings } = buildPublishedSceneInternal()
  const previewKey = `published-scene:${Date.now()}`
  localStorage.setItem(previewKey, JSON.stringify(scene))
  const playerUrl = new URL(window.location.href)
  playerUrl.searchParams.set('player', '1')
  playerUrl.searchParams.set('preview', previewKey)
  window.open(playerUrl.toString(), '_blank')
  return warnings
}
