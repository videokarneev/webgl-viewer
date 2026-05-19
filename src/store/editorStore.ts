import { create } from 'zustand'
import * as THREE from 'three'
import { DEFAULT_STANDARD_ENVIRONMENT_PRESET } from '../features/environment/standardEnvironmentPresets'

export type SceneNodeType = 'scene' | 'group' | 'mesh' | 'light' | 'camera' | 'material'
export type AtlasTargetSlot = 'emissive' | 'baseColor'
export type AtlasFrameOrder = 'row' | 'column'
export type AtlasUvChannel = 'auto' | 'normal' | 'baseColor' | 'emissive' | 'uv' | 'uv2'
export type AtlasWrapMode = 'repeat' | 'clamp'
export type TransformMode = 'translate' | 'rotate' | 'none'
export type MeasurementUnit = 'cm' | 'm'
export type BackgroundMode = 'none' | 'color' | 'background' | 'hdri'
export type MaterialTextureSlot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap' | 'alphaMap' | 'bumpMap' | 'displacementMap' | 'specularMap'
export type MaterialTextureSource = 'original' | 'custom'
export type RotateAnimationPivot = 'pivot' | 'gizmo'
export type RotateAnimationAxis = 'x' | 'y' | 'z'
export type FrameAspectPreset = '1:1' | '3:2' | '2:3' | '16:9' | '9:16'

export interface MaterialTextureSlotState {
  originalLabel: string | null
  originalUrl?: string | null
  customLabel: string | null
  customUrl?: string | null
  customFileSize?: number | null
  selectedSource: MaterialTextureSource | null
}

export const MATERIAL_TEXTURE_SLOTS: MaterialTextureSlot[] = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'specularMap',
]

export const DEFAULT_VIEWER_FOCAL_LENGTH = 20
export const DEFAULT_VIEWER_CAMERA_FOV = 63.5
export const DEFAULT_VIEWER_CAMERA_POSITION: [number, number, number] = [4, 3, 5]
export const DEFAULT_VIEWER_ORBIT_TARGET: [number, number, number] = [0, 0, 0]
export const DEFAULT_FRAME_ASPECT_PRESET: FrameAspectPreset = '1:1'

export interface AtlasEffectState {
  isAdded: boolean
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
  isAdded: false,
  enabled: true,
  targetSlot: 'emissive',
  frameOrder: 'column',
  gridX: 2,
  gridY: 25,
  fps: 12,
  frameCount: 50,
  currentFrame: 0,
  opacity: 0.85,
  frameBlend: true,
  play: false,
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

export interface LoadedModelState {
  rootNodeId: string
  label: string
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
  environmentOverrideId?: string | null
  environmentRotation?: number
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
  textureSlots: Record<MaterialTextureSlot, MaterialTextureSlotState>
  effect: AtlasEffectState
}

export interface MaterialEnvironmentAssetState {
  id: string
  label: string
  kind: 'hdri' | 'panorama'
  assetUrl?: string | null
  fileSize?: number | null
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
  previewMaterialEnvironmentId: string | null
  previewMaterialEnvironmentRotation: number
}

export interface ViewportHudState {
  orbitEnabled: boolean
  fpsEnabled: boolean
  performanceStatsVisible: boolean
  gridVisible: boolean
  axesVisible: boolean
  postEffectsEnabled: boolean
  postEffectsVisible: boolean
  anchorModeEnabled: boolean
  sidebarVisible: boolean
  inspectorVisible: boolean
  transformMode: TransformMode
}

export interface TransformSettingsState {
  measurementUnit: MeasurementUnit
  translationStep: number
  isGridSnapping: boolean
  rotationStep: number
  gridSize: number
}

export interface ViewerState {
  cameraMode: 'orbit' | 'firstPerson'
  flightSpeed: number
  focalLength: number
  frameAspectPreset: FrameAspectPreset
  frameGuidesEnabled: boolean
  exposure: number
  bloomIntensity: number
  bloomRadius: number
  bloomThreshold: number
  toneMappingWhitePoint: number
  toneMappingAdaptation: number
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]
  resetCameraPosition: [number, number, number]
  resetOrbitTarget: [number, number, number]
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

export interface LightRigState {
  hemisphere: number
  key: number
  fill: number
  rim: number
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
  materialEnvironmentMaps: Record<string, THREE.Texture>
}

export interface RuntimeRegistryState {
  objectById: Record<string, THREE.Object3D>
  materialById: Record<string, THREE.Material>
}

export interface ViewportMetricsState {
  fps: number
  vertices: number
  triangles: number
  drawCalls: number
}

export interface AssetSourceState {
  model: string | null
  modelUrl?: string | null
  atlas: string | null
  atlasUrl?: string | null
  atlasFileSize?: number | null
  reflections: string | null
  reflectionsUrl?: string | null
  reflectionsFileSize?: number | null
  background: string | null
  backgroundUrl?: string | null
  backgroundFileSize?: number | null
  fileSize: number | null
}

export interface AssetRequest {
  url: string
  label: string
  revokeAfter: boolean
  fileSize: number | null
  nonce: number
}

export interface RotateAnimationState {
  isAdded: boolean
  enabled: boolean
  play: boolean
  loop: boolean
  progress: number
  targetObjectId: string | null
  pivot: RotateAnimationPivot
  axis: RotateAnimationAxis
  speed: number
}

export const DEFAULT_ROTATE_ANIMATION: RotateAnimationState = {
  isAdded: false,
  enabled: true,
  play: false,
  loop: true,
  progress: 0,
  targetObjectId: null,
  pivot: 'pivot',
  axis: 'y',
  speed: 45,
}

export interface BackgroundAudioState {
  isAdded: boolean
  enabled: boolean
  previewEnabled: boolean
  previewPlaying: boolean
  previewCurrentTime: number
  previewDuration: number
  assetLabel: string | null
  assetUrl: string | null
  fileSize: number | null
  volume: number
  loop: boolean
}

export const DEFAULT_BACKGROUND_AUDIO: BackgroundAudioState = {
  isAdded: false,
  enabled: false,
  previewEnabled: true,
  previewPlaying: true,
  previewCurrentTime: 0,
  previewDuration: 0,
  assetLabel: null,
  assetUrl: null,
  fileSize: null,
  volume: 0.16,
  loop: true,
}

export interface EnvironmentRequest extends AssetRequest {
  kind: 'hdri' | 'panorama' | 'image' | 'background'
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
    frameAspectPreset?: FrameAspectPreset | null
    frameGuidesEnabled?: boolean | null
    exposure?: number | null
    bloomIntensity?: number | null
    bloomRadius?: number | null
    bloomThreshold?: number | null
    toneMappingWhitePoint?: number | null
    toneMappingAdaptation?: number | null
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

interface HistorySnapshot {
  sceneGraph: Record<string, SceneGraphNode>
  objects: Record<string, ObjectTransformState>
  materials: Record<string, PbrMaterialState>
  environment: EnvironmentState
  lights: {
    ambient: AmbientLightState
    rig: LightRigState
  }
  transformSettings: TransformSettingsState
  viewer: ViewerState
  backgroundMode: BackgroundMode
  backgroundColor: string
  backgroundRotation: number
  extraLights: ExtraLightState[]
  rotateAnimation: RotateAnimationState
  backgroundAudio: BackgroundAudioState
}

interface HistoryState {
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  isApplying: boolean
  gestureSnapshot: HistorySnapshot | null
  gestureActive: boolean
}

interface EditorState {
  sceneGraph: Record<string, SceneGraphNode>
  rootNodeId: string | null
  rootNodeIds: string[]
  loadedModels: LoadedModelState[]
  loadedFileName: string | null
  isZenMode: boolean
  defaultEnvUrl: string
  backgroundEnabled: boolean
  backgroundMode: BackgroundMode
  backgroundColor: string
  backgroundPanoramaUrl: string
  backgroundRotation: number
  selectedObjectId: string | null
  selectedMaterialId: string | null
  selectedAnchorIndex: number | null
  objects: Record<string, ObjectTransformState>
  materials: Record<string, PbrMaterialState>
  materialEnvironments: Record<string, MaterialEnvironmentAssetState>
  environment: EnvironmentState
  lights: {
    ambient: AmbientLightState
    rig: LightRigState
  }
  hud: ViewportHudState
  transformSettings: TransformSettingsState
  viewer: ViewerState
  assets: AssetSourceState
  extraLights: ExtraLightState[]
  rotateAnimation: RotateAnimationState
  backgroundAudio: BackgroundAudioState
  status: string
  runtimeTextures: RuntimeTextureState
  runtime: RuntimeRegistryState
  viewportMetrics: ViewportMetricsState
  modelRequest: AssetRequest | null
  atlasRequest: AssetRequest | null
  environmentRequest: EnvironmentRequest | null
  configRequest: SceneConfigRequest | null
  sceneResetNonce: number
  history: HistoryState
  setSelectedObjectId: (id: string | null) => void
  setSelectedMaterialId: (id: string | null) => void
  setSelectedAnchorIndex: (index: number | null) => void
  setSceneGraph: (
    sceneGraph: Record<string, SceneGraphNode>,
    objects: Record<string, ObjectTransformState>,
    materials: Record<string, PbrMaterialState>,
    rootNodeId: string | null,
    selectedObjectId?: string | null,
    loadedModelLabel?: string | null,
  ) => void
  addLoadedModel: (
    sceneGraph: Record<string, SceneGraphNode>,
    objects: Record<string, ObjectTransformState>,
    materials: Record<string, PbrMaterialState>,
    rootNodeId: string,
    loadedModelLabel: string,
    selectedObjectId?: string | null,
  ) => void
  updateObjectTransform: (id: string, patch: Partial<ObjectTransformState>) => void
  updateMaterial: (id: string, patch: Partial<Omit<PbrMaterialState, 'id' | 'effect' | 'hasMaps' | 'meshIds'>>) => void
  updateMaterialEffect: (materialId: string, patch: Partial<AtlasEffectState>) => void
  toggleObjectVisibility: (id: string) => void
  removeSceneNode: (id: string) => void
  toggleVisibility: (id: string) => void
  deleteObject: (id: string) => void
  resetMaterialToDefault: (materialId: string) => void
  toggleMaterialSystemState: (id: string) => void
  resetMaterial: (id: string) => void
  setEnvironment: (patch: Partial<EnvironmentState>) => void
  removeEnvironment: () => void
  setLights: (patch: Partial<{ ambient: Partial<AmbientLightState>; rig: Partial<LightRigState> }>) => void
  removeAmbientLight: () => void
  restoreAmbientLight: () => void
  setZenMode: (value: boolean) => void
  toggleZenMode: () => void
  setBackgroundEnabled: (value: boolean) => void
  setBackgroundMode: (value: BackgroundMode) => void
  setBackgroundColor: (value: string) => void
  setBackgroundPanoramaUrl: (value: string) => void
  setBackgroundRotation: (value: number) => void
  setHud: (patch: Partial<ViewportHudState>) => void
  setTransformSettings: (patch: Partial<TransformSettingsState>) => void
  setViewer: (patch: Partial<ViewerState>) => void
  setAssets: (patch: Partial<AssetSourceState>) => void
  addExtraLight: (type?: ExtraLightType) => void
  removeExtraLight: (id?: string) => void
  updateExtraLight: (id: string, patch: Partial<ExtraLightState>) => void
  replaceExtraLights: (lights: ExtraLightState[]) => void
  addRotateAnimation: (targetObjectId: string | null) => void
  updateRotateAnimation: (patch: Partial<RotateAnimationState>) => void
  removeRotateAnimation: () => void
  setBackgroundAudio: (patch: Partial<BackgroundAudioState>) => void
  setStatus: (status: string) => void
  registerObjectRef: (id: string, object: THREE.Object3D | null) => void
  registerMaterialRef: (id: string, material: THREE.Material | null) => void
  setAtlasTexture: (texture: THREE.Texture | null) => void
  setAtlasFrameTexture: (texture: THREE.CanvasTexture | null) => void
  setEnvironmentTextures: (patch: Partial<RuntimeTextureState>) => void
  upsertMaterialEnvironment: (entry: MaterialEnvironmentAssetState, texture: THREE.Texture) => void
  removeMaterialEnvironment: (id: string) => void
  setViewportMetrics: (patch: Partial<ViewportMetricsState>) => void
  requestModelLoad: (payload: Omit<AssetRequest, 'nonce'>) => void
  requestAtlasLoad: (payload: Omit<AssetRequest, 'nonce'>) => void
  requestEnvironmentLoad: (payload: Omit<EnvironmentRequest, 'nonce'>) => void
  requestConfigImport: (payload: Omit<SceneConfigRequest, 'nonce'>) => void
  requestSceneReset: () => void
  beginHistoryGesture: () => void
  endHistoryGesture: () => void
  undoHistory: () => void
  redoHistory: () => void
}

function clampEffect(effect: AtlasEffectState): AtlasEffectState {
  const maxFrames = Math.max(1, effect.gridX * effect.gridY)
  return {
    ...effect,
    frameCount: maxFrames,
    currentFrame: Math.min(Math.max(0, effect.currentFrame), maxFrames - 1),
  }
}

function disposeRuntimeMaterial(material: THREE.Material) {
  disposeCustomRuntimeTextures(material)
  const standardMaterial = material as THREE.MeshStandardMaterial
  standardMaterial.map?.dispose()
  standardMaterial.normalMap?.dispose()
  standardMaterial.roughnessMap?.dispose()
  standardMaterial.metalnessMap?.dispose()
  standardMaterial.aoMap?.dispose()
  standardMaterial.emissiveMap?.dispose()
  material.dispose()
}

function createEmptyMaterialTextureSlots() {
  return Object.fromEntries(
    MATERIAL_TEXTURE_SLOTS.map((slot) => [
      slot,
      {
        originalLabel: null,
        originalUrl: null,
        customLabel: null,
        customUrl: null,
        customFileSize: null,
        selectedSource: null,
      },
    ]),
  ) as Record<MaterialTextureSlot, MaterialTextureSlotState>
}

function disposeCustomRuntimeTextures(material: THREE.Material) {
  const runtimeLike = material as THREE.Material & {
    userData: THREE.Material['userData'] & {
      customTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    }
  }

  const customTextureSlots = runtimeLike.userData.customTextureSlots
  if (!customTextureSlots) {
    return
  }

  Object.values(customTextureSlots).forEach((texture) => {
    texture?.dispose()
  })

  delete runtimeLike.userData.customTextureSlots
}

function disposeRuntimeObject(object: THREE.Object3D) {
  if (!(object as THREE.Mesh).isMesh) {
    return
  }

  const mesh = object as THREE.Mesh
  mesh.geometry?.dispose()
}

const HISTORY_LIMIT = 100

function cloneSceneGraphState(sceneGraph: Record<string, SceneGraphNode>) {
  return Object.fromEntries(
    Object.entries(sceneGraph).map(([id, node]) => [
      id,
      {
        ...node,
        children: [...node.children],
      },
    ]),
  )
}

function cloneObjectsState(objects: Record<string, ObjectTransformState>) {
  return Object.fromEntries(
    Object.entries(objects).map(([id, object]) => [
      id,
      {
        ...object,
        position: [...object.position] as [number, number, number],
        rotation: [...object.rotation] as [number, number, number],
        scale: [...object.scale] as [number, number, number],
      },
    ]),
  )
}

function cloneMaterialsState(materials: Record<string, PbrMaterialState>) {
  return Object.fromEntries(
    Object.entries(materials).map(([id, material]) => [
      id,
      {
        ...material,
        meshIds: [...material.meshIds],
        hasMaps: { ...material.hasMaps },
        textureSlots: Object.fromEntries(
          Object.entries(material.textureSlots).map(([slot, textureState]) => [slot, { ...textureState }]),
        ) as Record<MaterialTextureSlot, MaterialTextureSlotState>,
        effect: { ...material.effect },
      },
    ]),
  )
}

function cloneExtraLightsState(extraLights: ExtraLightState[]) {
  return extraLights.map((light) => ({
    ...light,
    position: [...light.position] as [number, number, number],
    targetPosition: [...light.targetPosition] as [number, number, number],
  }))
}

function cloneRotateAnimationState(rotateAnimation: RotateAnimationState): RotateAnimationState {
  return { ...rotateAnimation }
}

function cloneBackgroundAudioState(backgroundAudio: BackgroundAudioState): BackgroundAudioState {
  return { ...backgroundAudio }
}

function cloneViewerState(viewer: ViewerState): ViewerState {
  return {
    ...viewer,
    cameraPosition: [...viewer.cameraPosition],
    orbitTarget: [...viewer.orbitTarget],
    resetCameraPosition: [...viewer.resetCameraPosition],
    resetOrbitTarget: [...viewer.resetOrbitTarget],
  }
}

function createHistorySnapshot(state: EditorState): HistorySnapshot {
  return {
    sceneGraph: cloneSceneGraphState(state.sceneGraph),
    objects: cloneObjectsState(state.objects),
    materials: cloneMaterialsState(state.materials),
    environment: {
      ...state.environment,
      previewReflections: false,
      previewMaterialEnvironmentId: null,
      previewMaterialEnvironmentRotation: 0,
    },
    lights: {
      ambient: { ...state.lights.ambient },
      rig: { ...state.lights.rig },
    },
    transformSettings: { ...state.transformSettings },
    viewer: cloneViewerState(state.viewer),
    backgroundMode: state.backgroundMode,
    backgroundColor: state.backgroundColor,
    backgroundRotation: state.backgroundRotation,
    extraLights: cloneExtraLightsState(state.extraLights),
    rotateAnimation: cloneRotateAnimationState(state.rotateAnimation),
    backgroundAudio: cloneBackgroundAudioState(state.backgroundAudio),
  }
}

function withHistory(state: EditorState, patch: Partial<EditorState>, shouldRecord = true) {
  if (!shouldRecord || state.history.isApplying) {
    return patch
  }

  if (state.history.gestureActive) {
    return patch
  }

  const past = [...state.history.past, createHistorySnapshot(state)].slice(-HISTORY_LIMIT)
  return {
    ...patch,
    history: {
      past,
      future: [],
      isApplying: false,
      gestureSnapshot: null,
      gestureActive: false,
    },
  }
}

function clearHistory(): HistoryState {
  return {
    past: [],
    future: [],
    isApplying: false,
    gestureSnapshot: null,
    gestureActive: false,
  }
}

function historySnapshotsEqual(left: HistorySnapshot, right: HistorySnapshot) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveSelectedMaterialId(
  selectedObjectId: string | null,
  sceneGraph: Record<string, SceneGraphNode>,
) {
  if (!selectedObjectId) {
    return null
  }

  const selectedNode = sceneGraph[selectedObjectId]
  if (!selectedNode) {
    return null
  }

  if (selectedNode.type === 'material') {
    return selectedNode.id
  }

  const visited = new Set<string>()
  const findFirstMaterialInBranch = (nodeId: string): string | null => {
    if (visited.has(nodeId)) {
      return null
    }
    visited.add(nodeId)

    const node = sceneGraph[nodeId]
    if (!node) {
      return null
    }

    for (const childId of node.children) {
      if (sceneGraph[childId]?.type === 'material') {
        return childId
      }
    }

    for (const childId of node.children) {
      const nestedMaterialId = findFirstMaterialInBranch(childId)
      if (nestedMaterialId) {
        return nestedMaterialId
      }
    }

    return null
  }

  if (selectedNode.type === 'mesh' || selectedNode.type === 'group' || selectedNode.type === 'scene') {
    return findFirstMaterialInBranch(selectedNode.id)
  }

  return null
}

function cloneSceneGraph(sceneGraph: Record<string, SceneGraphNode>) {
  return Object.fromEntries(
    Object.entries(sceneGraph).map(([id, node]) => [id, { ...node, children: [...node.children] }]),
  )
}

function normalizeMaterialNodes(
  sceneGraph: Record<string, SceneGraphNode>,
  materials: Record<string, PbrMaterialState>,
) {
  Object.values(sceneGraph).forEach((node) => {
    if (node.type !== 'material') {
      node.children = node.children.filter((childId) => sceneGraph[childId]?.type !== 'material')
    }
  })

  Object.values(materials).forEach((material) => {
    const parentId = material.meshIds[0]
    if (!parentId || !sceneGraph[parentId]) {
      delete sceneGraph[material.id]
      return
    }

    const existingNode = sceneGraph[material.id]
    sceneGraph[material.id] = {
      id: material.id,
      parentId,
      children: [],
      type: 'material',
      label: existingNode?.label || material.name || 'Unnamed Material',
      materialUuid: existingNode?.materialUuid,
      visible: true,
    }

    if (!sceneGraph[parentId].children.includes(material.id)) {
      sceneGraph[parentId].children.push(material.id)
    }
  })
}

function buildVisibilityPatch(state: EditorState, id: string) {
  const extraLight = state.extraLights.find((light) => light.id === id)
  if (extraLight) {
    const nextVisible = !extraLight.visible
    const runtimeObject = state.runtime.objectById[id]
    if (runtimeObject) {
      runtimeObject.visible = nextVisible
    }

    return {
      extraLights: state.extraLights.map((light) =>
        light.id === id
          ? {
              ...light,
              visible: nextVisible,
            }
          : light,
      ),
      objects: {
        ...state.objects,
        [id]: {
          ...(state.objects[id] ?? {
            position: extraLight.position,
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          }),
          visible: nextVisible,
        },
      },
      sceneGraph: {
        ...state.sceneGraph,
        [id]: {
          ...(state.sceneGraph[id] ?? {
            id,
            parentId: null,
            children: [],
            type: 'light' as SceneNodeType,
            label: extraLight.label,
            objectUuid: id,
          }),
          visible: nextVisible,
        },
      },
    }
  }

  const materialState = state.materials[id]
  if (materialState) {
    const nextVisible = !materialState.meshIds.every((meshId) => state.objects[meshId]?.visible ?? true)
    const objects = { ...state.objects }
    const sceneGraph = cloneSceneGraph(state.sceneGraph)

    materialState.meshIds.forEach((meshId) => {
      const currentObject = state.objects[meshId]
      const currentNode = sceneGraph[meshId]
      if (!currentObject || !currentNode) {
        return
      }

      const runtimeObject = state.runtime.objectById[meshId]
      if (runtimeObject) {
        runtimeObject.visible = nextVisible
      }

      objects[meshId] = {
        ...currentObject,
        visible: nextVisible,
      }
      sceneGraph[meshId] = {
        ...currentNode,
        visible: nextVisible,
      }
    })

    return { objects, sceneGraph }
  }

  const currentObject = state.objects[id]
  const currentNode = state.sceneGraph[id]
  if (!currentObject || !currentNode) {
    return state
  }

  const nextVisible = !currentObject.visible
  const runtimeObject = state.runtime.objectById[id]
  if (runtimeObject) {
    runtimeObject.visible = nextVisible
  }

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
}

function buildDeletePatch(state: EditorState, id: string) {
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
  const removedMeshIds = new Set(
    Array.from(idsToRemove).filter((nodeId) => state.sceneGraph[nodeId]?.type === 'mesh'),
  )
  const sceneGraph = cloneSceneGraph(state.sceneGraph)
  const objects = { ...state.objects }
  const materials = { ...state.materials }
  const runtimeObjectById = { ...state.runtime.objectById }
  const runtimeMaterialById = { ...state.runtime.materialById }
  const isDeletingModelRoot = state.rootNodeIds.includes(id)
  const isDeletingPrimaryRoot = state.rootNodeId === id
  const selectedObjectWasRemoved =
    state.selectedObjectId === id || (state.selectedObjectId ? idsToRemove.has(state.selectedObjectId) : false)

  const rootRuntimeObject = runtimeObjectById[id]
  if (rootRuntimeObject?.parent) {
    rootRuntimeObject.parent.remove(rootRuntimeObject)
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

    if (node.type !== 'material') {
      const runtimeObject = runtimeObjectById[nodeId]
      if (runtimeObject) {
        disposeRuntimeObject(runtimeObject)
      }
    }

    delete sceneGraph[nodeId]
    delete objects[nodeId]
    delete runtimeObjectById[nodeId]
  })

  Object.values(materials).forEach((material) => {
    const remainingMeshIds = material.meshIds.filter((meshId) => !removedMeshIds.has(meshId))
    if (!remainingMeshIds.length) {
      const runtimeMaterial = runtimeMaterialById[material.id]
      if (runtimeMaterial) {
        disposeRuntimeMaterial(runtimeMaterial)
      }
      delete materials[material.id]
      delete runtimeMaterialById[material.id]
      delete sceneGraph[material.id]
      return
    }

    materials[material.id] = {
      ...material,
      meshIds: remainingMeshIds,
    }
  })

  normalizeMaterialNodes(sceneGraph, materials)

  const selectedMaterialWasRemoved =
    state.selectedMaterialId != null && !materials[state.selectedMaterialId]

  const nextRootNodeIds = isDeletingModelRoot ? state.rootNodeIds.filter((rootId) => rootId !== id) : state.rootNodeIds
  const nextLoadedModels = isDeletingModelRoot
    ? state.loadedModels.filter((model) => model.rootNodeId !== id)
    : state.loadedModels
  const nextPrimaryRootId = isDeletingPrimaryRoot ? nextRootNodeIds[nextRootNodeIds.length - 1] ?? null : state.rootNodeId
  const nextLoadedFileName = isDeletingPrimaryRoot ? nextLoadedModels[nextLoadedModels.length - 1]?.label ?? null : state.loadedFileName
  const rotateAnimationTargetWasRemoved =
    state.rotateAnimation.targetObjectId === id ||
    (state.rotateAnimation.targetObjectId ? idsToRemove.has(state.rotateAnimation.targetObjectId) : false)

  return {
    sceneGraph,
    objects,
    materials,
    rootNodeId: nextPrimaryRootId,
    rootNodeIds: nextRootNodeIds,
    loadedModels: nextLoadedModels,
    loadedFileName: nextLoadedFileName,
    assets: isDeletingPrimaryRoot
      ? {
          ...state.assets,
          model: nextLoadedFileName,
          fileSize: null,
        }
      : state.assets,
    runtime: {
      objectById: runtimeObjectById,
      materialById: runtimeMaterialById,
    },
    selectedObjectId: selectedObjectWasRemoved ? null : state.selectedObjectId,
    selectedAnchorIndex: selectedObjectWasRemoved ? null : state.selectedAnchorIndex,
    selectedMaterialId:
      selectedObjectWasRemoved || selectedMaterialWasRemoved
        ? null
        : resolveSelectedMaterialId(state.selectedObjectId, sceneGraph),
    rotateAnimation: rotateAnimationTargetWasRemoved
      ? {
          ...DEFAULT_ROTATE_ANIMATION,
          enabled: false,
        }
      : state.rotateAnimation,
  }
}

export const useEditorStore = create<EditorState>((set) => ({
  sceneGraph: {},
  rootNodeId: null,
  rootNodeIds: [],
  loadedModels: [],
  loadedFileName: null,
  isZenMode: false,
  defaultEnvUrl: DEFAULT_STANDARD_ENVIRONMENT_PRESET.url,
  backgroundEnabled: false,
  backgroundMode: 'none',
  backgroundColor: '#808080',
  backgroundPanoramaUrl: '',
  backgroundRotation: 0,
  selectedObjectId: null,
  selectedMaterialId: null,
  selectedAnchorIndex: null,
  objects: {},
  materials: {},
  materialEnvironments: {},
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
    previewMaterialEnvironmentId: null,
    previewMaterialEnvironmentRotation: 0,
  },
  lights: {
    ambient: {
      exists: true,
      color: '#ffffff',
      intensity: 0.5,
      visible: true,
    },
    rig: {
      hemisphere: 0.9,
      key: 1.8,
      fill: 0.85,
      rim: 0.65,
    },
  },
  hud: {
    orbitEnabled: true,
    fpsEnabled: false,
    performanceStatsVisible: true,
    gridVisible: true,
    axesVisible: false,
    postEffectsEnabled: false,
    postEffectsVisible: false,
    anchorModeEnabled: false,
    sidebarVisible: true,
    inspectorVisible: true,
    transformMode: 'none',
  },
  transformSettings: {
    measurementUnit: 'cm',
    translationStep: 0,
    isGridSnapping: false,
    rotationStep: 15,
    gridSize: 1,
  },
  viewer: {
    cameraMode: 'orbit',
    flightSpeed: 5,
    focalLength: DEFAULT_VIEWER_FOCAL_LENGTH,
    frameAspectPreset: DEFAULT_FRAME_ASPECT_PRESET,
    frameGuidesEnabled: false,
    exposure: 1,
    bloomIntensity: 0.95,
    bloomRadius: 0.32,
    bloomThreshold: 0.18,
    toneMappingWhitePoint: 4,
    toneMappingAdaptation: 1,
    cameraPosition: DEFAULT_VIEWER_CAMERA_POSITION,
    orbitTarget: DEFAULT_VIEWER_ORBIT_TARGET,
    resetCameraPosition: DEFAULT_VIEWER_CAMERA_POSITION,
    resetOrbitTarget: DEFAULT_VIEWER_ORBIT_TARGET,
    dofEnabled: false,
    dofVisualizerEnabled: false,
    dofFocusDistance: 5,
    dofAperture: 2,
    dofManualBlur: 1.2,
  },
  assets: {
    model: null,
    modelUrl: null,
    atlas: null,
    atlasUrl: null,
    atlasFileSize: null,
    reflections: null,
    reflectionsUrl: null,
    reflectionsFileSize: null,
    background: null,
    backgroundUrl: null,
    backgroundFileSize: null,
    fileSize: null,
  },
  extraLights: [],
  rotateAnimation: DEFAULT_ROTATE_ANIMATION,
  backgroundAudio: DEFAULT_BACKGROUND_AUDIO,
  status: 'Ready. Load a model, atlas, and optional HDRI to begin.',
  runtimeTextures: {
    atlasTexture: null,
    atlasFrameTexture: null,
    environmentMap: null,
    environmentBackground: null,
    materialEnvironmentMaps: {},
  },
  runtime: {
    objectById: {},
    materialById: {},
  },
  viewportMetrics: {
    fps: 0,
    vertices: 0,
    triangles: 0,
    drawCalls: 0,
  },
  modelRequest: null,
  atlasRequest: null,
  environmentRequest: null,
  configRequest: null,
  sceneResetNonce: 0,
  history: clearHistory(),
  setSelectedObjectId: (id) =>
    set((state) => {
      const resolvedMaterialId = resolveSelectedMaterialId(id, state.sceneGraph)

      return {
        selectedObjectId: id,
        selectedMaterialId: resolvedMaterialId ?? state.selectedMaterialId,
        selectedAnchorIndex: null,
      }
    }),
  setSelectedMaterialId: (id) =>
    set((state) => {
      if (!id) {
        return {
          selectedMaterialId: null,
          selectedAnchorIndex: null,
        }
      }

      const material = state.materials[id]
      if (!material) {
        return state
      }

      return {
        selectedMaterialId: id,
        selectedObjectId: material.meshIds[0] ?? state.selectedObjectId,
        selectedAnchorIndex: null,
      }
    }),
  setSelectedAnchorIndex: (index) => set({ selectedAnchorIndex: index }),
  setSceneGraph: (sceneGraph, objects, materials, rootNodeId, selectedObjectId, loadedModelLabel) =>
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

      const nextSelectedObjectId = selectedObjectId === undefined ? rootNodeId : selectedObjectId

      return {
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
        materials,
        rootNodeId,
        rootNodeIds: rootNodeId ? [rootNodeId] : [],
        loadedModels: rootNodeId && loadedModelLabel ? [{ rootNodeId, label: loadedModelLabel }] : [],
        loadedFileName: loadedModelLabel ?? null,
        selectedObjectId: nextSelectedObjectId,
        selectedAnchorIndex: null,
        selectedMaterialId: resolveSelectedMaterialId(nextSelectedObjectId, nextSceneGraph),
        rotateAnimation: DEFAULT_ROTATE_ANIMATION,
        history: clearHistory(),
      }
    }),
  addLoadedModel: (sceneGraph, objects, materials, rootNodeId, loadedModelLabel, selectedObjectId) =>
    set((state) => {
      const nextSceneGraph = {
        ...state.sceneGraph,
        ...sceneGraph,
      }
      const nextObjects = {
        ...state.objects,
        ...objects,
      }
      const nextMaterials = {
        ...state.materials,
        ...materials,
      }
      const nextSelectedObjectId = selectedObjectId === undefined ? rootNodeId : selectedObjectId

      return {
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
        materials: nextMaterials,
        rootNodeId,
        rootNodeIds: [...state.rootNodeIds.filter((id) => id !== rootNodeId), rootNodeId],
        loadedModels: [
          ...state.loadedModels.filter((model) => model.rootNodeId !== rootNodeId),
          { rootNodeId, label: loadedModelLabel },
        ],
        loadedFileName: loadedModelLabel,
        selectedObjectId: nextSelectedObjectId,
        selectedAnchorIndex: null,
        selectedMaterialId: resolveSelectedMaterialId(nextSelectedObjectId, nextSceneGraph),
        history: clearHistory(),
      }
    }),
  updateObjectTransform: (id, patch) =>
    set((state) =>
      withHistory(state, {
        objects: {
          ...state.objects,
          [id]: {
            ...state.objects[id],
            ...patch,
          },
        },
      }),
    ),
  updateMaterial: (id, patch) =>
    set((state) =>
      withHistory(state, {
        materials: {
          ...state.materials,
          [id]: {
            ...state.materials[id],
            ...patch,
          },
        },
      }),
    ),
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

      return withHistory(state, {
        materials: {
          ...state.materials,
          [materialId]: {
            ...current,
            effect: nextEffect,
          },
        },
      })
    }),
  toggleObjectVisibility: (id) =>
    set((state) => buildVisibilityPatch(state, id)),
  toggleVisibility: (id) =>
    set((state) => buildVisibilityPatch(state, id)),
  removeSceneNode: (id) =>
    set((state) => ({
      ...buildDeletePatch(state, id),
      history: clearHistory(),
    })),
  deleteObject: (id) =>
    set((state) => {
      const materialState = state.materials[id]
      if (!materialState) {
        return {
          ...buildDeletePatch(state, id),
          history: clearHistory(),
        }
      }

      const nextState = materialState.meshIds.reduce<EditorState | Partial<EditorState>>((nextState, meshId) => {
        const resolvedState = 'sceneGraph' in nextState ? (nextState as EditorState) : { ...state, ...nextState }
        return buildDeletePatch(resolvedState as EditorState, meshId)
      }, state)

      return {
        ...nextState,
        history: clearHistory(),
      }
    }),
  resetMaterialToDefault: (id) =>
    set((state) => {
      const material = state.materials[id]
      const runtimeMaterial = state.runtime.materialById[id] as (THREE.MeshStandardMaterial & { clearcoat?: number }) | undefined
      if (!material) {
        return state
      }

      if (runtimeMaterial) {
        disposeCustomRuntimeTextures(runtimeMaterial)
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

      return withHistory(state, {
        materials: {
          ...state.materials,
          [id]: {
            ...material,
            environmentOverrideId: null,
            environmentRotation: 0,
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
            textureSlots: createEmptyMaterialTextureSlots(),
          },
        },
      })
    }),
  toggleMaterialSystemState: (id) =>
    set((state) => {
      const material = state.materials[id]
      if (!material) {
        return state
      }

      return withHistory(state, {
        materials: {
          ...state.materials,
          [id]: {
            ...material,
            useSystemMaterial: !material.useSystemMaterial,
          },
        },
      })
    }),
  resetMaterial: (id) =>
    set((state) => {
      const material = state.materials[id]
      const runtimeMaterial = state.runtime.materialById[id] as (THREE.MeshStandardMaterial & { clearcoat?: number }) | undefined
      if (!material) {
        return state
      }

      if (runtimeMaterial) {
        disposeCustomRuntimeTextures(runtimeMaterial)
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

      return withHistory(state, {
        materials: {
          ...state.materials,
          [id]: {
            ...material,
            environmentOverrideId: null,
            environmentRotation: 0,
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
            textureSlots: createEmptyMaterialTextureSlots(),
          },
        },
      })
    }),
  setEnvironment: (patch) =>
    set((state) =>
      withHistory(
        state,
        {
          environment: {
            ...state.environment,
            ...patch,
          },
        },
        Object.keys(patch).some(
          (key) =>
            !['previewReflections', 'previewMaterialEnvironmentId', 'previewMaterialEnvironmentRotation'].includes(key),
        ),
      ),
    ),
  removeEnvironment: () =>
    set((state) => {
      state.runtimeTextures.environmentMap?.dispose()
      if (
        state.runtimeTextures.environmentBackground &&
        state.runtimeTextures.environmentBackground !== state.runtimeTextures.environmentMap
      ) {
        state.runtimeTextures.environmentBackground.dispose()
      }
      Object.values(state.runtimeTextures.materialEnvironmentMaps).forEach((texture) => texture.dispose())

      return {
        environment: {
          ...state.environment,
          source: null,
          customHdriUrl: null,
          kind: 'default',
          isEnvironmentEnabled: false,
          background: 'none',
          backgroundVisible: false,
          previewReflections: false,
          previewMaterialEnvironmentId: null,
          previewMaterialEnvironmentRotation: 0,
        },
        backgroundMode: 'none',
        backgroundPanoramaUrl: '',
        assets: {
          ...state.assets,
          reflections: null,
        },
        runtimeTextures: {
          ...state.runtimeTextures,
          environmentMap: null,
          environmentBackground: null,
        },
        selectedObjectId: state.selectedObjectId === 'environment:system' ? null : state.selectedObjectId,
        selectedAnchorIndex: state.selectedObjectId === 'environment:system' ? null : state.selectedAnchorIndex,
        selectedMaterialId:
          state.selectedObjectId === 'environment:system'
            ? null
            : resolveSelectedMaterialId(state.selectedObjectId, state.sceneGraph),
        history: clearHistory(),
      }
    }),
  setLights: (patch) =>
    set((state) =>
      withHistory(state, {
        lights: {
          ambient: {
            ...state.lights.ambient,
            ...(patch.ambient ?? {}),
          },
          rig: {
            ...state.lights.rig,
            ...(patch.rig ?? {}),
          },
        },
      }),
    ),
  removeAmbientLight: () =>
    set((state) => ({
      lights: {
        ambient: {
          ...state.lights.ambient,
          exists: false,
          visible: false,
        },
        rig: state.lights.rig,
      },
      selectedObjectId: state.selectedObjectId === 'light:ambient:system' ? null : state.selectedObjectId,
      selectedAnchorIndex: state.selectedObjectId === 'light:ambient:system' ? null : state.selectedAnchorIndex,
      selectedMaterialId:
        state.selectedObjectId === 'light:ambient:system'
          ? null
          : resolveSelectedMaterialId(state.selectedObjectId, state.sceneGraph),
      history: clearHistory(),
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
        rig: state.lights.rig,
      },
      selectedObjectId: 'light:ambient:system',
      selectedAnchorIndex: null,
      selectedMaterialId: null,
      history: clearHistory(),
    })),
  setZenMode: (value) => set({ isZenMode: value }),
  toggleZenMode: () =>
    set((state) => ({
      isZenMode: !state.isZenMode,
    })),
  setBackgroundEnabled: (value) => set({ backgroundEnabled: value }),
  setBackgroundMode: (value) =>
    set((state) =>
      withHistory(state, {
        backgroundMode: value,
      }),
    ),
  setBackgroundColor: (value) =>
    set((state) =>
      withHistory(state, {
        backgroundColor: value,
        environment: {
          ...state.environment,
          backgroundColor: value,
        },
      }),
    ),
  setBackgroundPanoramaUrl: (value) => set({ backgroundPanoramaUrl: value }),
  setBackgroundRotation: (value) =>
    set((state) =>
      withHistory(state, {
        backgroundRotation: value,
        environment: {
          ...state.environment,
          backgroundRotation: value,
        },
      }),
    ),
  setHud: (patch) =>
    set((state) => ({
      hud: {
        ...state.hud,
        ...patch,
      },
    })),
  setTransformSettings: (patch) =>
    set((state) =>
      withHistory(state, {
        transformSettings: {
          ...state.transformSettings,
          ...patch,
        },
      }),
    ),
  setViewer: (patch) =>
    set((state) =>
      withHistory(
        state,
        {
          viewer: {
            ...state.viewer,
            ...patch,
          },
        },
        Object.keys(patch).some(
          (key) =>
            !['cameraPosition', 'orbitTarget', 'resetCameraPosition', 'resetOrbitTarget', 'cameraMode'].includes(key),
        ),
      ),
    ),
  setAssets: (patch) =>
    set((state) => ({
      assets: {
        ...state.assets,
        ...patch,
      },
      loadedFileName: patch.model === undefined ? state.loadedFileName : patch.model,
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
        selectedAnchorIndex: null,
        selectedMaterialId: null,
        history: clearHistory(),
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
        selectedAnchorIndex: state.selectedObjectId === targetId ? null : state.selectedAnchorIndex,
        selectedMaterialId:
          state.selectedObjectId === targetId
            ? null
            : resolveSelectedMaterialId(state.selectedObjectId, sceneGraph),
        rotateAnimation:
          state.rotateAnimation.targetObjectId === targetId
            ? {
                ...DEFAULT_ROTATE_ANIMATION,
                enabled: false,
              }
            : state.rotateAnimation,
        history: clearHistory(),
      }
    }),
  updateExtraLight: (id, patch) =>
    set((state) => {
      const light = state.extraLights.find((entry) => entry.id === id)
      if (!light) {
        return state
      }

      const nextLight = { ...light, ...patch }
      return withHistory(state, {
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
      })
    }),
  replaceExtraLights: (lights) =>
    set((state) => {
      const nextSceneGraph = { ...state.sceneGraph }
      const nextObjects = { ...state.objects }
      const existingLightIds = new Set(state.extraLights.map((light) => light.id))
      const nextLightIds = new Set(lights.map((light) => light.id))

      existingLightIds.forEach((lightId) => {
        if (nextLightIds.has(lightId)) {
          return
        }

        delete nextSceneGraph[lightId]
        delete nextObjects[lightId]
      })

      lights.forEach((light) => {
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
        extraLights: lights,
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
      }
    }),
  addRotateAnimation: (targetObjectId) =>
    set(() => ({
      rotateAnimation: {
        ...DEFAULT_ROTATE_ANIMATION,
        isAdded: true,
        enabled: true,
        targetObjectId,
      },
    })),
  updateRotateAnimation: (patch) =>
    set((state) => ({
      rotateAnimation: {
        ...state.rotateAnimation,
        ...patch,
      },
    })),
  removeRotateAnimation: () =>
    set(() => ({
      rotateAnimation: {
        ...DEFAULT_ROTATE_ANIMATION,
        enabled: false,
      },
    })),
  setBackgroundAudio: (patch) =>
    set((state) =>
      withHistory(
        state,
        {
          backgroundAudio: {
            ...state.backgroundAudio,
            ...patch,
          },
        },
        Object.keys(patch).some(
          (key) => !['previewEnabled', 'previewPlaying', 'previewCurrentTime', 'previewDuration'].includes(key),
        ),
      ),
    ),
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
  upsertMaterialEnvironment: (entry, texture) =>
    set((state) => {
      const previousTexture = state.runtimeTextures.materialEnvironmentMaps[entry.id]
      if (previousTexture && previousTexture !== texture) {
        previousTexture.dispose()
      }

      return {
        materialEnvironments: {
          ...state.materialEnvironments,
          [entry.id]: entry,
        },
        runtimeTextures: {
          ...state.runtimeTextures,
          materialEnvironmentMaps: {
            ...state.runtimeTextures.materialEnvironmentMaps,
            [entry.id]: texture,
          },
        },
      }
    }),
  removeMaterialEnvironment: (id) =>
    set((state) => {
      const texture = state.runtimeTextures.materialEnvironmentMaps[id]
      texture?.dispose()

      const materialEnvironments = { ...state.materialEnvironments }
      delete materialEnvironments[id]

      const materialEnvironmentMaps = { ...state.runtimeTextures.materialEnvironmentMaps }
      delete materialEnvironmentMaps[id]

      const materials = Object.fromEntries(
        Object.entries(state.materials).map(([materialId, material]) => [
          materialId,
          material.environmentOverrideId === id
            ? {
                ...material,
                environmentOverrideId: null,
                environmentRotation: 0,
              }
            : material,
        ]),
      )

      return {
        materials,
        materialEnvironments,
        environment: {
          ...state.environment,
          previewMaterialEnvironmentId:
            state.environment.previewMaterialEnvironmentId === id ? null : state.environment.previewMaterialEnvironmentId,
        },
        runtimeTextures: {
          ...state.runtimeTextures,
          materialEnvironmentMaps,
        },
      }
    }),
  setViewportMetrics: (patch) =>
    set((state) => ({
      viewportMetrics: {
        ...state.viewportMetrics,
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
        rootNodeIds: [],
        loadedModels: [],
        loadedFileName: null,
        isZenMode: false,
        defaultEnvUrl: state.defaultEnvUrl,
        backgroundEnabled: false,
        backgroundMode: 'none',
        backgroundColor: '#808080',
        backgroundPanoramaUrl: '',
        backgroundRotation: 0,
        selectedObjectId: null,
        selectedMaterialId: null,
        selectedAnchorIndex: null,
        objects: {},
        materials: {},
        materialEnvironments: {},
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
          previewMaterialEnvironmentId: null,
          previewMaterialEnvironmentRotation: 0,
        },
        lights: {
          ambient: {
            exists: true,
            color: '#ffffff',
            intensity: 0.5,
            visible: true,
          },
          rig: {
            hemisphere: 0.9,
            key: 1.8,
            fill: 0.85,
            rim: 0.65,
          },
        },
        viewer: {
          cameraMode: 'orbit',
          flightSpeed: 5,
          focalLength: DEFAULT_VIEWER_FOCAL_LENGTH,
          frameAspectPreset: DEFAULT_FRAME_ASPECT_PRESET,
          frameGuidesEnabled: false,
          exposure: 1,
          bloomIntensity: 0.95,
          bloomRadius: 0.32,
          bloomThreshold: 0.18,
          toneMappingWhitePoint: 4,
          toneMappingAdaptation: 1,
          cameraPosition: DEFAULT_VIEWER_CAMERA_POSITION,
          orbitTarget: DEFAULT_VIEWER_ORBIT_TARGET,
          resetCameraPosition: DEFAULT_VIEWER_CAMERA_POSITION,
          resetOrbitTarget: DEFAULT_VIEWER_ORBIT_TARGET,
          dofEnabled: false,
          dofVisualizerEnabled: false,
          dofFocusDistance: 5,
          dofAperture: 2,
          dofManualBlur: 1.2,
        },
        hud: {
          orbitEnabled: true,
          fpsEnabled: false,
          performanceStatsVisible: true,
          gridVisible: true,
          axesVisible: false,
          postEffectsEnabled: false,
          postEffectsVisible: false,
          anchorModeEnabled: false,
          sidebarVisible: true,
          inspectorVisible: true,
          transformMode: 'none',
        },
        transformSettings: {
          measurementUnit: 'cm',
          translationStep: 0,
          isGridSnapping: false,
          rotationStep: 15,
          gridSize: 1,
        },
        assets: {
          model: null,
          modelUrl: null,
          atlas: null,
          atlasUrl: null,
          atlasFileSize: null,
          reflections: null,
          reflectionsUrl: null,
          reflectionsFileSize: null,
          background: null,
          backgroundUrl: null,
          backgroundFileSize: null,
          fileSize: null,
        },
        extraLights: [],
        rotateAnimation: DEFAULT_ROTATE_ANIMATION,
        backgroundAudio: DEFAULT_BACKGROUND_AUDIO,
        runtimeTextures: {
          atlasTexture: null,
          atlasFrameTexture: null,
          environmentMap: null,
          environmentBackground: null,
          materialEnvironmentMaps: {},
        },
        runtime: {
          objectById: {},
          materialById: {},
        },
        viewportMetrics: {
          fps: 0,
          vertices: 0,
          triangles: 0,
          drawCalls: 0,
        },
        modelRequest: null,
        atlasRequest: null,
        environmentRequest: null,
        configRequest: null,
        sceneResetNonce: state.sceneResetNonce + 1,
        status: 'Scene reset.',
        history: clearHistory(),
      }
    }),
  beginHistoryGesture: () =>
    set((state) => {
      if (state.history.isApplying || state.history.gestureActive) {
        return state
      }

      return {
        history: {
          ...state.history,
          gestureSnapshot: createHistorySnapshot(state),
          gestureActive: true,
        },
      }
    }),
  endHistoryGesture: () =>
    set((state) => {
      if (state.history.isApplying || !state.history.gestureActive || !state.history.gestureSnapshot) {
        return state
      }

      const currentSnapshot = createHistorySnapshot(state)
      if (historySnapshotsEqual(state.history.gestureSnapshot, currentSnapshot)) {
        return {
          history: {
            ...state.history,
            gestureSnapshot: null,
            gestureActive: false,
          },
        }
      }

      return {
        history: {
          past: [...state.history.past, state.history.gestureSnapshot].slice(-HISTORY_LIMIT),
          future: [],
          isApplying: false,
          gestureSnapshot: null,
          gestureActive: false,
        },
      }
    }),
  undoHistory: () =>
    set((state) => {
      if (!state.history.past.length) {
        return state
      }

      const previous = state.history.past[state.history.past.length - 1]
      const current = createHistorySnapshot(state)

      return {
        sceneGraph: cloneSceneGraphState(previous.sceneGraph),
        objects: cloneObjectsState(previous.objects),
        materials: cloneMaterialsState(previous.materials),
        environment: { ...previous.environment },
        lights: {
          ambient: { ...previous.lights.ambient },
          rig: { ...previous.lights.rig },
        },
        transformSettings: { ...previous.transformSettings },
        viewer: cloneViewerState(previous.viewer),
        backgroundMode: previous.backgroundMode,
        backgroundColor: previous.backgroundColor,
        backgroundRotation: previous.backgroundRotation,
        extraLights: cloneExtraLightsState(previous.extraLights),
        rotateAnimation: cloneRotateAnimationState(previous.rotateAnimation),
        backgroundAudio: cloneBackgroundAudioState(previous.backgroundAudio),
        history: {
          past: state.history.past.slice(0, -1),
          future: [current, ...state.history.future].slice(0, HISTORY_LIMIT),
          isApplying: false,
          gestureSnapshot: null,
          gestureActive: false,
        },
      }
    }),
  redoHistory: () =>
    set((state) => {
      if (!state.history.future.length) {
        return state
      }

      const next = state.history.future[0]
      const current = createHistorySnapshot(state)

      return {
        sceneGraph: cloneSceneGraphState(next.sceneGraph),
        objects: cloneObjectsState(next.objects),
        materials: cloneMaterialsState(next.materials),
        environment: { ...next.environment },
        lights: {
          ambient: { ...next.lights.ambient },
          rig: { ...next.lights.rig },
        },
        transformSettings: { ...next.transformSettings },
        viewer: cloneViewerState(next.viewer),
        backgroundMode: next.backgroundMode,
        backgroundColor: next.backgroundColor,
        backgroundRotation: next.backgroundRotation,
        extraLights: cloneExtraLightsState(next.extraLights),
        rotateAnimation: cloneRotateAnimationState(next.rotateAnimation),
        backgroundAudio: cloneBackgroundAudioState(next.backgroundAudio),
        history: {
          past: [...state.history.past, current].slice(-HISTORY_LIMIT),
          future: state.history.future.slice(1),
          isApplying: false,
          gestureSnapshot: null,
          gestureActive: false,
        },
      }
    }),
}))
