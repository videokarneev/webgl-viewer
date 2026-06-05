import { create } from 'zustand'
import * as THREE from 'three'
import { DEFAULT_STANDARD_ENVIRONMENT_PRESET } from '../features/environment/standardEnvironmentPresets'
import { clampGodRaysSideCount } from '../components/viewport/effects/godRaysShared'

export type SceneNodeType = 'scene' | 'group' | 'mesh' | 'light' | 'camera' | 'material' | 'effect'
export type AtlasTargetSlot = 'emissive' | 'baseColor'
export type AtlasFrameOrder = 'row' | 'column'
export type AtlasUvChannel = 'auto' | 'normal' | 'baseColor' | 'emissive' | 'uv' | 'uv2'
export type AtlasWrapMode = 'repeat' | 'clamp'
export type TransformMode = 'translate' | 'rotate' | 'scale' | 'none'
export type MeasurementUnit = 'cm' | 'm'
export type BackgroundMode = 'none' | 'color' | 'background' | 'hdri'
export type MaterialTextureSlot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap' | 'alphaMap' | 'bumpMap' | 'displacementMap' | 'specularMap'
export type MaterialTextureSource = 'original' | 'custom'
export type RotateAnimationPivot = 'pivot' | 'gizmo'
export type RotateAnimationAxis = 'x' | 'y' | 'z'
export type FrameAspectPreset = 'auto' | '1:1' | '3:2' | '2:3' | '16:9' | '21:9' | '9:16'
export type ResponsiveFramePresetKind = 'landscape' | 'portrait' | 'square'
export type PhoneScreenBoxBindingMode = 'fixed' | 'viewport' | 'responsivePreset' | 'phonePortrait'
export type PhoneScreenBoxDepthScaleMode = 'fixed' | 'shortEdge' | 'longEdge'
export type PhoneScreenBoxInputMode = 'none' | 'mouse' | 'gyro' | 'mouse+gyro'
export type PhoneScreenBoxContentFramingMode = 'manual' | 'fitScene'
export type PhoneScreenBoxResponsivePresetKind = ResponsiveFramePresetKind | 'auto'
export type GodRaysDirectionSpace = 'local' | 'global'
export type StencilContourMode = 'silhouette'

const GOD_RAYS_DIRECTION_ARROW_PREFIX = 'god-rays-direction:'
const GOD_RAYS_DIRECTION_ARROW_AXIS = new THREE.Vector3(0, 1, 0)
const STENCIL_VOLUME_END_HANDLE_PREFIX = 'stencil-volume-end:'

export function getGodRaysDirectionArrowId(effectId: string) {
  return `${GOD_RAYS_DIRECTION_ARROW_PREFIX}${effectId}`
}

export function getStencilVolumeEndHandleId(effectId: string) {
  return `${STENCIL_VOLUME_END_HANDLE_PREFIX}${effectId}`
}

export function getPhoneScreenBoxMaterialId(boxId: string) {
  return `material:phone-box:${boxId}`
}

export function getGodRaysDirectionQuaternion(direction: [number, number, number]) {
  const target = new THREE.Vector3(...direction)
  if (target.lengthSq() <= 0.000001) {
    target.copy(GOD_RAYS_DIRECTION_ARROW_AXIS)
  } else {
    target.normalize()
  }
  return new THREE.Quaternion().setFromUnitVectors(GOD_RAYS_DIRECTION_ARROW_AXIS, target)
}

export function getGodRaysDirectionFromObject(object: THREE.Object3D): [number, number, number] {
  const direction = GOD_RAYS_DIRECTION_ARROW_AXIS.clone().applyQuaternion(object.quaternion).normalize()
  return [direction.x, direction.y, direction.z]
}

export function normalizeGodRaysDirection(direction: [number, number, number]): [number, number, number] {
  const normalized = new THREE.Vector3(...direction)
  if (normalized.lengthSq() <= 0.000001) {
    return [0, 1, 0]
  }

  normalized.normalize()
  return [normalized.x, normalized.y, normalized.z]
}

export function getGodRaysDirectionWorldFromLocal(
  localDirection: [number, number, number],
  object: THREE.Object3D,
): [number, number, number] {
  const worldQuaternion = new THREE.Quaternion()
  object.updateWorldMatrix(true, false)
  object.getWorldQuaternion(worldQuaternion)

  const worldDirection = new THREE.Vector3(...normalizeGodRaysDirection(localDirection)).applyQuaternion(worldQuaternion)
  return [worldDirection.x, worldDirection.y, worldDirection.z]
}

export function getGodRaysDirectionLocalFromWorld(
  worldDirection: [number, number, number],
  object: THREE.Object3D,
): [number, number, number] {
  const worldQuaternion = new THREE.Quaternion()
  object.updateWorldMatrix(true, false)
  object.getWorldQuaternion(worldQuaternion)

  const localDirection = new THREE.Vector3(...normalizeGodRaysDirection(worldDirection)).applyQuaternion(
    worldQuaternion.invert(),
  )
  return [localDirection.x, localDirection.y, localDirection.z]
}

export function getGodRaysDefaultDirection(): [number, number, number] {
  return [0, 1, 0]
}

function clampGodRaysDustStrengthValue(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

export const GOD_RAYS_DUST_SPEED_MAX = 0.02

export function getGodRaysDustSpeedFromSliderValue(value: number) {
  const normalized = Math.min(Math.max(value, 0), 100) / 100
  const curved = 1 - (1 - normalized) * (1 - normalized)
  return curved * GOD_RAYS_DUST_SPEED_MAX
}

export function getGodRaysDustSpeedSliderValue(speed: number) {
  const normalized = Math.min(Math.max(speed, 0), GOD_RAYS_DUST_SPEED_MAX) / GOD_RAYS_DUST_SPEED_MAX
  const slider = 1 - Math.sqrt(1 - normalized)
  return slider * 100
}

export function getGodRaysDustStrengthValue(
  strength?: number | null,
) {
  if (typeof strength === 'number' && Number.isFinite(strength)) {
    return clampGodRaysDustStrengthValue(strength)
  }
  return clampGodRaysDustStrengthValue(0.54)
}

export function getGodRaysEffectiveLocalDirection(
  entry: Pick<GodRaysBoxState, 'dustDirectionMode' | 'dustDirectionLocal'>,
  object: THREE.Object3D,
  sharedGlobalDirection?: [number, number, number],
): [number, number, number] {
  if (entry.dustDirectionMode === 'global') {
    return getGodRaysDirectionLocalFromWorld(sharedGlobalDirection ?? getGodRaysDefaultDirection(), object)
  }

  return normalizeGodRaysDirection(entry.dustDirectionLocal)
}

export function getGodRaysArrowLocalDirection(
  entry: Pick<GodRaysBoxState, 'dustDirectionMode' | 'dustDirectionLocal'>,
  object: THREE.Object3D,
  sharedGlobalDirection?: [number, number, number],
): [number, number, number] {
  return getGodRaysEffectiveLocalDirection(entry, object, sharedGlobalDirection)
}

export function getGodRaysArrowWorldDirection(
  entry: Pick<GodRaysBoxState, 'dustDirectionMode' | 'dustDirectionLocal'>,
  object: THREE.Object3D,
  sharedGlobalDirection?: [number, number, number],
): [number, number, number] {
  if (entry.dustDirectionMode === 'global') {
    return normalizeGodRaysDirection(sharedGlobalDirection ?? getGodRaysDefaultDirection())
  }

  return getGodRaysDirectionWorldFromLocal(entry.dustDirectionLocal, object)
}

export function getGodRaysStoredDirectionFromArrowObject(
  arrowObject: THREE.Object3D,
  mode: GodRaysDirectionSpace,
  godRaysObject: THREE.Object3D,
): [number, number, number] {
  const worldDirection = getGodRaysDirectionFromObject(arrowObject)
  if (mode === 'global') {
    return normalizeGodRaysDirection(worldDirection)
  }

  return getGodRaysDirectionLocalFromWorld(worldDirection, godRaysObject)
}

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
export const DEFAULT_FRAME_ASPECT_PRESET: FrameAspectPreset = 'auto'

export interface ResponsiveFramePresetState {
  frameAspectPreset: FrameAspectPreset
  cameraPosition: [number, number, number]
  orbitTarget: [number, number, number]
  focalLength: number
}

export interface ResponsiveFrameState {
  landscape: ResponsiveFramePresetState
  portrait: ResponsiveFramePresetState
  square: ResponsiveFramePresetState
}

function createDefaultResponsiveFramePreset(frameAspectPreset: FrameAspectPreset): ResponsiveFramePresetState {
  return {
    frameAspectPreset,
    cameraPosition: [...DEFAULT_VIEWER_CAMERA_POSITION],
    orbitTarget: [...DEFAULT_VIEWER_ORBIT_TARGET],
    focalLength: DEFAULT_VIEWER_FOCAL_LENGTH,
  }
}

export function createDefaultResponsiveFrameState(): ResponsiveFrameState {
  return {
    landscape: createDefaultResponsiveFramePreset('16:9'),
    portrait: createDefaultResponsiveFramePreset('9:16'),
    square: createDefaultResponsiveFramePreset('1:1'),
  }
}

export function createDefaultPhoneScreenBoxGeometryState(): PhoneScreenBoxGeometryState {
  return {
    baseLongEdge: 0.16,
    aspectPreset: '9:16',
    depth: 0.05,
    wallThickness: 0.004,
    openTop: true,
  }
}

export function createDefaultPhoneScreenBoxScreenBindingState(): PhoneScreenBoxScreenBindingState {
  return {
    mode: 'responsivePreset',
    responsivePresetKind: 'auto',
    margin: 0,
    depthScaleMode: 'fixed',
    lockToFrame: true,
  }
}

export function createDefaultPhoneScreenBoxContentState(): PhoneScreenBoxContentState {
  return {
    anchor: [0, -0.025, 0],
    framingMode: 'manual',
    attachedObjectIds: [],
  }
}

export function createDefaultPhoneScreenBoxInteractionState(): PhoneScreenBoxInteractionState {
  return {
    enabled: true,
    inputMode: 'mouse+gyro',
    maxOffsetX: 0.012,
    maxOffsetY: 0.018,
    smoothing: 0.14,
  }
}

function createLegacyPhoneScreenBoxInteractionState(): PhoneScreenBoxInteractionState {
  return {
    enabled: false,
    inputMode: 'mouse',
    maxOffsetX: 0.012,
    maxOffsetY: 0.018,
    smoothing: 0.14,
  }
}

function createLegacyPhoneScreenBoxGeometryState(): PhoneScreenBoxGeometryState {
  return {
    baseLongEdge: 0.16,
    aspectPreset: '16:9',
    depth: 0.05,
    wallThickness: 0.004,
    openTop: true,
  }
}

function createLegacyPhoneScreenBoxScreenBindingState(): PhoneScreenBoxScreenBindingState {
  return {
    mode: 'fixed',
    responsivePresetKind: 'auto',
    margin: 0,
    depthScaleMode: 'fixed',
    lockToFrame: false,
  }
}

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
  gridX: 1,
  gridY: 1,
  fps: 12,
  frameCount: 1,
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
  activeGodRaysDirectionBoxId: string | null
  activeStencilVolumeEndHandleId: string | null
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

function cloneResponsiveFramePresetState(entry: ResponsiveFramePresetState): ResponsiveFramePresetState {
  return {
    ...entry,
    cameraPosition: [...entry.cameraPosition],
    orbitTarget: [...entry.orbitTarget],
  }
}

function cloneResponsiveFrameState(responsiveFrame: ResponsiveFrameState): ResponsiveFrameState {
  return {
    landscape: cloneResponsiveFramePresetState(responsiveFrame.landscape),
    portrait: cloneResponsiveFramePresetState(responsiveFrame.portrait),
    square: cloneResponsiveFramePresetState(responsiveFrame.square),
  }
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

export interface PhoneScreenBoxGeometryState {
  baseLongEdge: number
  aspectPreset: FrameAspectPreset
  depth: number
  wallThickness: number
  openTop: boolean
}

export interface PhoneScreenBoxScreenBindingState {
  mode: PhoneScreenBoxBindingMode
  responsivePresetKind: PhoneScreenBoxResponsivePresetKind
  margin: number
  depthScaleMode: PhoneScreenBoxDepthScaleMode
  lockToFrame: boolean
}

export interface PhoneScreenBoxContentState {
  anchor: [number, number, number]
  framingMode: PhoneScreenBoxContentFramingMode
  attachedObjectIds: string[]
}

export interface PhoneScreenBoxInteractionState {
  enabled: boolean
  inputMode: PhoneScreenBoxInputMode
  maxOffsetX: number
  maxOffsetY: number
  smoothing: number
}

export interface PhoneScreenBoxState {
  id: string
  materialId: string
  geometry: PhoneScreenBoxGeometryState
  screenBinding: PhoneScreenBoxScreenBindingState
  content: PhoneScreenBoxContentState
  interaction: PhoneScreenBoxInteractionState
}

export interface PhoneScreenBoxPatch {
  geometry?: Partial<PhoneScreenBoxGeometryState>
  screenBinding?: Partial<PhoneScreenBoxScreenBindingState>
  content?: Partial<PhoneScreenBoxContentState>
  interaction?: Partial<PhoneScreenBoxInteractionState>
}

export type PhoneScreenBoxEntryInput = Pick<PhoneScreenBoxState, 'id' | 'materialId'> & Partial<PhoneScreenBoxState>

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
  materialEffectPreviewFrameById: Record<string, number>
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
  startProgress: number
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
  startProgress: 0,
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

export type GodRaysSourceFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
export type GodRaysQuality = 'low' | 'medium' | 'high'
export type GodRaysNoiseMotionMode = 'off' | 'soft'

export interface GodRaysGlobalNoiseState {
  rayNoiseAmount: number
  rayNoiseScale: number
  rayGrain: number
  rayNoiseMotionMode: GodRaysNoiseMotionMode
  rayNoiseMotionSpeed: number
  rayQuality: GodRaysQuality
}

export interface GodRaysBoxState {
  id: string
  sideCount: number
  bottomRadius: number
  topRadius: number
  linkTopRadius: boolean
  helperVisible: boolean
  topDome: number
  sourceFace: GodRaysSourceFace
  raysEnabled: boolean
  rayColor: string
  rayIntensity: number
  rayFalloff: number
  rayEdgeFade: number
  rayNoiseAmount: number
  rayNoiseScale: number
  rayGrain: number
  rayNoiseMotionMode: GodRaysNoiseMotionMode
  rayNoiseMotionSpeed: number
  rayQuality: GodRaysQuality
  rayUseGlobalNoiseSettings: boolean
  dustEnabled: boolean
  dustCount: number
  dustSizeMin: number
  dustSizeMax: number
  dustSpeed: number
  dustColorLinked: boolean
  dustColor: string
  dustStrength: number
  dustDirectionMode: GodRaysDirectionSpace
  dustDirectionLocal: [number, number, number]
  dustDrift: number
  dustEdgeFade: number
}

export interface StencilVolumeState {
  id: string
  sourceWidth: number
  sourceHeight: number
  maskAssetLabel: string | null
  maskAssetUrl: string | null
  bakedContourShapes?: Array<{
    outline: [number, number][]
    holes: [number, number][][]
  }> | null
  bakedPrimitiveShapeGroups?: Array<
    Array<{
      outline: [number, number][]
      holes: [number, number][][]
    }>
  > | null
  bakedPreparedPrimitives?: Array<{
    id: string
    shapes: Array<{
      outline: [number, number][]
      holes: [number, number][][]
    }>
    sourceCenter: [number, number, number]
    sourceSize: [number, number]
  }> | null
  projectionVisible: boolean
  maskInvert: boolean
  contourDetail: number
  contourSimplify: number
  contourSmooth: number
  contourMinArea: number
  contourMode: StencilContourMode
  contourShowInnerLoops: boolean
  contourDebugVisible: boolean
  extrudeEnd: [number, number, number]
  endRotationX: number
  endRotationY: number
  endScaleX: number
  endScaleY: number
  volumeColor: string
  volumeIntensity: number
  volumeFalloff: number
  rayEdgeFade: number
  rayFillQuality: number
  rayNoiseAmount: number
  rayNoiseScale: number
  rayGrain: number
  rayNoiseMotionMode: GodRaysNoiseMotionMode
  rayNoiseMotionSpeed: number
  rayQuality: GodRaysQuality
  rayUseGlobalNoiseSettings: boolean
  roundedTop: number
  dustEnabled: boolean
  dustCount: number
  dustSizeMin: number
  dustSizeMax: number
  dustSpeed: number
  dustColorLinked: boolean
  dustColor: string
  dustDirectionMode: GodRaysDirectionSpace
  dustDirectionLocal: [number, number, number]
  dustDrift: number
  dustStrength: number
  dustEdgeFade: number
  helperVisible: boolean
}

export const DEFAULT_GOD_RAYS_BOX: Omit<GodRaysBoxState, 'id'> = {
  sideCount: 4,
  bottomRadius: 0.7071067811865476,
  topRadius: 0.7071067811865476,
  linkTopRadius: true,
  helperVisible: true,
  topDome: 10,
  sourceFace: '-y',
  raysEnabled: true,
  rayColor: '#fff4cf',
  rayIntensity: 1.2,
  rayFalloff: 1.4,
  rayEdgeFade: 0.22,
  rayNoiseAmount: 0.6,
  rayNoiseScale: 5,
  rayGrain: 0.18,
  rayNoiseMotionMode: 'off',
  rayNoiseMotionSpeed: 1.6,
  rayQuality: 'low',
  rayUseGlobalNoiseSettings: true,
  dustEnabled: true,
  dustCount: 180,
  dustSizeMin: 0.015,
  dustSizeMax: 0.05,
  dustSpeed: 0.01,
  dustColorLinked: true,
  dustColor: '#fff4cf',
  dustStrength: 0.54,
  dustDirectionMode: 'global',
  dustDirectionLocal: [0, 1, 0],
  dustDrift: 0.18,
  dustEdgeFade: 0.16,
}

export const DEFAULT_STENCIL_VOLUME: Omit<StencilVolumeState, 'id'> = {
  sourceWidth: 2,
  sourceHeight: 2,
  maskAssetLabel: null,
  maskAssetUrl: null,
  bakedContourShapes: null,
  bakedPrimitiveShapeGroups: null,
  bakedPreparedPrimitives: null,
  projectionVisible: false,
  maskInvert: false,
  contourDetail: 0.5,
  contourSimplify: 0.18,
  contourSmooth: 0.35,
  contourMinArea: 0.02,
  contourMode: 'silhouette',
  contourShowInnerLoops: true,
  contourDebugVisible: false,
  extrudeEnd: [0, 0, 2],
  endRotationX: 0,
  endRotationY: 0,
  endScaleX: 1,
  endScaleY: 1,
  volumeColor: '#fff4cf',
  volumeIntensity: 1.2,
  volumeFalloff: 1.4,
  rayEdgeFade: DEFAULT_GOD_RAYS_BOX.rayEdgeFade,
  rayFillQuality: 0,
  rayNoiseAmount: DEFAULT_GOD_RAYS_BOX.rayNoiseAmount,
  rayNoiseScale: DEFAULT_GOD_RAYS_BOX.rayNoiseScale,
  rayGrain: DEFAULT_GOD_RAYS_BOX.rayGrain,
  rayNoiseMotionMode: DEFAULT_GOD_RAYS_BOX.rayNoiseMotionMode,
  rayNoiseMotionSpeed: DEFAULT_GOD_RAYS_BOX.rayNoiseMotionSpeed,
  rayQuality: DEFAULT_GOD_RAYS_BOX.rayQuality,
  rayUseGlobalNoiseSettings: true,
  roundedTop: 6,
  dustEnabled: true,
  dustCount: 180,
  dustSizeMin: 0.015,
  dustSizeMax: 0.05,
  dustSpeed: 0.01,
  dustColorLinked: true,
  dustColor: '#fff4cf',
  dustDirectionMode: 'global',
  dustDirectionLocal: [0, 1, 0],
  dustDrift: 0.18,
  dustStrength: 0.54,
  dustEdgeFade: DEFAULT_GOD_RAYS_BOX.dustEdgeFade,
  helperVisible: true,
}

function getIndexedEffectLabel(base: string, index: number) {
  return index <= 1 ? base : `${base} ${index}`
}

export const DEFAULT_GOD_RAYS_GLOBAL_NOISE: GodRaysGlobalNoiseState = {
  rayNoiseAmount: DEFAULT_GOD_RAYS_BOX.rayNoiseAmount,
  rayNoiseScale: DEFAULT_GOD_RAYS_BOX.rayNoiseScale,
  rayGrain: DEFAULT_GOD_RAYS_BOX.rayGrain,
  rayNoiseMotionMode: DEFAULT_GOD_RAYS_BOX.rayNoiseMotionMode,
  rayNoiseMotionSpeed: DEFAULT_GOD_RAYS_BOX.rayNoiseMotionSpeed,
  rayQuality: DEFAULT_GOD_RAYS_BOX.rayQuality,
}

export const DEFAULT_GOD_RAYS_GLOBAL_DIRECTION: [number, number, number] = [
  ...DEFAULT_GOD_RAYS_BOX.dustDirectionLocal,
]

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
    responsiveFrame?: {
      enabled?: boolean | null
      landscape?: Partial<ResponsiveFramePresetState> | null
      portrait?: Partial<ResponsiveFramePresetState> | null
      square?: Partial<ResponsiveFramePresetState> | null
    } | null
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
  responsiveFrame: ResponsiveFrameState
  backgroundMode: BackgroundMode
  backgroundColor: string
  backgroundRotation: number
  extraLights: ExtraLightState[]
  phoneScreenBoxes: PhoneScreenBoxState[]
  godRaysBoxes: GodRaysBoxState[]
  stencilVolumes: StencilVolumeState[]
  godRaysGlobalNoise: GodRaysGlobalNoiseState
  godRaysGlobalDirection: [number, number, number]
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
  responsiveFrame: ResponsiveFrameState
  assets: AssetSourceState
  extraLights: ExtraLightState[]
  phoneScreenBoxes: PhoneScreenBoxState[]
  godRaysBoxes: GodRaysBoxState[]
  stencilVolumes: StencilVolumeState[]
  godRaysGlobalNoise: GodRaysGlobalNoiseState
  godRaysGlobalDirection: [number, number, number]
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
  setResponsiveFramePreset: (kind: ResponsiveFramePresetKind, patch: Partial<ResponsiveFramePresetState>) => void
  saveCurrentCameraToResponsivePreset: (kind: ResponsiveFramePresetKind) => void
  setAssets: (patch: Partial<AssetSourceState>) => void
  addExtraLight: (type?: ExtraLightType) => void
  removeExtraLight: (id?: string) => void
  updateExtraLight: (id: string, patch: Partial<ExtraLightState>) => void
  replaceExtraLights: (lights: ExtraLightState[]) => void
  duplicateExtraLight: (id: string, options?: { selectDuplicate?: boolean }) => string | null
  addPhoneScreenBox: () => void
  updatePhoneScreenBox: (id: string, patch: PhoneScreenBoxPatch) => void
  replacePhoneScreenBoxes: (
    entries: Array<PhoneScreenBoxEntryInput & { label: string; visible: boolean; transform: ObjectTransformState }>,
  ) => void
  addGodRaysBox: () => void
  removeGodRaysBox: (id: string) => void
  updateGodRaysBox: (id: string, patch: Partial<Omit<GodRaysBoxState, 'id'>>) => void
  setGodRaysGlobalNoise: (patch: Partial<GodRaysGlobalNoiseState>) => void
  setGodRaysGlobalDirection: (direction: [number, number, number]) => void
  replaceGodRaysBoxes: (entries: Array<GodRaysBoxState & { label: string; visible: boolean; transform: ObjectTransformState }>) => void
  duplicateGodRaysBox: (id: string, options?: { selectDuplicate?: boolean }) => string | null
  addStencilVolume: () => void
  removeStencilVolume: (id: string) => void
  updateStencilVolume: (id: string, patch: Partial<Omit<StencilVolumeState, 'id'>>) => void
  replaceStencilVolumes: (entries: Array<StencilVolumeState & { label: string; visible: boolean; transform: ObjectTransformState }>) => void
  duplicateStencilVolume: (id: string, options?: { selectDuplicate?: boolean }) => string | null
  addRotateAnimation: (targetObjectId: string | null) => void
  updateRotateAnimation: (patch: Partial<RotateAnimationState>) => void
  removeRotateAnimation: () => void
  setBackgroundAudio: (patch: Partial<BackgroundAudioState>) => void
  setStatus: (status: string) => void
  registerObjectRef: (id: string, object: THREE.Object3D | null) => void
  registerMaterialRef: (id: string, material: THREE.Material | null) => void
  setAtlasTexture: (texture: THREE.Texture | null) => void
  setAtlasFrameTexture: (texture: THREE.CanvasTexture | null) => void
  setMaterialEffectPreviewFrame: (materialId: string, frame: number | null) => void
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

function clampGodRaysBox(entry: GodRaysBoxState): GodRaysBoxState {
  const minRadius = 0.05
  const bottomRadius = Math.max(entry.bottomRadius, minRadius)
  const topRadius =
    entry.linkTopRadius && Math.abs(entry.bottomRadius) > 0.0001
      ? Math.max((entry.topRadius / entry.bottomRadius) * bottomRadius, minRadius)
      : Math.max(entry.topRadius, minRadius)

  return {
    ...entry,
    sourceFace: '-y',
    sideCount: clampGodRaysSideCount(entry.sideCount),
    bottomRadius,
    topRadius,
    linkTopRadius: entry.linkTopRadius,
    topDome: Math.min(Math.max(entry.topDome, 0), 10),
    rayIntensity: Math.min(Math.max(entry.rayIntensity, 0), 10),
    rayFalloff: Math.min(Math.max(entry.rayFalloff, 0), 8),
    rayEdgeFade: Math.min(Math.max(entry.rayEdgeFade, 0), 1),
    rayNoiseAmount: Math.min(Math.max(entry.rayNoiseAmount, 0), 1),
    rayNoiseScale: Math.min(Math.max(entry.rayNoiseScale, 0.01), 20),
    rayGrain: Math.min(Math.max(entry.rayGrain, 0), 1),
    rayNoiseMotionMode: entry.rayNoiseMotionMode,
    rayNoiseMotionSpeed: Math.min(Math.max(entry.rayNoiseMotionSpeed, 0), 3),
    rayQuality: entry.rayQuality,
    rayUseGlobalNoiseSettings: entry.rayUseGlobalNoiseSettings ?? true,
    dustCount: Math.round(Math.min(Math.max(entry.dustCount, 0), 5000)),
    dustSizeMin: Math.min(Math.max(entry.dustSizeMin, 0.001), 1),
    dustSizeMax: Math.min(Math.max(entry.dustSizeMax, entry.dustSizeMin), 1),
    dustSpeed: Math.min(Math.max(entry.dustSpeed, 0), GOD_RAYS_DUST_SPEED_MAX),
    dustColorLinked: entry.dustColorLinked ?? true,
    dustColor: entry.dustColorLinked ? entry.rayColor : entry.dustColor ?? entry.rayColor,
    dustStrength: getGodRaysDustStrengthValue(entry.dustStrength),
    dustDirectionMode: entry.dustDirectionMode ?? 'local',
    dustDirectionLocal: normalizeGodRaysDirection(entry.dustDirectionLocal ?? getGodRaysDefaultDirection()),
    dustDrift: Math.min(Math.max(entry.dustDrift, 0), 5),
    dustEdgeFade: Math.min(Math.max(entry.dustEdgeFade, 0), 1),
  }
}

function applyGodRaysPatch(current: GodRaysBoxState, patch: Partial<Omit<GodRaysBoxState, 'id'>>) {
  const nextPatch = { ...patch }
  if (current.linkTopRadius && patch.bottomRadius !== undefined && patch.topRadius === undefined) {
    const ratio = current.bottomRadius > 0.0001 ? current.topRadius / current.bottomRadius : 1
    nextPatch.topRadius = patch.bottomRadius * ratio
  }

  const nextDustColorLinked = nextPatch.dustColorLinked ?? current.dustColorLinked
  if (nextDustColorLinked && nextPatch.rayColor !== undefined && nextPatch.dustColor === undefined) {
    nextPatch.dustColor = nextPatch.rayColor
  }
  if (patch.dustColorLinked !== undefined && patch.dustColorLinked && nextPatch.dustColor === undefined) {
    nextPatch.dustColor = nextPatch.rayColor ?? current.rayColor
  }

  return clampGodRaysBox({
    ...current,
    ...nextPatch,
    dustDirectionLocal: nextPatch.dustDirectionLocal ?? current.dustDirectionLocal,
  })
}

function clampStencilVolume(entry: StencilVolumeState): StencilVolumeState {
  const nextExtrudeEnd = [...(entry.extrudeEnd ?? DEFAULT_STENCIL_VOLUME.extrudeEnd)] as [number, number, number]
  for (let index = 0; index < 3; index += 1) {
    const value = nextExtrudeEnd[index]
    nextExtrudeEnd[index] = Number.isFinite(value) ? THREE.MathUtils.clamp(value, -20, 20) : DEFAULT_STENCIL_VOLUME.extrudeEnd[index]
  }
  const contourMode: StencilContourMode = 'silhouette'
  const rayNoiseMotionMode = entry.rayNoiseMotionMode === 'soft' ? 'soft' : 'off'
  const rayQuality =
    entry.rayQuality === 'medium' || entry.rayQuality === 'high' || entry.rayQuality === 'low'
      ? entry.rayQuality
      : DEFAULT_STENCIL_VOLUME.rayQuality
  const dustColorLinked = entry.dustColorLinked ?? DEFAULT_STENCIL_VOLUME.dustColorLinked
  const volumeColor = entry.volumeColor ?? DEFAULT_STENCIL_VOLUME.volumeColor

  return {
    ...entry,
    sourceWidth: THREE.MathUtils.clamp(entry.sourceWidth, 0.05, 20),
    sourceHeight: THREE.MathUtils.clamp(entry.sourceHeight, 0.05, 20),
    maskAssetLabel: entry.maskAssetLabel ?? null,
    maskAssetUrl: entry.maskAssetUrl ?? null,
    bakedContourShapes: entry.bakedContourShapes
      ? entry.bakedContourShapes.map((shape) => ({
          outline: shape.outline.map((point) => [...point] as [number, number]),
          holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
        }))
      : null,
    bakedPrimitiveShapeGroups: entry.bakedPrimitiveShapeGroups
      ? entry.bakedPrimitiveShapeGroups.map((group) =>
          group.map((shape) => ({
            outline: shape.outline.map((point) => [...point] as [number, number]),
            holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
          })),
        )
      : null,
    bakedPreparedPrimitives: entry.bakedPreparedPrimitives
      ? entry.bakedPreparedPrimitives.map((primitive) => ({
          id: primitive.id,
          shapes: primitive.shapes.map((shape) => ({
            outline: shape.outline.map((point) => [...point] as [number, number]),
            holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
          })),
          sourceCenter: [...primitive.sourceCenter] as [number, number, number],
          sourceSize: [...primitive.sourceSize] as [number, number],
        }))
      : null,
    projectionVisible: entry.projectionVisible ?? DEFAULT_STENCIL_VOLUME.projectionVisible,
    maskInvert: entry.maskInvert ?? false,
    contourDetail: THREE.MathUtils.clamp(entry.contourDetail, 0, 1),
    contourSimplify: THREE.MathUtils.clamp(entry.contourSimplify ?? DEFAULT_STENCIL_VOLUME.contourSimplify, 0, 1),
    contourSmooth: THREE.MathUtils.clamp(entry.contourSmooth ?? DEFAULT_STENCIL_VOLUME.contourSmooth, 0, 1),
    contourMinArea: THREE.MathUtils.clamp(entry.contourMinArea ?? DEFAULT_STENCIL_VOLUME.contourMinArea, 0, 1),
    contourMode,
    contourShowInnerLoops: entry.contourShowInnerLoops ?? DEFAULT_STENCIL_VOLUME.contourShowInnerLoops,
    contourDebugVisible: entry.contourDebugVisible ?? DEFAULT_STENCIL_VOLUME.contourDebugVisible,
    extrudeEnd: nextExtrudeEnd,
    endRotationX: Number.isFinite(entry.endRotationX) ? entry.endRotationX : DEFAULT_STENCIL_VOLUME.endRotationX,
    endRotationY: Number.isFinite(entry.endRotationY) ? entry.endRotationY : DEFAULT_STENCIL_VOLUME.endRotationY,
    endScaleX: THREE.MathUtils.clamp(entry.endScaleX, 0.05, 20),
    endScaleY: THREE.MathUtils.clamp(entry.endScaleY, 0.05, 20),
    volumeColor,
    volumeIntensity: THREE.MathUtils.clamp(entry.volumeIntensity, 0, 10),
    volumeFalloff: THREE.MathUtils.clamp(entry.volumeFalloff, 0, 8),
    rayEdgeFade: THREE.MathUtils.clamp(entry.rayEdgeFade ?? DEFAULT_STENCIL_VOLUME.rayEdgeFade, 0, 2),
    rayFillQuality: THREE.MathUtils.clamp(entry.rayFillQuality ?? DEFAULT_STENCIL_VOLUME.rayFillQuality, 0, 1),
    rayNoiseAmount: THREE.MathUtils.clamp(entry.rayNoiseAmount ?? DEFAULT_STENCIL_VOLUME.rayNoiseAmount, 0, 1),
    rayNoiseScale: THREE.MathUtils.clamp(entry.rayNoiseScale ?? DEFAULT_STENCIL_VOLUME.rayNoiseScale, 0.01, 20),
    rayGrain: THREE.MathUtils.clamp(entry.rayGrain ?? DEFAULT_STENCIL_VOLUME.rayGrain, 0, 1),
    rayNoiseMotionMode,
    rayNoiseMotionSpeed: THREE.MathUtils.clamp(
      entry.rayNoiseMotionSpeed ?? DEFAULT_STENCIL_VOLUME.rayNoiseMotionSpeed,
      0,
      3,
    ),
    rayQuality,
    rayUseGlobalNoiseSettings: entry.rayUseGlobalNoiseSettings ?? DEFAULT_STENCIL_VOLUME.rayUseGlobalNoiseSettings,
    roundedTop: THREE.MathUtils.clamp(entry.roundedTop, 0, 10),
    dustEnabled: entry.dustEnabled ?? true,
    dustCount: Math.round(THREE.MathUtils.clamp(entry.dustCount, 0, 5000)),
    dustSizeMin: THREE.MathUtils.clamp(entry.dustSizeMin, 0.001, 1),
    dustSizeMax: THREE.MathUtils.clamp(Math.max(entry.dustSizeMax, entry.dustSizeMin), 0.001, 1),
    dustSpeed: THREE.MathUtils.clamp(entry.dustSpeed, 0, GOD_RAYS_DUST_SPEED_MAX),
    dustColorLinked,
    dustColor: dustColorLinked ? volumeColor : entry.dustColor ?? volumeColor,
    dustDirectionMode: entry.dustDirectionMode ?? DEFAULT_STENCIL_VOLUME.dustDirectionMode,
    dustDirectionLocal: normalizeGodRaysDirection(
      entry.dustDirectionLocal ?? DEFAULT_STENCIL_VOLUME.dustDirectionLocal,
    ),
    dustDrift: THREE.MathUtils.clamp(entry.dustDrift, 0, 5),
    dustStrength: getGodRaysDustStrengthValue(entry.dustStrength),
    dustEdgeFade: THREE.MathUtils.clamp(entry.dustEdgeFade ?? DEFAULT_STENCIL_VOLUME.dustEdgeFade, 0, 1),
    helperVisible: entry.helperVisible ?? true,
  }
}

function applyStencilVolumePatch(current: StencilVolumeState, patch: Partial<Omit<StencilVolumeState, 'id'>>) {
  const nextPatch = { ...patch }
  const nextDustColorLinked = nextPatch.dustColorLinked ?? current.dustColorLinked
  if (nextDustColorLinked && nextPatch.volumeColor !== undefined && nextPatch.dustColor === undefined) {
    nextPatch.dustColor = nextPatch.volumeColor
  }
  if (patch.dustColorLinked !== undefined && patch.dustColorLinked && nextPatch.dustColor === undefined) {
    nextPatch.dustColor = nextPatch.volumeColor ?? current.volumeColor
  }

  return clampStencilVolume({
    ...current,
    ...nextPatch,
    extrudeEnd: nextPatch.extrudeEnd ? [...nextPatch.extrudeEnd] as [number, number, number] : current.extrudeEnd,
    dustDirectionLocal: nextPatch.dustDirectionLocal ?? current.dustDirectionLocal,
  })
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

function getIndexedPhoneScreenBoxLabel(index: number) {
  return index <= 1 ? 'Phone Box' : `Phone Box ${index}`
}

function createDefaultPhoneScreenBoxMaterialState(materialId: string, meshId: string): PbrMaterialState {
  return {
    id: materialId,
    name: 'Standard Material',
    type: 'MeshStandardMaterial',
    meshIds: [meshId],
    environmentOverrideId: null,
    environmentRotation: 0,
    useSystemMaterial: false,
    color: '#000000',
    emissive: '#000000',
    metalness: 0,
    roughness: 0.68,
    envMapIntensity: 1.2,
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
    effect: { ...DEFAULT_ATLAS_EFFECT },
  }
}

export function normalizePhoneScreenBoxState(
  entry: Partial<PhoneScreenBoxState> & Pick<PhoneScreenBoxState, 'id' | 'materialId'>,
): PhoneScreenBoxState {
  const hasGeometry = Boolean(entry.geometry)
  const baseGeometry = hasGeometry ? createDefaultPhoneScreenBoxGeometryState() : createLegacyPhoneScreenBoxGeometryState()
  const baseScreenBinding = hasGeometry
    ? createDefaultPhoneScreenBoxScreenBindingState()
    : createLegacyPhoneScreenBoxScreenBindingState()
  const baseInteraction = hasGeometry
    ? createDefaultPhoneScreenBoxInteractionState()
    : createLegacyPhoneScreenBoxInteractionState()
  const defaultContent = createDefaultPhoneScreenBoxContentState()

  const shouldUpgradeDefaultMouseInput =
    hasGeometry &&
    entry.interaction?.inputMode === 'mouse' &&
    (entry.interaction.enabled ?? true) &&
    (entry.interaction.maxOffsetX ?? 0.012) === 0.012 &&
    (entry.interaction.maxOffsetY ?? 0.018) === 0.018 &&
    (entry.interaction.smoothing ?? 0.14) === 0.14

  return {
    id: entry.id,
    materialId: entry.materialId,
    geometry: {
      ...baseGeometry,
      ...entry.geometry,
    },
    screenBinding: {
      ...baseScreenBinding,
      ...entry.screenBinding,
    },
    content: {
      ...defaultContent,
      ...entry.content,
      anchor: [...(entry.content?.anchor ?? defaultContent.anchor)] as [number, number, number],
      attachedObjectIds: [...(entry.content?.attachedObjectIds ?? defaultContent.attachedObjectIds)],
    },
    interaction: {
      ...baseInteraction,
      ...entry.interaction,
      inputMode: shouldUpgradeDefaultMouseInput ? 'mouse+gyro' : (entry.interaction?.inputMode ?? baseInteraction.inputMode),
    },
  }
}

function applyPhoneScreenBoxPatch(current: PhoneScreenBoxState, patch: PhoneScreenBoxPatch): PhoneScreenBoxState {
  return {
    ...current,
    geometry: patch.geometry
      ? {
          ...current.geometry,
          ...patch.geometry,
        }
      : current.geometry,
    screenBinding: patch.screenBinding
      ? {
          ...current.screenBinding,
          ...patch.screenBinding,
        }
      : current.screenBinding,
    content: patch.content
      ? {
          ...current.content,
          ...patch.content,
          anchor: patch.content.anchor
            ? ([...patch.content.anchor] as [number, number, number])
            : current.content.anchor,
          attachedObjectIds: patch.content.attachedObjectIds
            ? [...patch.content.attachedObjectIds]
            : current.content.attachedObjectIds,
        }
      : current.content,
    interaction: patch.interaction
      ? {
          ...current.interaction,
          ...patch.interaction,
        }
      : current.interaction,
  }
}

function mergePhoneScreenBoxesIntoState(
  state: Pick<EditorState, 'phoneScreenBoxes' | 'sceneGraph' | 'objects' | 'materials'>,
  sceneGraph: Record<string, SceneGraphNode>,
  objects: Record<string, ObjectTransformState>,
  materials: Record<string, PbrMaterialState>,
) {
  const nextSceneGraph = { ...sceneGraph }
  const nextObjects = { ...objects }
  const nextMaterials = { ...materials }

  state.phoneScreenBoxes.map((entry) => normalizePhoneScreenBoxState(entry)).forEach((box, index) => {
    const objectState = state.objects[box.id]
    const sceneNode = state.sceneGraph[box.id]
    const materialState = state.materials[box.materialId]
    const materialNode = state.sceneGraph[box.materialId]

    nextSceneGraph[box.id] = {
      id: box.id,
      parentId: null,
      children: [box.materialId],
      type: 'mesh',
      label: sceneNode?.label ?? getIndexedPhoneScreenBoxLabel(index + 1),
      objectUuid: box.id,
      visible: sceneNode?.visible ?? objectState?.visible ?? true,
    }
    nextObjects[box.id] = objectState ?? {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    }
    nextSceneGraph[box.materialId] = {
      id: box.materialId,
      parentId: box.id,
      children: [],
      type: 'material',
      label: materialNode?.label ?? 'Standard Material',
      materialUuid: box.materialId,
      visible: true,
    }
    nextMaterials[box.materialId] = materialState ?? createDefaultPhoneScreenBoxMaterialState(box.materialId, box.id)
  })

  return {
    sceneGraph: nextSceneGraph,
    objects: nextObjects,
    materials: nextMaterials,
  }
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

function clonePhoneScreenBoxesState(phoneScreenBoxes: PhoneScreenBoxState[]) {
  return phoneScreenBoxes.map((entry) => {
    const normalized = normalizePhoneScreenBoxState(entry)
    return {
      ...normalized,
      geometry: { ...normalized.geometry },
      screenBinding: { ...normalized.screenBinding },
      content: {
        ...normalized.content,
        anchor: [...normalized.content.anchor] as [number, number, number],
        attachedObjectIds: [...normalized.content.attachedObjectIds],
      },
      interaction: { ...normalized.interaction },
    }
  })
}

function cloneGodRaysBoxesState(godRaysBoxes: GodRaysBoxState[]) {
  return godRaysBoxes.map((entry) => ({
    ...entry,
    dustDirectionLocal: [...entry.dustDirectionLocal] as [number, number, number],
  }))
}

function cloneStencilVolumesState(stencilVolumes: StencilVolumeState[]) {
  return stencilVolumes.map((entry) => ({
    ...entry,
    extrudeEnd: [...entry.extrudeEnd] as [number, number, number],
    bakedContourShapes: entry.bakedContourShapes
      ? entry.bakedContourShapes.map((shape) => ({
          outline: shape.outline.map((point) => [...point] as [number, number]),
          holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
        }))
      : null,
    bakedPrimitiveShapeGroups: entry.bakedPrimitiveShapeGroups
      ? entry.bakedPrimitiveShapeGroups.map((group) =>
          group.map((shape) => ({
            outline: shape.outline.map((point) => [...point] as [number, number]),
            holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
          })),
        )
      : null,
    bakedPreparedPrimitives: entry.bakedPreparedPrimitives
      ? entry.bakedPreparedPrimitives.map((primitive) => ({
          id: primitive.id,
          shapes: primitive.shapes.map((shape) => ({
            outline: shape.outline.map((point) => [...point] as [number, number]),
            holes: shape.holes.map((hole) => hole.map((point) => [...point] as [number, number])),
          })),
          sourceCenter: [...primitive.sourceCenter] as [number, number, number],
          sourceSize: [...primitive.sourceSize] as [number, number],
        }))
      : null,
    dustDirectionLocal: [...(entry.dustDirectionLocal ?? DEFAULT_STENCIL_VOLUME.dustDirectionLocal)] as [number, number, number],
  }))
}

function cloneGodRaysGlobalNoiseState(godRaysGlobalNoise: GodRaysGlobalNoiseState): GodRaysGlobalNoiseState {
  return { ...godRaysGlobalNoise }
}

function cloneGodRaysGlobalDirectionState(
  godRaysGlobalDirection: [number, number, number],
): [number, number, number] {
  return [...godRaysGlobalDirection] as [number, number, number]
}

function cloneRotateAnimationState(rotateAnimation: RotateAnimationState): RotateAnimationState {
  return { ...DEFAULT_ROTATE_ANIMATION, ...rotateAnimation }
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
    responsiveFrame: cloneResponsiveFrameState(state.responsiveFrame),
    backgroundMode: state.backgroundMode,
    backgroundColor: state.backgroundColor,
    backgroundRotation: state.backgroundRotation,
    extraLights: cloneExtraLightsState(state.extraLights),
    phoneScreenBoxes: clonePhoneScreenBoxesState(state.phoneScreenBoxes),
    godRaysBoxes: cloneGodRaysBoxesState(state.godRaysBoxes),
    stencilVolumes: cloneStencilVolumesState(state.stencilVolumes),
    godRaysGlobalNoise: cloneGodRaysGlobalNoiseState(state.godRaysGlobalNoise),
    godRaysGlobalDirection: cloneGodRaysGlobalDirectionState(state.godRaysGlobalDirection),
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
  const activeGodRaysDirectionWasRemoved =
    state.hud.activeGodRaysDirectionBoxId != null && idsToRemove.has(state.hud.activeGodRaysDirectionBoxId)
  const activeStencilVolumeEndWasRemoved =
    state.hud.activeStencilVolumeEndHandleId != null && idsToRemove.has(state.hud.activeStencilVolumeEndHandleId)

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
      materialEffectPreviewFrameById: Object.fromEntries(
        Object.entries(state.runtime.materialEffectPreviewFrameById).filter(([materialId]) => materials[materialId]),
      ),
    },
    selectedObjectId: selectedObjectWasRemoved ? null : state.selectedObjectId,
    selectedAnchorIndex: selectedObjectWasRemoved ? null : state.selectedAnchorIndex,
    selectedMaterialId:
      selectedObjectWasRemoved || selectedMaterialWasRemoved
        ? null
        : resolveSelectedMaterialId(state.selectedObjectId, sceneGraph),
    phoneScreenBoxes: state.phoneScreenBoxes.filter(
      (entry) => !removedMeshIds.has(entry.id) && !idsToRemove.has(entry.materialId),
    ),
    godRaysBoxes: state.godRaysBoxes.filter((entry) => !idsToRemove.has(entry.id)),
    stencilVolumes: state.stencilVolumes.filter((entry) => !idsToRemove.has(entry.id)),
    hud: activeGodRaysDirectionWasRemoved || activeStencilVolumeEndWasRemoved
      ? {
          ...state.hud,
          activeGodRaysDirectionBoxId: activeGodRaysDirectionWasRemoved ? null : state.hud.activeGodRaysDirectionBoxId,
          activeStencilVolumeEndHandleId: activeStencilVolumeEndWasRemoved
            ? null
            : state.hud.activeStencilVolumeEndHandleId,
        }
      : state.hud,
    rotateAnimation: rotateAnimationTargetWasRemoved
      ? {
          ...DEFAULT_ROTATE_ANIMATION,
          enabled: false,
        }
      : state.rotateAnimation,
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
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
    activeGodRaysDirectionBoxId: null,
    activeStencilVolumeEndHandleId: null,
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
  responsiveFrame: createDefaultResponsiveFrameState(),
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
  phoneScreenBoxes: [],
  godRaysBoxes: [],
  stencilVolumes: [],
  godRaysGlobalNoise: DEFAULT_GOD_RAYS_GLOBAL_NOISE,
  godRaysGlobalDirection: DEFAULT_GOD_RAYS_GLOBAL_DIRECTION,
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
    materialEffectPreviewFrameById: {},
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
      const activeGodRaysDirectionBoxId =
        state.hud.activeGodRaysDirectionBoxId && state.hud.activeGodRaysDirectionBoxId !== id
          ? null
          : state.hud.activeGodRaysDirectionBoxId
      const activeStencilVolumeEndHandleId =
        state.hud.activeStencilVolumeEndHandleId && state.hud.activeStencilVolumeEndHandleId !== id
          ? null
          : state.hud.activeStencilVolumeEndHandleId

      return {
        selectedObjectId: id,
        selectedMaterialId: resolvedMaterialId,
        selectedAnchorIndex: null,
        hud:
          activeGodRaysDirectionBoxId === state.hud.activeGodRaysDirectionBoxId &&
          activeStencilVolumeEndHandleId === state.hud.activeStencilVolumeEndHandleId
            ? state.hud
            : {
                ...state.hud,
                activeGodRaysDirectionBoxId,
                activeStencilVolumeEndHandleId,
              },
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
        hud: state.hud.activeGodRaysDirectionBoxId || state.hud.activeStencilVolumeEndHandleId
          ? {
              ...state.hud,
              activeGodRaysDirectionBoxId: null,
              activeStencilVolumeEndHandleId: null,
            }
          : state.hud,
      }
    }),
  setSelectedAnchorIndex: (index) => set({ selectedAnchorIndex: index }),
  setSceneGraph: (sceneGraph, objects, materials, rootNodeId, selectedObjectId, loadedModelLabel) =>
    set((state) => {
      let nextSceneGraph = { ...sceneGraph }
      let nextObjects = { ...objects }
      let nextMaterials = { ...materials }

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

      state.godRaysBoxes.forEach((effect, index) => {
        const objectState = state.objects[effect.id]
        const sceneNode = state.sceneGraph[effect.id]
        nextSceneGraph[effect.id] = {
          id: effect.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: sceneNode?.label ?? getIndexedEffectLabel('God Rays', index + 1),
          objectUuid: effect.id,
          visible: sceneNode?.visible ?? objectState?.visible ?? true,
        }
        nextObjects[effect.id] = objectState ?? {
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
          scale: [1.5, 2.5, 1.5],
          visible: true,
        }
      })

      state.stencilVolumes.forEach((effect, index) => {
        const objectState = state.objects[effect.id]
        const sceneNode = state.sceneGraph[effect.id]
        nextSceneGraph[effect.id] = {
          id: effect.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: sceneNode?.label ?? getIndexedEffectLabel('Stencil Volume', index + 1),
          objectUuid: effect.id,
          visible: sceneNode?.visible ?? objectState?.visible ?? true,
        }
        nextObjects[effect.id] = objectState ?? {
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
        }
      })

      ;({ sceneGraph: nextSceneGraph, objects: nextObjects, materials: nextMaterials } =
        mergePhoneScreenBoxesIntoState(state, nextSceneGraph, nextObjects, nextMaterials))

      const nextSelectedObjectId = selectedObjectId === undefined ? rootNodeId : selectedObjectId

      return {
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
        materials: nextMaterials,
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
      let nextSceneGraph = {
        ...state.sceneGraph,
        ...sceneGraph,
      }
      let nextObjects = {
        ...state.objects,
        ...objects,
      }
      let nextMaterials = {
        ...state.materials,
        ...materials,
      }
      const nextSelectedObjectId = selectedObjectId === undefined ? rootNodeId : selectedObjectId

      state.godRaysBoxes.forEach((effect, index) => {
        const objectState = state.objects[effect.id]
        const sceneNode = state.sceneGraph[effect.id]
        nextSceneGraph[effect.id] = {
          id: effect.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: sceneNode?.label ?? getIndexedEffectLabel('God Rays', index + 1),
          objectUuid: effect.id,
          visible: sceneNode?.visible ?? objectState?.visible ?? true,
        }
        nextObjects[effect.id] = objectState ?? {
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
          scale: [1.5, 2.5, 1.5],
          visible: true,
        }
      })

      state.stencilVolumes.forEach((effect, index) => {
        const objectState = state.objects[effect.id]
        const sceneNode = state.sceneGraph[effect.id]
        nextSceneGraph[effect.id] = {
          id: effect.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: sceneNode?.label ?? getIndexedEffectLabel('Stencil Volume', index + 1),
          objectUuid: effect.id,
          visible: sceneNode?.visible ?? objectState?.visible ?? true,
        }
        nextObjects[effect.id] = objectState ?? {
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
        }
      })

      ;({ sceneGraph: nextSceneGraph, objects: nextObjects, materials: nextMaterials } =
        mergePhoneScreenBoxesIntoState(state, nextSceneGraph, nextObjects, nextMaterials))

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
  setResponsiveFramePreset: (kind, patch) =>
    set((state) =>
      withHistory(state, {
        responsiveFrame: {
          ...state.responsiveFrame,
          [kind]: {
            ...state.responsiveFrame[kind],
            ...patch,
            cameraPosition: patch.cameraPosition
              ? [...patch.cameraPosition] as [number, number, number]
              : state.responsiveFrame[kind].cameraPosition,
            orbitTarget: patch.orbitTarget
              ? [...patch.orbitTarget] as [number, number, number]
              : state.responsiveFrame[kind].orbitTarget,
          },
        },
      }),
    ),
  saveCurrentCameraToResponsivePreset: (kind) =>
    set((state) =>
      withHistory(state, {
        responsiveFrame: {
          ...state.responsiveFrame,
          [kind]: {
            ...state.responsiveFrame[kind],
            cameraPosition: [...state.viewer.cameraPosition],
            orbitTarget: [...state.viewer.orbitTarget],
            focalLength: state.viewer.focalLength,
          },
        },
      }),
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
  duplicateExtraLight: (id, options) => {
    const state = get()
    const light = state.extraLights.find((entry) => entry.id === id)
    if (!light) {
      return null
    }

    const nextIndex = state.extraLights.length + 1
    const nextId = `light:extra:${nextIndex}:${Date.now()}`
    const nextLight: ExtraLightState = {
      ...light,
      id: nextId,
      label:
        light.type === 'ambient'
          ? `Ambient Light ${nextIndex}`
          : light.type === 'directional'
            ? `Directional Light ${nextIndex}`
            : light.type === 'spot'
              ? `Spot Light ${nextIndex}`
              : `Point Light ${nextIndex}`,
      position: [...light.position] as [number, number, number],
      targetPosition: [...light.targetPosition] as [number, number, number],
    }

    const selectDuplicate = options?.selectDuplicate ?? true

    set((currentState) =>
      withHistory(currentState, {
        extraLights: [...currentState.extraLights, nextLight],
        sceneGraph: {
          ...currentState.sceneGraph,
          [nextId]: {
            id: nextId,
            parentId: null,
            children: [],
            type: 'light',
            label: nextLight.label,
            objectUuid: nextId,
            visible: nextLight.visible,
          },
        },
        objects: {
          ...currentState.objects,
          [nextId]: {
            position: [...nextLight.position] as [number, number, number],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: nextLight.visible,
          },
        },
        selectedObjectId: selectDuplicate ? nextId : currentState.selectedObjectId,
        selectedAnchorIndex: null,
        selectedMaterialId: selectDuplicate ? null : currentState.selectedMaterialId,
      }),
    )

    return nextId
  },
  addPhoneScreenBox: () =>
    set((state) => {
      const nextIndex = state.phoneScreenBoxes.length + 1
      const id = `mesh:phone-box:${nextIndex}:${Date.now()}`
      const materialId = getPhoneScreenBoxMaterialId(id)
      const label = getIndexedPhoneScreenBoxLabel(nextIndex)
      const nextEntry = normalizePhoneScreenBoxState({
        id,
        materialId,
        geometry: createDefaultPhoneScreenBoxGeometryState(),
        screenBinding: createDefaultPhoneScreenBoxScreenBindingState(),
        content: createDefaultPhoneScreenBoxContentState(),
        interaction: createDefaultPhoneScreenBoxInteractionState(),
      })

      return {
        phoneScreenBoxes: [...state.phoneScreenBoxes, nextEntry],
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            id,
            parentId: null,
            children: [materialId],
            type: 'mesh',
            label,
            objectUuid: id,
            visible: true,
          },
          [materialId]: {
            id: materialId,
            parentId: id,
            children: [],
            type: 'material',
            label: 'Standard Material',
            materialUuid: materialId,
            visible: true,
          },
        },
        objects: {
          ...state.objects,
          [id]: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
          },
        },
        materials: {
          ...state.materials,
          [materialId]: createDefaultPhoneScreenBoxMaterialState(materialId, id),
        },
        selectedObjectId: id,
        selectedAnchorIndex: null,
        selectedMaterialId: materialId,
        history: clearHistory(),
      }
    }),
  updatePhoneScreenBox: (id, patch) =>
    set((state) => {
      const current = state.phoneScreenBoxes.find((entry) => entry.id === id)
      if (!current) {
        return state
      }

      return withHistory(state, {
        phoneScreenBoxes: state.phoneScreenBoxes.map((entry) =>
          entry.id === id ? applyPhoneScreenBoxPatch(normalizePhoneScreenBoxState(entry), patch) : entry,
        ),
      })
    }),
  replacePhoneScreenBoxes: (entries) =>
    set((state) => {
      const nextSceneGraph = { ...state.sceneGraph }
      const nextObjects = { ...state.objects }
      const nextMaterials = { ...state.materials }
      const nextIds = new Set(entries.map((entry) => entry.id))

      state.phoneScreenBoxes.forEach((entry) => {
        if (nextIds.has(entry.id)) {
          return
        }

        delete nextSceneGraph[entry.id]
        delete nextObjects[entry.id]
        delete nextSceneGraph[entry.materialId]
        delete nextMaterials[entry.materialId]
      })

      entries.forEach((entry) => {
        nextSceneGraph[entry.id] = {
          id: entry.id,
          parentId: null,
          children: [entry.materialId],
          type: 'mesh',
          label: entry.label,
          objectUuid: entry.id,
          visible: entry.visible,
        }
        nextSceneGraph[entry.materialId] = {
          id: entry.materialId,
          parentId: entry.id,
          children: [],
          type: 'material',
          label: 'Standard Material',
          materialUuid: entry.materialId,
          visible: true,
        }
        nextObjects[entry.id] = {
          position: [...entry.transform.position] as [number, number, number],
          rotation: [...entry.transform.rotation] as [number, number, number],
          scale: [...entry.transform.scale] as [number, number, number],
          visible: entry.visible,
        }
        nextMaterials[entry.materialId] =
          state.materials[entry.materialId] ?? createDefaultPhoneScreenBoxMaterialState(entry.materialId, entry.id)
      })

      return {
        phoneScreenBoxes: entries.map(({ label: _label, visible: _visible, transform: _transform, ...entry }) =>
          normalizePhoneScreenBoxState(entry),
        ),
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
        materials: nextMaterials,
      }
    }),
  addGodRaysBox: () =>
    set((state) => {
      const nextIndex = state.godRaysBoxes.length + 1
      const id = `effect:god-rays:${nextIndex}:${Date.now()}`
      const label = getIndexedEffectLabel('God Rays', nextIndex)
      const nextBox = clampGodRaysBox({
        id,
        ...DEFAULT_GOD_RAYS_BOX,
      })

      return {
        godRaysBoxes: [...state.godRaysBoxes, nextBox],
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            id,
            parentId: null,
            children: [],
            type: 'effect',
            label,
            objectUuid: id,
            visible: true,
          },
        },
        objects: {
          ...state.objects,
          [id]: {
            position: [0, 1.5, 0],
            rotation: [0, 0, 0],
            scale: [1.5, 2.5, 1.5],
            visible: true,
          },
        },
        selectedObjectId: id,
        selectedAnchorIndex: null,
        selectedMaterialId: null,
        history: clearHistory(),
      }
    }),
  removeGodRaysBox: (id) =>
    set((state) => ({
      ...buildDeletePatch(state, id),
      history: clearHistory(),
    })),
  updateGodRaysBox: (id, patch) =>
    set((state) => {
      const current = state.godRaysBoxes.find((entry) => entry.id === id)
      if (!current) {
        return state
      }

      const next = applyGodRaysPatch(current, patch)

      return withHistory(state, {
        godRaysBoxes: state.godRaysBoxes.map((entry) => (entry.id === id ? next : entry)),
      })
    }),
  setGodRaysGlobalNoise: (patch) =>
    set((state) =>
      withHistory(state, {
        godRaysGlobalNoise: {
          ...state.godRaysGlobalNoise,
          ...patch,
        },
      }),
    ),
  setGodRaysGlobalDirection: (direction) =>
    set((state) =>
      withHistory(state, {
        godRaysGlobalDirection: normalizeGodRaysDirection(direction),
      }),
    ),
  replaceGodRaysBoxes: (entries) =>
    set((state) => {
      const nextSceneGraph = { ...state.sceneGraph }
      const nextObjects = { ...state.objects }
      const existingIds = new Set(state.godRaysBoxes.map((entry) => entry.id))
      const nextIds = new Set(entries.map((entry) => entry.id))

      existingIds.forEach((effectId) => {
        if (nextIds.has(effectId)) {
          return
        }

        delete nextSceneGraph[effectId]
        delete nextObjects[effectId]
      })

      entries.forEach((entry) => {
        nextSceneGraph[entry.id] = {
          id: entry.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: entry.label,
          objectUuid: entry.id,
          visible: entry.visible,
        }
        nextObjects[entry.id] = {
          ...entry.transform,
          position: [...entry.transform.position] as [number, number, number],
          rotation: [...entry.transform.rotation] as [number, number, number],
          scale: [...entry.transform.scale] as [number, number, number],
          visible: entry.visible,
        }
      })

      return {
        godRaysBoxes: entries.map(({ label: _label, visible: _visible, transform: _transform, ...entry }) =>
          clampGodRaysBox({
            ...entry,
            dustDirectionLocal: [...entry.dustDirectionLocal] as [number, number, number],
          }),
        ),
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
      }
    }),
  duplicateGodRaysBox: (id, options) => {
    const state = get()
    const effect = state.godRaysBoxes.find((entry) => entry.id === id)
    const objectState = state.objects[id]
    const sceneNode = state.sceneGraph[id]
    if (!effect || !objectState || !sceneNode) {
      return null
    }

    const nextIndex = state.godRaysBoxes.length + 1
    const nextId = `effect:god-rays:${nextIndex}:${Date.now()}`
    const nextLabel = getIndexedEffectLabel('God Rays', nextIndex)
    const nextEffect = clampGodRaysBox({
      ...effect,
      id: nextId,
      dustDirectionLocal: [...effect.dustDirectionLocal] as [number, number, number],
    })

    const selectDuplicate = options?.selectDuplicate ?? true

    set((currentState) =>
      withHistory(currentState, {
        godRaysBoxes: [...currentState.godRaysBoxes, nextEffect],
        sceneGraph: {
          ...currentState.sceneGraph,
          [nextId]: {
            id: nextId,
            parentId: null,
            children: [],
            type: 'effect',
            label: nextLabel,
            objectUuid: nextId,
            visible: objectState.visible,
          },
        },
        objects: {
          ...currentState.objects,
          [nextId]: {
            position: [...objectState.position] as [number, number, number],
            rotation: [...objectState.rotation] as [number, number, number],
            scale: [...objectState.scale] as [number, number, number],
            visible: objectState.visible,
          },
        },
        selectedObjectId: selectDuplicate ? nextId : currentState.selectedObjectId,
        selectedAnchorIndex: null,
        selectedMaterialId: selectDuplicate ? null : currentState.selectedMaterialId,
      }),
    )

    return nextId
  },
  addStencilVolume: () =>
    set((state) => {
      const nextIndex = state.stencilVolumes.length + 1
      const id = `effect:stencil-volume:${nextIndex}:${Date.now()}`
      const label = getIndexedEffectLabel('Stencil Volume', nextIndex)
      const nextVolume = clampStencilVolume({
        id,
        ...DEFAULT_STENCIL_VOLUME,
      })

      return {
        stencilVolumes: [...state.stencilVolumes, nextVolume],
        sceneGraph: {
          ...state.sceneGraph,
          [id]: {
            id,
            parentId: null,
            children: [],
            type: 'effect',
            label,
            objectUuid: id,
            visible: true,
          },
        },
        objects: {
          ...state.objects,
          [id]: {
            position: [0, 1.5, 0],
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
  removeStencilVolume: (id) =>
    set((state) => ({
      ...buildDeletePatch(state, id),
      history: clearHistory(),
    })),
  updateStencilVolume: (id, patch) =>
    set((state) => {
      const current = state.stencilVolumes.find((entry) => entry.id === id)
      if (!current) {
        return state
      }

      const next = applyStencilVolumePatch(current, patch)
      return withHistory(state, {
        stencilVolumes: state.stencilVolumes.map((entry) => (entry.id === id ? next : entry)),
      })
    }),
  replaceStencilVolumes: (entries) =>
    set((state) => {
      const nextSceneGraph = { ...state.sceneGraph }
      const nextObjects = { ...state.objects }
      const existingIds = new Set(state.stencilVolumes.map((entry) => entry.id))
      const nextIds = new Set(entries.map((entry) => entry.id))

      existingIds.forEach((effectId) => {
        if (nextIds.has(effectId)) {
          return
        }

        delete nextSceneGraph[effectId]
        delete nextObjects[effectId]
      })

      entries.forEach((entry) => {
        nextSceneGraph[entry.id] = {
          id: entry.id,
          parentId: null,
          children: [],
          type: 'effect',
          label: entry.label,
          objectUuid: entry.id,
          visible: entry.visible,
        }
        nextObjects[entry.id] = {
          ...entry.transform,
          position: [...entry.transform.position] as [number, number, number],
          rotation: [...entry.transform.rotation] as [number, number, number],
          scale: [...entry.transform.scale] as [number, number, number],
          visible: entry.visible,
        }
      })

      return {
        stencilVolumes: entries.map(({ label: _label, visible: _visible, transform: _transform, ...entry }) =>
          clampStencilVolume({
            ...entry,
            extrudeEnd: [...entry.extrudeEnd] as [number, number, number],
            dustDirectionLocal: [...(entry.dustDirectionLocal ?? DEFAULT_STENCIL_VOLUME.dustDirectionLocal)] as [number, number, number],
          }),
        ),
        sceneGraph: nextSceneGraph,
        objects: nextObjects,
      }
    }),
  duplicateStencilVolume: (id, options) => {
    const state = get()
    const effect = state.stencilVolumes.find((entry) => entry.id === id)
    const objectState = state.objects[id]
    if (!effect || !objectState) {
      return null
    }

    const nextIndex = state.stencilVolumes.length + 1
    const nextId = `effect:stencil-volume:${nextIndex}:${Date.now()}`
    const nextLabel = getIndexedEffectLabel('Stencil Volume', nextIndex)
    const nextEffect = clampStencilVolume({
      ...effect,
      id: nextId,
      extrudeEnd: [...effect.extrudeEnd] as [number, number, number],
      dustDirectionLocal: [...(effect.dustDirectionLocal ?? DEFAULT_STENCIL_VOLUME.dustDirectionLocal)] as [number, number, number],
    })
    const selectDuplicate = options?.selectDuplicate ?? true

    set((currentState) =>
      withHistory(currentState, {
        stencilVolumes: [...currentState.stencilVolumes, nextEffect],
        sceneGraph: {
          ...currentState.sceneGraph,
          [nextId]: {
            id: nextId,
            parentId: null,
            children: [],
            type: 'effect',
            label: nextLabel,
            objectUuid: nextId,
            visible: objectState.visible,
          },
        },
        objects: {
          ...currentState.objects,
          [nextId]: {
            position: [...objectState.position] as [number, number, number],
            rotation: [...objectState.rotation] as [number, number, number],
            scale: [...objectState.scale] as [number, number, number],
            visible: objectState.visible,
          },
        },
        selectedObjectId: selectDuplicate ? nextId : currentState.selectedObjectId,
        selectedAnchorIndex: null,
        selectedMaterialId: selectDuplicate ? null : currentState.selectedMaterialId,
      }),
    )

    return nextId
  },
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
  setMaterialEffectPreviewFrame: (materialId, frame) =>
    set((state) => {
      const previousFrame = state.runtime.materialEffectPreviewFrameById[materialId]
      if (frame == null) {
        if (previousFrame == null) {
          return state
        }

        const nextPreviewFrames = { ...state.runtime.materialEffectPreviewFrameById }
        delete nextPreviewFrames[materialId]
        return {
          runtime: {
            ...state.runtime,
            materialEffectPreviewFrameById: nextPreviewFrames,
          },
        }
      }

      if (previousFrame === frame) {
        return state
      }

      return {
        runtime: {
          ...state.runtime,
          materialEffectPreviewFrameById: {
            ...state.runtime.materialEffectPreviewFrameById,
            [materialId]: frame,
          },
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
        responsiveFrame: createDefaultResponsiveFrameState(),
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
          activeGodRaysDirectionBoxId: null,
          activeStencilVolumeEndHandleId: null,
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
        phoneScreenBoxes: [],
        godRaysBoxes: [],
        stencilVolumes: [],
        godRaysGlobalNoise: { ...DEFAULT_GOD_RAYS_GLOBAL_NOISE },
        godRaysGlobalDirection: [...DEFAULT_GOD_RAYS_GLOBAL_DIRECTION] as [number, number, number],
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
          materialEffectPreviewFrameById: {},
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
        responsiveFrame: cloneResponsiveFrameState(previous.responsiveFrame),
        backgroundMode: previous.backgroundMode,
        backgroundColor: previous.backgroundColor,
        backgroundRotation: previous.backgroundRotation,
        extraLights: cloneExtraLightsState(previous.extraLights),
        phoneScreenBoxes: clonePhoneScreenBoxesState(previous.phoneScreenBoxes),
        godRaysBoxes: cloneGodRaysBoxesState(previous.godRaysBoxes),
        stencilVolumes: cloneStencilVolumesState(previous.stencilVolumes),
        godRaysGlobalNoise: cloneGodRaysGlobalNoiseState(previous.godRaysGlobalNoise),
        godRaysGlobalDirection: cloneGodRaysGlobalDirectionState(previous.godRaysGlobalDirection),
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
        responsiveFrame: cloneResponsiveFrameState(next.responsiveFrame),
        backgroundMode: next.backgroundMode,
        backgroundColor: next.backgroundColor,
        backgroundRotation: next.backgroundRotation,
        extraLights: cloneExtraLightsState(next.extraLights),
        phoneScreenBoxes: clonePhoneScreenBoxesState(next.phoneScreenBoxes),
        godRaysBoxes: cloneGodRaysBoxesState(next.godRaysBoxes),
        stencilVolumes: cloneStencilVolumesState(next.stencilVolumes),
        godRaysGlobalNoise: cloneGodRaysGlobalNoiseState(next.godRaysGlobalNoise),
        godRaysGlobalDirection: cloneGodRaysGlobalDirectionState(next.godRaysGlobalDirection),
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
