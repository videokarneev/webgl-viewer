import {
  normalizePhoneScreenBoxState,
  useEditorStore,
  type FrameAspectPreset,
  type MaterialTextureSlot,
  type PhoneScreenBoxState,
  type ResponsiveFramePresetKind,
  type ResponsiveFrameState,
  type SceneGraphNode,
} from '../../store/editorStore'
import { getStandardEnvironmentPresetByUrl } from '../environment/standardEnvironmentPresets'
import { getPublishNodeId } from './publishNodeIds'
import { extractMaskContour } from '../stencilVolume/maskContour'

type PublishedTextureSource = 'none' | 'original' | 'custom' | 'flipbook'

type PublishedStencilShape = {
  outline: [number, number][]
  holes: [number, number][][]
}

type PublishedStencilPreparedPrimitive = {
  id: string
  shapes: PublishedStencilShape[]
  sourceCenter: [number, number, number]
  sourceSize: [number, number]
}

function clusterPublishedStencilShapes(shapes: PublishedStencilShape[]) {
  if (!shapes.length) {
    return []
  }

  const gapThreshold = 0.035
  const metrics = shapes.map((shape) => {
    const points = [shape.outline, ...shape.holes].flat()
    const bounds = points.reduce(
      (accumulator, point) => ({
        minX: Math.min(accumulator.minX, point[0]),
        maxX: Math.max(accumulator.maxX, point[0]),
        minY: Math.min(accumulator.minY, point[1]),
        maxY: Math.max(accumulator.maxY, point[1]),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )

    const centerX = (bounds.minX + bounds.maxX) * 0.5
    const centerY = (bounds.minY + bounds.maxY) * 0.5
    const halfX = Math.max((bounds.maxX - bounds.minX) * 0.5, 0.00005)
    const halfY = Math.max((bounds.maxY - bounds.minY) * 0.5, 0.00005)
    return { shape, centerX, centerY, halfX, halfY }
  })

  const clusters: Array<typeof metrics> = []
  const overlaps = (left: (typeof metrics)[number], right: (typeof metrics)[number]) => {
    const leftMinX = left.centerX - left.halfX - gapThreshold
    const leftMaxX = left.centerX + left.halfX + gapThreshold
    const leftMinY = left.centerY - left.halfY - gapThreshold
    const leftMaxY = left.centerY + left.halfY + gapThreshold
    const rightMinX = right.centerX - right.halfX - gapThreshold
    const rightMaxX = right.centerX + right.halfX + gapThreshold
    const rightMinY = right.centerY - right.halfY - gapThreshold
    const rightMaxY = right.centerY + right.halfY + gapThreshold
    return !(leftMaxX < rightMinX || rightMaxX < leftMinX || leftMaxY < rightMinY || rightMaxY < leftMinY)
  }

  metrics.forEach((metric) => {
    const matchingClusters = clusters.filter((cluster) => cluster.some((entry) => overlaps(entry, metric)))
    if (!matchingClusters.length) {
      clusters.push([metric])
      return
    }

    const primary = matchingClusters[0]
    primary.push(metric)
    for (let index = 1; index < matchingClusters.length; index += 1) {
      const cluster = matchingClusters[index]
      primary.push(...cluster)
      clusters.splice(clusters.indexOf(cluster), 1)
    }
  })

  return clusters.map((cluster) => cluster.map((entry) => entry.shape))
}

function buildPublishedStencilPreparedPrimitives(
  shapeGroups: PublishedStencilShape[][],
  sourceWidth: number,
  sourceHeight: number,
) {
  return shapeGroups.map<PublishedStencilPreparedPrimitive>((shapeGroup, index) => {
    const points = shapeGroup.flatMap((shape) => [shape.outline, ...shape.holes].flat())
    const bounds = points.reduce(
      (accumulator, point) => ({
        minX: Math.min(accumulator.minX, point[0]),
        maxX: Math.max(accumulator.maxX, point[0]),
        minY: Math.min(accumulator.minY, point[1]),
        maxY: Math.max(accumulator.maxY, point[1]),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )

    const halfX = Math.max((bounds.maxX - bounds.minX) * 0.5, 0.00005)
    const halfY = Math.max((bounds.maxY - bounds.minY) * 0.5, 0.00005)
    const centerXNormalized = (bounds.minX + bounds.maxX) * 0.5
    const centerYNormalized = (bounds.minY + bounds.maxY) * 0.5

    return {
      id: `cluster-${index}`,
      shapes: shapeGroup,
      sourceCenter: [centerXNormalized * sourceWidth, centerYNormalized * sourceHeight, 0],
      sourceSize: [Math.max(halfX * sourceWidth * 2, 0.0001), Math.max(halfY * sourceHeight * 2, 0.0001)],
    }
  })
}

export interface PublishedSceneV2 {
  version: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
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
  responsiveFrame?: {
    landscape: {
      frameAspectPreset: FrameAspectPreset
      cameraPosition: [number, number, number]
      orbitTarget: [number, number, number]
      focalLength: number
    }
    portrait: {
      frameAspectPreset: FrameAspectPreset
      cameraPosition: [number, number, number]
      orbitTarget: [number, number, number]
      focalLength: number
    }
    square: {
      frameAspectPreset: FrameAspectPreset
      cameraPosition: [number, number, number]
      orbitTarget: [number, number, number]
      focalLength: number
    }
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
  phoneScreenBoxes?: Array<{
    id: string
    label: string
    visible: boolean
    geometry?: PhoneScreenBoxState['geometry']
    screenBinding?: PhoneScreenBoxState['screenBinding']
    content?: PhoneScreenBoxState['content']
    interaction?: PhoneScreenBoxState['interaction']
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    }
  }>
  godRaysGlobals?: {
    noise?: {
      enabled?: boolean
      amount?: number
      scale?: number
      grain?: number
      motionMode?: 'off' | 'soft'
      motionSpeed?: number
      quality?: 'low' | 'medium' | 'high'
    }
    direction?: {
      vector?: [number, number, number]
    }
  }
  godRaysBoxes: Array<{
    id: string
    label: string
    visible: boolean
    sideCount: number
    bottomRadius: number
    topRadius: number
    linkTopRadius: boolean
    helperVisible: boolean
    topDome: number
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    }
    sourceFace: string
    rays: {
      enabled: boolean
      color: string
      intensity: number
      falloff: number
      edgeFade: number
      useGlobalSettings?: boolean
      noiseAmount: number
      noiseScale: number
      grain: number
      noiseMotionMode: string
      noiseMotionSpeed: number
      quality: string
    }
    dust: {
      enabled: boolean
      count: number
      sizeMin: number
      sizeMax: number
      speed: number
      colorLinked?: boolean
      color?: string
      strength?: number
      directionMode?: 'local' | 'global'
      directionLocal?: [number, number, number]
      drift: number
      edgeFade: number
    }
  }>
  stencilVolumes?: Array<{
    id: string
    label: string
    visible: boolean
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    }
    source: {
      width: number
      height: number
      bakedContourShapes: Array<{
        outline: [number, number][]
        holes: [number, number][][]
      }>
      bakedPrimitiveShapeGroups: Array<
        Array<{
          outline: [number, number][]
          holes: [number, number][][]
        }>
      >
      bakedPreparedPrimitives: Array<{
        id: string
        shapes: Array<{
          outline: [number, number][]
          holes: [number, number][][]
        }>
        sourceCenter: [number, number, number]
        sourceSize: [number, number]
      }>
    }
    extrude: {
      end: [number, number, number]
      endRotationX: number
      endRotationY: number
      endScaleX: number
      endScaleY: number
    }
    rays: {
      color: string
      intensity: number
      falloff: number
      edgeFade: number
      fillQuality: number
      useGlobalSettings?: boolean
      noiseAmount: number
      noiseScale: number
      grain: number
      noiseMotionMode: string
      noiseMotionSpeed: number
      quality: string
    }
    dust: {
      enabled: boolean
      count: number
      sizeMin: number
      sizeMax: number
      speed: number
      colorLinked?: boolean
      color?: string
      strength?: number
      directionMode?: 'local' | 'global'
      directionLocal?: [number, number, number]
      drift: number
      edgeFade: number
    }
  }>
  model: {
    id: string
    assetLabel: string | null
    assetUrl: string | null
    visible: boolean
    transform: {
      position: [number, number, number]
      rotation: [number, number, number]
      scale: [number, number, number]
    }
  } | null
  objects: Array<{
    id: string
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
      rainImpacts?: {
        enabled: boolean
        rate: number
        size: number
        strength: number
        lifetime: number
        count: number
      } | null
    }
  }>
  animations: Array<
    | {
        type: 'rotate'
        targetObjectId: string
        enabled: boolean
        loop: boolean
        pivot: string
        axis: string
        speed: number
        startProgress?: number
        progress: number
      }
    | {
        type: 'float'
        targetObjectId: string
        enabled: boolean
        loop: boolean
        amplitude: number
        speed: number
        tilt: number
        startProgress?: number
        progress: number
      }
    | {
        type: 'focus'
        targetObjectId: string
        enabled: boolean
        frontFace: string
        distance: number
        duration: number
      }
  >
}

function buildPublishedResponsiveFrame(
  responsiveFrame: ResponsiveFrameState,
): NonNullable<PublishedSceneV2['responsiveFrame']> {
  const serializePreset = (kind: ResponsiveFramePresetKind) => ({
    frameAspectPreset: responsiveFrame[kind].frameAspectPreset,
    cameraPosition: [...responsiveFrame[kind].cameraPosition] as [number, number, number],
    orbitTarget: [...responsiveFrame[kind].orbitTarget] as [number, number, number],
    focalLength: responsiveFrame[kind].focalLength,
  })

  return {
    landscape: serializePreset('landscape'),
    portrait: serializePreset('portrait'),
    square: serializePreset('square'),
  }
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

async function buildPublishedSceneInternal() {
  const state = useEditorStore.getState()
  const warnings: string[] = []
  const nodeIdCache = new Map<string, string>()

  const primaryLoadedModel = state.loadedModels[0] ?? null
  const primaryModelObjectState = primaryLoadedModel ? state.objects[primaryLoadedModel.rootNodeId] : null
  const model =
    primaryLoadedModel && primaryModelObjectState
      ? {
          id: getPublishNodeId(primaryLoadedModel.rootNodeId, state.sceneGraph, nodeIdCache),
          assetLabel: primaryLoadedModel.label ?? null,
          assetUrl: state.assets.modelUrl ?? null,
          visible: primaryModelObjectState.visible,
          transform: {
            position: [...primaryModelObjectState.position] as [number, number, number],
            rotation: [...primaryModelObjectState.rotation] as [number, number, number],
            scale: [...primaryModelObjectState.scale] as [number, number, number],
          },
        }
      : null

  const objects = Object.entries(state.sceneGraph)
    .filter(([, node]) => node.type !== 'material')
    .map(([nodeId, node]) => {
      const objectState = state.objects[nodeId] ?? null
      return {
        id: getPublishNodeId(nodeId, state.sceneGraph, nodeIdCache),
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
        rainImpacts: material.effect.rainImpactsAdded
          ? {
              enabled: material.effect.rainImpactsEnabled,
              rate: material.effect.rainImpactRate,
              size: material.effect.rainImpactSize,
              strength: material.effect.rainImpactStrength,
              lifetime: material.effect.rainImpactLifetime,
              count: material.effect.rainImpactCount,
            }
          : null,
      },
    }
  })

  const phoneScreenBoxes: NonNullable<PublishedSceneV2['phoneScreenBoxes']> = state.phoneScreenBoxes
    .map((entry) => {
      const objectState = state.objects[entry.id]
      const node = state.sceneGraph[entry.id]
      if (!objectState || !node) {
        return null
      }

      const normalizedEntry = normalizePhoneScreenBoxState(entry)

      return {
        id: normalizedEntry.id,
        label: node.label,
        visible: objectState.visible,
        geometry: {
          ...normalizedEntry.geometry,
        },
        screenBinding: {
          ...normalizedEntry.screenBinding,
        },
        content: {
          ...normalizedEntry.content,
          anchor: [...normalizedEntry.content.anchor] as [number, number, number],
          attachedObjectIds: normalizedEntry.content.attachedObjectIds
            .filter((objectId) => state.sceneGraph[objectId])
            .map((objectId) => getPublishNodeId(objectId, state.sceneGraph, nodeIdCache)),
        },
        interaction: {
          ...normalizedEntry.interaction,
        },
        transform: {
          position: [...objectState.position] as [number, number, number],
          rotation: [...objectState.rotation] as [number, number, number],
          scale: [...objectState.scale] as [number, number, number],
        },
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const godRaysBoxes: PublishedSceneV2['godRaysBoxes'] = state.godRaysBoxes
    .map((entry) => {
      const objectState = state.objects[entry.id]
      const node = state.sceneGraph[entry.id]
      if (!objectState || !node) {
        return null
      }

      return {
        id: entry.id,
        label: node.label,
        visible: objectState.visible,
        sideCount: entry.sideCount,
        bottomRadius: entry.bottomRadius,
        topRadius: entry.topRadius,
        linkTopRadius: entry.linkTopRadius,
        helperVisible: entry.helperVisible,
        topDome: entry.topDome,
        transform: {
          position: [...objectState.position] as [number, number, number],
          rotation: [...objectState.rotation] as [number, number, number],
          scale: [...objectState.scale] as [number, number, number],
        },
        sourceFace: entry.sourceFace,
        rays: {
          enabled: entry.raysEnabled,
          color: entry.rayColor,
          intensity: entry.rayIntensity,
          falloff: entry.rayFalloff,
          edgeFade: entry.rayEdgeFade,
          useGlobalSettings: entry.rayUseGlobalNoiseSettings,
          noiseAmount: entry.rayNoiseAmount,
          noiseScale: entry.rayNoiseScale,
          grain: entry.rayGrain,
          noiseMotionMode: entry.rayNoiseMotionMode,
          noiseMotionSpeed: entry.rayNoiseMotionSpeed,
          quality: entry.rayQuality,
        },
        dust: {
          enabled: entry.dustEnabled,
          count: entry.dustCount,
          sizeMin: entry.dustSizeMin,
          sizeMax: entry.dustSizeMax,
          speed: entry.dustSpeed,
          colorLinked: entry.dustColorLinked,
          color: entry.dustColor,
          strength: entry.dustStrength,
          directionMode: entry.dustDirectionMode,
          directionLocal: [...entry.dustDirectionLocal] as [number, number, number],
          drift: entry.dustDrift,
          edgeFade: entry.dustEdgeFade,
        },
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const stencilVolumesRaw = await Promise.all(
    state.stencilVolumes.map(async (entry) => {
      const objectState = state.objects[entry.id]
      const node = state.sceneGraph[entry.id]
      if (!objectState || !node) {
        return null
      }

      const bakedContourShapes = entry.bakedContourShapes?.length
        ? entry.bakedContourShapes
        : entry.maskAssetUrl
          ? (await extractMaskContour(entry.maskAssetUrl, {
              invert: entry.maskInvert,
              detail: entry.contourDetail,
              simplify: entry.contourSimplify,
              smooth: entry.contourSmooth,
              minArea: entry.contourMinArea,
              mode: 'silhouette',
            }))?.shapes ?? []
          : []

      if (!bakedContourShapes.length) {
        warnings.push(`Stencil Volume "${node.label}" could not be baked and was skipped from publish output.`)
        return null
      }

      const normalizedBakedContourShapes = bakedContourShapes.map((shape) => ({
        outline: shape.outline.map((point) => [...point] as [number, number]),
        holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
      }))
      const bakedPrimitiveShapeGroups = clusterPublishedStencilShapes(normalizedBakedContourShapes)

      return {
        id: entry.id,
        label: node.label,
        visible: objectState.visible,
        transform: {
          position: [...objectState.position] as [number, number, number],
          rotation: [...objectState.rotation] as [number, number, number],
          scale: [...objectState.scale] as [number, number, number],
        },
        source: {
          width: entry.sourceWidth,
          height: entry.sourceHeight,
          bakedContourShapes: normalizedBakedContourShapes,
          bakedPrimitiveShapeGroups,
          bakedPreparedPrimitives: buildPublishedStencilPreparedPrimitives(
            bakedPrimitiveShapeGroups,
            entry.sourceWidth,
            entry.sourceHeight,
          ),
        },
        extrude: {
          end: [...entry.extrudeEnd] as [number, number, number],
          endRotationX: entry.endRotationX,
          endRotationY: entry.endRotationY,
          endScaleX: entry.endScaleX,
          endScaleY: entry.endScaleY,
        },
        rays: {
          color: entry.volumeColor,
          intensity: entry.volumeIntensity,
          falloff: entry.volumeFalloff,
          edgeFade: entry.rayEdgeFade,
          fillQuality: entry.rayFillQuality,
          useGlobalSettings: entry.rayUseGlobalNoiseSettings,
          noiseAmount: entry.rayNoiseAmount,
          noiseScale: entry.rayNoiseScale,
          grain: entry.rayGrain,
          noiseMotionMode: entry.rayNoiseMotionMode,
          noiseMotionSpeed: entry.rayNoiseMotionSpeed,
          quality: entry.rayQuality,
        },
        dust: {
          enabled: entry.dustEnabled,
          count: entry.dustCount,
          sizeMin: entry.dustSizeMin,
          sizeMax: entry.dustSizeMax,
          speed: entry.dustSpeed,
          colorLinked: entry.dustColorLinked,
          color: entry.dustColor,
          strength: entry.dustStrength,
          directionMode: entry.dustDirectionMode,
          directionLocal: [...entry.dustDirectionLocal] as [number, number, number],
          drift: entry.dustDrift,
          edgeFade: entry.dustEdgeFade,
        },
      }
    }),
  )
  const stencilVolumes = stencilVolumesRaw.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const animations: PublishedSceneV2['animations'] = []
  if (state.rotateAnimation.isAdded && state.rotateAnimation.targetObjectId) {
    animations.push({
      type: 'rotate',
      targetObjectId: getPublishNodeId(state.rotateAnimation.targetObjectId, state.sceneGraph, nodeIdCache),
      enabled: state.rotateAnimation.enabled,
      loop: state.rotateAnimation.loop,
      pivot: state.rotateAnimation.pivot,
      axis: state.rotateAnimation.axis,
      speed: state.rotateAnimation.speed,
      startProgress: state.rotateAnimation.startProgress,
      progress: state.rotateAnimation.progress,
    })
  }
  if (state.floatAnimation.isAdded && state.floatAnimation.targetObjectId) {
    animations.push({
      type: 'float',
      targetObjectId: getPublishNodeId(state.floatAnimation.targetObjectId, state.sceneGraph, nodeIdCache),
      enabled: state.floatAnimation.enabled,
      loop: state.floatAnimation.loop,
      amplitude: state.floatAnimation.amplitude,
      speed: state.floatAnimation.speed,
      tilt: state.floatAnimation.tilt,
      startProgress: state.floatAnimation.startProgress,
      progress: state.floatAnimation.progress,
    })
  }
  if (state.focusAnimation.isAdded && state.focusAnimation.targetObjectId) {
    animations.push({
      type: 'focus',
      targetObjectId: getPublishNodeId(state.focusAnimation.targetObjectId, state.sceneGraph, nodeIdCache),
      enabled: state.focusAnimation.enabled,
      frontFace: state.focusAnimation.frontFace,
      distance: state.focusAnimation.distance,
      duration: state.focusAnimation.duration,
    })
  }

  const publishedEnvironmentAssetUrl = state.environment.isEnvironmentEnabled
    ? state.assets.reflectionsUrl ?? state.environment.customHdriUrl ?? state.defaultEnvUrl
    : null
  const publishedEnvironmentPreset = getStandardEnvironmentPresetByUrl(publishedEnvironmentAssetUrl)
  const publishedEnvironmentAssetLabel =
    state.assets.reflections ?? state.environment.source ?? publishedEnvironmentPreset?.label ?? null

  const scene: PublishedSceneV2 = {
    version: 18,
    scene: {
      background: {
        mode: state.backgroundMode,
        color: state.backgroundColor,
        rotation: state.backgroundRotation,
      },
      environment: {
        enabled: state.environment.isEnvironmentEnabled,
        kind: state.environment.kind,
        assetLabel: publishedEnvironmentAssetLabel,
        assetUrl: publishedEnvironmentAssetUrl,
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
    responsiveFrame: buildPublishedResponsiveFrame(state.responsiveFrame),
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
    phoneScreenBoxes,
    godRaysGlobals: {
      noise: {
        amount: state.godRaysGlobalNoise.rayNoiseAmount,
        scale: state.godRaysGlobalNoise.rayNoiseScale,
        grain: state.godRaysGlobalNoise.rayGrain,
        motionMode: state.godRaysGlobalNoise.rayNoiseMotionMode,
        motionSpeed: state.godRaysGlobalNoise.rayNoiseMotionSpeed,
        quality: state.godRaysGlobalNoise.rayQuality,
      },
      direction: {
        vector: [...state.godRaysGlobalDirection] as [number, number, number],
      },
    },
    godRaysBoxes,
    stencilVolumes,
    model,
    objects,
    materials,
    animations,
  }

  return { scene, warnings }
}

export function buildPublishedScene() {
  return buildPublishedSceneInternal()
}

export async function downloadPublishedScene(filename = 'scene.json') {
  const { scene, warnings } = await buildPublishedSceneInternal()
  downloadJson(filename, scene)
  return warnings
}

export async function openPublishedScenePreview() {
  const { scene, warnings } = await buildPublishedSceneInternal()
  const previewPrefix = 'published-scene:'
  Object.keys(localStorage)
    .filter((key) => key.startsWith(previewPrefix))
    .forEach((key) => {
      localStorage.removeItem(key)
    })
  const previewKey = `published-scene:${Date.now()}`
  localStorage.setItem(previewKey, JSON.stringify(scene))
  const playerUrl = new URL(window.location.href)
  playerUrl.searchParams.set('player', '1')
  playerUrl.searchParams.set('preview', previewKey)
  window.open(playerUrl.toString(), '_blank')
  return warnings
}
