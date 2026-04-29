import { create } from 'zustand'
import * as THREE from 'three'

export type SceneNodeType = 'scene' | 'group' | 'mesh' | 'light' | 'camera' | 'material'
export type AtlasTargetSlot = 'emissive' | 'baseColor'
export type AtlasFrameOrder = 'row' | 'column'
export type AtlasUvChannel = 'auto' | 'normal' | 'baseColor' | 'emissive' | 'uv' | 'uv2'
export type AtlasWrapMode = 'repeat' | 'clamp'
export type TransformMode = 'translate' | 'rotate'

export interface AtlasEffectState {
  enabled: boolean
  targetSlot: AtlasTargetSlot
  frameOrder: AtlasFrameOrder
  gridX: number
  gridY: number
  fps: number
  frameCount: number
  currentFrame: number
  opacity: number
  frameBlend: boolean
  play: boolean
  loop: boolean
  uvChannel: AtlasUvChannel
  wrapMode: AtlasWrapMode
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
  rotation: number
  swapXY: boolean
}

export const DEFAULT_ATLAS_EFFECT: AtlasEffectState = {
  enabled: true,
  targetSlot: 'emissive',
  frameOrder: 'row',
  gridX: 2,
  gridY: 25,
  fps: 18,
  frameCount: 50,
  currentFrame: 0,
  opacity: 0.85,
  frameBlend: true,
  play: true,
  loop: true,
  uvChannel: 'auto',
  wrapMode: 'repeat',
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  swapXY: false,
}

export interface SceneGraphNode {
  id: string
  parentId: string | null
  children: string[]
  type: SceneNodeType
  label: string
  objectUuid?: string
  materialUuid?: string
  visible?: boolean
}

export interface ObjectTransformState {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  visible: boolean
}

export interface PbrMaterialState {
  id: string
  name: string
  type: string
  meshIds: string[]
  useSystemMaterial?: boolean
  color?: string
  emissive?: string
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  emissiveIntensity?: number
  clearcoat?: number
  hasMaps: {
    baseColor: boolean
    emissive: boolean
    normal: boolean
    ao: boolean
    roughness: boolean
    metalness: boolean
  }
  effect: AtlasEffectState
}

export interface EnvironmentState {
  source: string | null
  customHdriUrl: string | null
  kind: 'default' | 'hdri' | 'panorama'
  isEnvironmentEnabled: boolean
  intensity: number
  rotation: number
  background: 'none' | 'environment' | 'color' | 'reflections'
  backgroundVisible: boolean
  backgroundColor: string
  backgroundRotation: number
  backgroundIntensity: number
  backgroundBlur: number
  previewReflections: boolean
}

export interface ViewportHudState {
  orbitEnabled: boolean
  fpsEnabled: boolean
  gridVisible: boolean
  axesVisible: boolean
  transformMode: TransformMode
}

export interface ViewerState {
  cameraMode: 'orbit' | 'firstPerson'
  flightSpeed: number
  focalLength: number
  exposure: number
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]
  dofEnabled: boolean
  dofVisualizerEnabled: boolean
  dofFocusDistance: number
  dofAperture: number
  dofManualBlur: number
}

export interface AmbientLightState {
  exists: boolean
  color: string
  intensity: number
  visible: boolean
}

export type ExtraLightType = 'ambient' | 'directional' | 'point' | 'spot'

export interface ExtraLightState {
  id: string
  label: string
  type: ExtraLightType
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
  visible: boolean
}

export interface RuntimeTextureState {
  atlasTexture: THREE.Texture | null
  atlasFrameTexture: THREE.CanvasTexture | null
  environmentMap: THREE.Texture | null
  environmentBackground: THREE.Texture | null
}

export interface RuntimeRegistryState {
  objectById: Record<string, THREE.Object3D>
  materialById: Record<string, THREE.Material>
}

export interface AssetSourceState {
  model: string | null
  atlas: string | null
  reflections: string | null
  background: string | null
  fileSize: number | null
}

export interface AssetRequest {
  url: string
  label: string
  revokeAfter: boolean
  fileSize: number | null
  nonce: number
}

export interface EnvironmentRequest extends AssetRequest {
  kind: 'hdri' | 'panorama' | 'image'
}

export interface SceneConfig {
  version?: number
  assets?: {
    model?: string | null
    atlas?: string | null
    hdri?: string | null
    panorama?: string | null
  }
  viewer?: {
    cameraMode?: string | null
    focalLength?: number | null
    exposure?: number | null
    envIntensity?: number | null
    cameraPosition?: number[] | null
    orbitTarget?: number[] | null
    dofEnabled?: boolean | null
    dofVisualizerEnabled?: boolean | null
    dofFocusDistance?: number | null
    dofAperture?: number | null
    dofManualBlur?: number | null
  }
  materialSettings?: {
    color?: string | null
    emissive?: string | null
    metalness?: number | null
    roughness?: number | null
    envMapIntensity?: number | null
    emissiveIntensity?: number | null
    clearcoat?: number | null
  } | null
  modelTransform?: {
    position?: number[] | null
    rotation?: number[] | null
  } | null
  materialEffect?: (Partial<AtlasEffectState> & {
    materialId?: string | null
    materialName?: string | null
  }) | null
}

export interface SceneConfigRequest {
  config: SceneConfig
  label: string
  nonce: number
}

interface EditorState {
  sceneGraph: Record<string, SceneGraphNode>
  rootNodeId: string | null
  selectedObjectId: string | null
  objects: Record<string, ObjectTransformState>
  materials: Record<string, PbrMaterialState>
  environment: EnvironmentState
  lights: {
    ambient: AmbientLightState
  }
  hud: ViewportHudState
  viewer: ViewerState
  assets: AssetSourceState
  extraLights: ExtraLightState[]
  status: string
  runtimeTextures: RuntimeTextureState
  runtime: RuntimeRegistryState
  modelRequest: AssetRequest | null
  atlasRequest: AssetRequest | null
  environmentRequest: EnvironmentRequest | null
  configRequest: SceneConfigRequest | null
  sceneResetNonce: number
  setSelectedObjectId: (id: string | null) => void
  setSceneGraph: (
    sceneGraph: Record<string, SceneGraphNode>,
    objects: Record<string, ObjectTransformState>,
    materials: Record<string, PbrMaterialState>,
    rootNodeId: string | null,
    selectedObjectId?: string | null,
  ) => void
  updateObjectTransform: (id: string, patch: Partial<ObjectTransformState>) => void
  updateMaterial: (id: string, patch: Partial<Omit<PbrMaterialState, 'id' | 'effect' | 'hasMaps' | 'meshIds'>>) => void
  updateMaterialEffect: (materialId: string, patch: Partial<AtlasEffectState>) => void
  toggleObjectVisibility: (id: string) => void
  removeSceneNode: (id: string) => void
  toggleMaterialSystemState: (id: string) => void
  resetMaterial: (id: string) => void
  setEnvironment: (patch: Partial<EnvironmentState>) => void
  removeEnvironment: () => void
  setLights: (patch: Partial<{ ambient: Partial<AmbientLightState> }>) => void
  removeAmbientLight: () => void
  restoreAmbientLight: () => void
  setHud: (patch: Partial<ViewportHudState>) => void
  setViewer: (patch: Partial<ViewerState>) => void
  setAssets: (patch: Partial<AssetSourceState>) => void
  addExtraLight: (type?: ExtraLightType) => void
  removeExtraLight: (id?: string) => void
  updateExtraLight: (id: string, patch: Partial<ExtraLightState>) => void
  setStatus: (status: string) => void
  registerObjectRef: (id: string, object: THREE.Object3D | null) => void
  registerMaterialRef: (id: string, material: THREE.Material | null) => void
  setAtlasTexture: (texture: THREE.Texture | null) => void
  setAtlasFrameTexture: (texture: THREE.CanvasTexture | null) => void
  setEnvironmentTextures: (patch: Partial<RuntimeTextureState>) => void
  requestModelLoad: (payload: Omit<AssetRequest, 'nonce'>) => void
  requestAtlasLoad: (payload: Omit<AssetRequest, 'nonce'>) => void
  requestEnvironmentLoad: (payload: Omit<EnvironmentRequest, 'nonce'>) => void
  requestConfigImport: (payload: Omit<SceneConfigRequest, 'nonce'>) => void
  requestSceneReset: () => void
}

function clampEffect(effect: AtlasEffectState): AtlasEffectState {
  const maxFrames = Math.max(1, effect.gridX * effect.gridY)
  return {
    ...effect,
    frameCount: Math.min(Math.max(1, effect.frameCount), maxFrames),
    currentFrame: Math.min(Math.max(0, effect.currentFrame), Math.min(Math.max(1, effect.frameCount), maxFrames) - 1),
  }
}

export const useEditorStore = create<EditorState>((set) => ({
  sceneGraph: {},
  rootNodeId: null,
  selectedObjectId: null,
  objects: {},
  materials: {},
  environment: {
    source: null,
    customHdriUrl: null,
    kind: 'default',
    isEnvironmentEnabled: true,
    intensity: 1.5,
    rotation: 0,
    background: 'color',
    backgroundVisible: true,
    backgroundColor: '#808080',
    backgroundRotation: 0,
    backgroundIntensity: 1,
    backgroundBlur: 0,
    previewReflections: false,
  },
  lights: {
    ambient: {
      exists: true,
      color: '#ffffff',
      intensity: 0.5,
      visible: true,
    },
  },
  hud: {
    orbitEnabled: true,
    fpsEnabled: false,
    gridVisible: true,
    axesVisible: false,
    transformMode: 'translate',
  },
  viewer: {
    cameraMode: 'orbit',
    flightSpeed: 5,
    focalLength: 12,
    exposure: 1,
    cameraPosition: [4, 3, 5],
    orbitTarget: [0, 0, 0],
    dofEnabled: false,
    dofVisualizerEnabled: false,
    dofFocusDistance: 5,
    dofAperture: 2,
    dofManualBlur: 1.2,
  },
  assets: {
    model: null,
    atlas: null,
    reflections: null,
    background: null,
    fileSize: null,
  },
  extraLights: [],
  status: 'Ready. Load a model, atlas, and optional HDRI to begin.',
  runtimeTextures: {
    atlasTexture: null,
    atlasFrameTexture: null,
    environmentMap: null,
    environmentBackground: null,
  },
  runtime: {
    objectById: {},
    materialById: {},
  },
  modelRequest: null,
  atlasRequest: null,
  environmentRequest: null,
  configRequest: null,
  sceneResetNonce: 0,
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setSceneGraph: (sceneGraph, objects, materials, rootNodeId, selectedObjectId) =>
    set((state) => {
      const nextSceneGraph = { ...sceneGraph }
      const nextObjects = { ...objects }

      state.extraLights.forEach((light) => {
        nextSceneGraph[light.id] = {
          id: light.id,
          parentId: null,
          children: [],
          type: 'light',
          label: light.label,
          objectUuid: light.id,
          visible: light.visible,
        }
        nextObjects[light.id] = {
          position: light.position,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: light.visible,
        }
      })

      return {
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
        materials,
        rootNodeId,
        selectedObjectId: selectedObjectId === undefined ? rootNodeId : selectedObjectId,
      }
    }),
  updateObjectTransform: (id, patch) =>
    set((state) => ({
      objects: {
        ...state.objects,
        [id]: {
          ...state.objects[id],
          ...patch,
        },
      },
    })),
  updateMaterial: (id, patch) =>
    set((state) => ({
      materials: {
        ...state.materials,
        [id]: {
          ...state.materials[id],
          ...patch,
        },
      },
    })),
  updateMaterialEffect: (materialId, patch) =>
    set((state) => {
      const current = state.materials[materialId]
      if (!current) {
        return state
      }

      const nextEffect = clampEffect({
        ...current.effect,
        ...patch,
      })

      return {
        materials: {
          ...state.materials,
          [materialId]: {
            ...current,
            effect: nextEffect,
          },
        },
      }
    }),
  toggleObjectVisibility: (id) =>
    set((state) => {
      const currentObject = state.objects[id]
      const currentNode = state.sceneGraph[id]
      if (!currentObject || !currentNode) {
        return state
      }

      const nextVisible = !currentObject.visible
      return {
        objects: {
          ...state.objects,
          [id]: {
            ...currentObject,
            visible: nextVisible,
          },
        },
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            ...currentNode,
            visible: nextVisible,
          },
        },
      }
    }),
  removeSceneNode: (id) =>
    set((state) => {
      const targetNode = state.sceneGraph[id]
      if (!targetNode) {
        return state
      }

      const collectDescendants = (nodeId: string): string[] => {
        const node = state.sceneGraph[nodeId]
        if (!node) {
          return []
        }

        return [nodeId, ...node.children.flatMap(collectDescendants)]
      }

      const idsToRemove = new Set(collectDescendants(id))
      const sceneGraph = { ...state.sceneGraph }
      const objects = { ...state.objects }
      const materials = { ...state.materials }
      const runtimeObjectById = { ...state.runtime.objectById }
      const runtimeMaterialById = { ...state.runtime.materialById }
      const runtimeObject = runtimeObjectById[id]

      if (runtimeObject?.parent) {
        runtimeObject.parent.remove(runtimeObject)
      }

      if (targetNode.parentId && sceneGraph[targetNode.parentId]) {
        sceneGraph[targetNode.parentId] = {
          ...sceneGraph[targetNode.parentId],
          children: sceneGraph[targetNode.parentId].children.filter((childId) => childId !== id),
        }
      }

      idsToRemove.forEach((nodeId) => {
        const node = sceneGraph[nodeId]
        if (!node) {
          return
        }

        delete sceneGraph[nodeId]
        delete objects[nodeId]
        delete runtimeObjectById[nodeId]

        if (node.type === 'material') {
          const materialState = materials[nodeId]
          if (materialState && materialState.meshIds.length <= 1) {
            delete materials[nodeId]
            delete runtimeMaterialById[nodeId]
          } else if (materialState) {
            materials[nodeId] = {
              ...materialState,
              meshIds: materialState.meshIds.filter((meshId) => meshId !== id),
            }
          }
        }
      })

      return {
        sceneGraph,
        objects,
        materials,
        runtime: {
          objectById: runtimeObjectById,
          materialById: runtimeMaterialById,
        },
        selectedObjectId:
          state.selectedObjectId === id || (state.selectedObjectId && idsToRemove.has(state.selectedObjectId))
            ? null
            : state.selectedObjectId,
      }
    }),
  toggleMaterialSystemState: (id) =>
    set((state) => {
      const material = state.materials[id]
      if (!material) {
        return state
      }

      return {
        materials: {
          ...state.materials,
          [id]: {
            ...material,
            useSystemMaterial: !material.useSystemMaterial,
          },
        },
      }
    }),
  resetMaterial: (id) =>
    set((state) => {
      const material = state.materials[id]
      const runtimeMaterial = state.runtime.materialById[id] as (THREE.MeshStandardMaterial & { clearcoat?: number }) | undefined
      if (!material) {
        return state
      }

      if (runtimeMaterial) {
        runtimeMaterial.map = null
        runtimeMaterial.normalMap = null
        runtimeMaterial.roughnessMap = null
        runtimeMaterial.metalnessMap = null
        runtimeMaterial.aoMap = null
        runtimeMaterial.emissiveMap = null
        delete runtimeMaterial.userData.originalTextureSlots
        runtimeMaterial.color.set('#ffffff')
        runtimeMaterial.emissive.set('#000000')
        runtimeMaterial.metalness = 0
        runtimeMaterial.roughness = 1
        runtimeMaterial.emissiveIntensity = 1
        if ('envMapIntensity' in runtimeMaterial) {
          runtimeMaterial.envMapIntensity = 1
        }
        if ('clearcoat' in runtimeMaterial) {
          runtimeMaterial.clearcoat = 0
        }
        runtimeMaterial.needsUpdate = true
      }

      return {
        materials: {
          ...state.materials,
          [id]: {
            ...material,
            useSystemMaterial: false,
            color: '#ffffff',
            emissive: '#000000',
            metalness: 0,
            roughness: 1,
            envMapIntensity: 1,
            emissiveIntensity: 1,
            clearcoat: 0,
            hasMaps: {
              baseColor: false,
              emissive: false,
              normal: false,
              ao: false,
              roughness: false,
              metalness: false,
            },
          },
        },
      }
    }),
  setEnvironment: (patch) =>
    set((state) => ({
      environment: {
        ...state.environment,
        ...patch,
      },
    })),
  removeEnvironment: () =>
    set((state) => {
      state.runtimeTextures.environmentMap?.dispose()

      return {
        environment: {
          ...state.environment,
          source: null,
          customHdriUrl: null,
          kind: 'default',
          isEnvironmentEnabled: false,
        },
        assets: {
          ...state.assets,
          reflections: null,
        },
        runtimeTextures: {
          ...state.runtimeTextures,
          environmentMap: null,
        },
      }
    }),
  setLights: (patch) =>
    set((state) => ({
      lights: {
        ambient: {
          ...state.lights.ambient,
          ...(patch.ambient ?? {}),
        },
      },
    })),
  removeAmbientLight: () =>
    set((state) => ({
      lights: {
        ambient: {
          ...state.lights.ambient,
          exists: false,
          visible: false,
        },
      },
      selectedObjectId: state.selectedObjectId === 'light:ambient:system' ? null : state.selectedObjectId,
    })),
  restoreAmbientLight: () =>
    set((state) => ({
      lights: {
        ambient: {
          exists: true,
          color: state.lights.ambient.color || '#ffffff',
          intensity: state.lights.ambient.intensity > 0.001 ? state.lights.ambient.intensity : 0.5,
          visible: true,
        },
      },
      selectedObjectId: 'light:ambient:system',
    })),
  setHud: (patch) =>
    set((state) => ({
      hud: {
        ...state.hud,
        ...patch,
      },
    })),
  setViewer: (patch) =>
    set((state) => ({
      viewer: {
        ...state.viewer,
        ...patch,
      },
    })),
  setAssets: (patch) =>
    set((state) => ({
      assets: {
        ...state.assets,
        ...patch,
      },
    })),
  addExtraLight: (type = 'point') =>
    set((state) => {
      const nextIndex = state.extraLights.length + 1
      const id = `light:extra:${nextIndex}:${Date.now()}`
      const light: ExtraLightState = {
        id,
        label:
          type === 'ambient'
            ? `Ambient Light ${nextIndex}`
            : type === 'directional'
              ? `Directional Light ${nextIndex}`
              : type === 'spot'
                ? `Spot Light ${nextIndex}`
                : `Point Light ${nextIndex}`,
        type,
        color: type === 'ambient' ? '#fff0d9' : nextIndex % 2 === 0 ? '#ffd9bf' : '#e5f4ff',
        intensity: type === 'ambient' ? 0.45 : type === 'directional' ? 1.2 : nextIndex === 1 ? 1.5 : 1.15,
        distance: type === 'ambient' || type === 'directional' ? 0 : 12,
        decay: type === 'ambient' || type === 'directional' ? 0 : 2,
        angle: 30,
        penumbra: 0.2,
        castShadow: type === 'directional' || type === 'spot',
        shadowBias: -0.0003,
        position:
          type === 'ambient'
            ? [0, 0, 0]
            : nextIndex === 1
              ? [2.5, 1.4, -2.2]
              : nextIndex === 2
                ? [-2.4, 2.1, -1.6]
                : nextIndex === 3
                  ? [0.4, 3.4, 2.6]
                  : [-0.6, 1.1, 3.1],
        targetPosition: [0, 0, 0],
        visible: true,
      }

      return {
        extraLights: [...state.extraLights, light],
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            id,
            parentId: null,
            children: [],
            type: 'light',
            label: light.label,
            objectUuid: id,
            visible: true,
          },
        },
        objects: {
          ...state.objects,
          [id]: {
            position: light.position,
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
          },
        },
        selectedObjectId: id,
      }
    }),
  removeExtraLight: (id) =>
    set((state) => {
      const targetId = id ?? state.extraLights[state.extraLights.length - 1]?.id
      if (!targetId) {
        return state
      }

      const sceneGraph = { ...state.sceneGraph }
      const objects = { ...state.objects }
      const runtimeObjectById = { ...state.runtime.objectById }
      delete sceneGraph[targetId]
      delete objects[targetId]
      delete runtimeObjectById[targetId]

      return {
        extraLights: state.extraLights.filter((light) => light.id !== targetId),
        sceneGraph,
        objects,
        runtime: {
          ...state.runtime,
          objectById: runtimeObjectById,
        },
        selectedObjectId: state.selectedObjectId === targetId ? null : state.selectedObjectId,
      }
    }),
  updateExtraLight: (id, patch) =>
    set((state) => {
      const light = state.extraLights.find((entry) => entry.id === id)
      if (!light) {
        return state
      }

      const nextLight = { ...light, ...patch }
      return {
        extraLights: state.extraLights.map((entry) => (entry.id === id ? nextLight : entry)),
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            ...state.sceneGraph[id],
            label: nextLight.label,
            visible: nextLight.visible,
          },
        },
        objects: {
          ...state.objects,
          [id]: {
            ...(state.objects[id] ?? {
              position: nextLight.position,
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number],
              visible: nextLight.visible,
            }),
            position: nextLight.position,
            visible: nextLight.visible,
          },
        },
      }
    }),
  setStatus: (status) => set({ status }),
  registerObjectRef: (id, object) =>
    set((state) => {
      const objectById = { ...state.runtime.objectById }
      if (object) {
        objectById[id] = object
      } else {
        delete objectById[id]
      }
      return {
        runtime: {
          ...state.runtime,
          objectById,
        },
      }
    }),
  registerMaterialRef: (id, material) =>
    set((state) => {
      const materialById = { ...state.runtime.materialById }
      if (material) {
        materialById[id] = material
      } else {
        delete materialById[id]
      }
      return {
        runtime: {
          ...state.runtime,
          materialById,
        },
      }
    }),
  setAtlasTexture: (texture) =>
    set((state) => ({
      runtimeTextures: {
        ...state.runtimeTextures,
        atlasTexture: texture,
      },
    })),
  setAtlasFrameTexture: (texture) =>
    set((state) => ({
      runtimeTextures: {
        ...state.runtimeTextures,
        atlasFrameTexture: texture,
      },
    })),
  setEnvironmentTextures: (patch) =>
    set((state) => ({
      runtimeTextures: {
        ...state.runtimeTextures,
        ...patch,
      },
    })),
  requestModelLoad: (payload) =>
    set((state) => ({
      modelRequest: {
        ...payload,
        nonce: (state.modelRequest?.nonce ?? 0) + 1,
      },
    })),
  requestAtlasLoad: (payload) =>
    set((state) => ({
      atlasRequest: {
        ...payload,
        nonce: (state.atlasRequest?.nonce ?? 0) + 1,
      },
    })),
  requestEnvironmentLoad: (payload) =>
    set((state) => ({
      environmentRequest: {
        ...payload,
        nonce: (state.environmentRequest?.nonce ?? 0) + 1,
      },
    })),
  requestConfigImport: (payload) =>
    set((state) => ({
      configRequest: {
        ...payload,
        nonce: (state.configRequest?.nonce ?? 0) + 1,
      },
    })),
  requestSceneReset: () =>
    set((state) => {
      state.runtimeTextures.atlasTexture?.dispose()
      state.runtimeTextures.atlasFrameTexture?.dispose()
      state.runtimeTextures.environmentMap?.dispose()
      if (
        state.runtimeTextures.environmentBackground &&
        state.runtimeTextures.environmentBackground !== state.runtimeTextures.environmentMap
      ) {
        state.runtimeTextures.environmentBackground.dispose()
      }

      return {
        sceneGraph: {},
        rootNodeId: null,
        selectedObjectId: null,
        objects: {},
        materials: {},
        environment: {
          source: null,
          customHdriUrl: null,
          kind: 'default',
          isEnvironmentEnabled: true,
          intensity: 1.5,
          rotation: 0,
          background: 'color',
          backgroundVisible: true,
          backgroundColor: '#808080',
          backgroundRotation: 0,
          backgroundIntensity: 1,
          backgroundBlur: 0,
          previewReflections: false,
        },
        lights: {
          ambient: {
            exists: true,
            color: '#ffffff',
            intensity: 0.5,
            visible: true,
          },
        },
        viewer: {
          cameraMode: 'orbit',
          flightSpeed: 5,
          focalLength: 12,
          exposure: 1,
          cameraPosition: [4, 3, 5],
          orbitTarget: [0, 0, 0],
          dofEnabled: false,
          dofVisualizerEnabled: false,
          dofFocusDistance: 5,
          dofAperture: 2,
          dofManualBlur: 1.2,
        },
        hud: {
          orbitEnabled: true,
          fpsEnabled: false,
          gridVisible: true,
          axesVisible: false,
          transformMode: 'translate',
        },
        assets: {
          model: null,
          atlas: null,
          reflections: null,
          background: null,
          fileSize: null,
        },
        extraLights: [],
        runtimeTextures: {
          atlasTexture: null,
          atlasFrameTexture: null,
          environmentMap: null,
          environmentBackground: null,
        },
        runtime: {
          objectById: {},
          materialById: {},
        },
        modelRequest: null,
        atlasRequest: null,
        environmentRequest: null,
        configRequest: null,
        sceneResetNonce: state.sceneResetNonce + 1,
        status: 'Scene reset.',
      }
    }),
}))
