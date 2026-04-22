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

export interface ExtraLightState {
  id: string
  label: string
  type: 'point'
  color: string
  intensity: number
  distance: number
  decay: number
  position: [number, number, number]
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
}

export interface AssetRequest {
  url: string
  label: string
  revokeAfter: boolean
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
  setEnvironment: (patch: Partial<EnvironmentState>) => void
  setHud: (patch: Partial<ViewportHudState>) => void
  setViewer: (patch: Partial<ViewerState>) => void
  setAssets: (patch: Partial<AssetSourceState>) => void
  addExtraLight: () => void
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
    intensity: 0.8,
    rotation: 0,
    background: 'color',
    backgroundVisible: true,
    backgroundColor: '#808080',
    backgroundRotation: 0,
    backgroundIntensity: 1,
    backgroundBlur: 0,
    previewReflections: false,
  },
  hud: {
    orbitEnabled: true,
    fpsEnabled: false,
    gridVisible: false,
    axesVisible: false,
    transformMode: 'translate',
  },
  viewer: {
    cameraMode: 'orbit',
    focalLength: 12,
    exposure: 1,
    cameraPosition: [3.4, 2.2, 5.6],
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
  setEnvironment: (patch) =>
    set((state) => ({
      environment: {
        ...state.environment,
        ...patch,
      },
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
  addExtraLight: () =>
    set((state) => {
      const nextIndex = state.extraLights.length + 1
      const id = `light:extra:${nextIndex}:${Date.now()}`
      const light: ExtraLightState = {
        id,
        label: `Extra Light ${nextIndex}`,
        type: 'point',
        color: nextIndex % 2 === 0 ? '#ffd9bf' : '#e5f4ff',
        intensity: nextIndex === 1 ? 1.5 : 1.15,
        distance: 12,
        decay: 2,
        position:
          nextIndex === 1
            ? [2.5, 1.4, -2.2]
            : nextIndex === 2
              ? [-2.4, 2.1, -1.6]
              : nextIndex === 3
                ? [0.4, 3.4, 2.6]
                : [-0.6, 1.1, 3.1],
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
          intensity: 0.8,
          rotation: 0,
          background: 'color',
          backgroundVisible: true,
          backgroundColor: '#808080',
          backgroundRotation: 0,
          backgroundIntensity: 1,
          backgroundBlur: 0,
          previewReflections: false,
        },
        viewer: {
          cameraMode: 'orbit',
          focalLength: 12,
          exposure: 1,
          cameraPosition: [3.4, 2.2, 5.6],
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
