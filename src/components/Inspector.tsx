import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  STANDARD_ENVIRONMENT_PRESETS,
  getStandardEnvironmentPresetById,
  getStandardEnvironmentPresetByUrl,
} from '../features/environment/standardEnvironmentPresets'
import { loadHdri, loadTexture } from '../features/scene/runtime/shared'
import { type MaterialTextureSlotState, useEditorStore } from '../store/editorStore'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function formatDegrees(value: number) {
  return `${value.toFixed(0)}°`
}

function getAssetName(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback
  }

  const sanitized = value.split('#')[0]?.split('?')[0] ?? value
  const pieces = sanitized.split(/[\\/]/)
  const fileName = pieces[pieces.length - 1]
  return fileName ? decodeURIComponent(fileName) : fallback
}

function isHdriAsset(label: string) {
  return /\.(hdr|exr)$/i.test(label)
}

async function loadEnvironmentTexture(url: string, label: string) {
  const texture = isHdriAsset(label) || isHdriAsset(url) ? await loadHdri(url) : await loadTexture(url)
  texture.mapping = THREE.EquirectangularReflectionMapping

  if (!isHdriAsset(label) && !isHdriAsset(url)) {
    texture.colorSpace = THREE.SRGBColorSpace
  }

  texture.needsUpdate = true
  return texture
}

function createMaterialEnvironmentId(label: string) {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `material-environment:${safeLabel || 'hdri'}:${Date.now()}`
}

function createStandardMaterialEnvironmentId(presetId: string) {
  return `material-environment:${presetId}`
}

function normalizeEnvironmentAssetToken(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\.(hdr|exr|jpg|jpeg|png)$/i, '')
    .replace(/[^a-z0-9]+/g, '')
}

function getStandardEnvironmentPresetByLabel(label: string | null | undefined) {
  const normalizedLabel = normalizeEnvironmentAssetToken(label)
  if (!normalizedLabel) {
    return null
  }

  return (
    STANDARD_ENVIRONMENT_PRESETS.find((preset) => {
      const normalizedPresetLabel = normalizeEnvironmentAssetToken(preset.label)
      const normalizedPresetAssetName = normalizeEnvironmentAssetToken(getAssetName(preset.url, preset.label))
      return normalizedLabel === normalizedPresetLabel || normalizedLabel === normalizedPresetAssetName
    }) ?? null
  )
}

function resolveInspectorMaterialId({
  selectedObjectId,
  selectedObjectType,
  selectedObjectIsMaterial,
  selectedMaterialId,
  hasSelectedMaterial,
}: {
  selectedObjectId: string | null
  selectedObjectType: string | null
  selectedObjectIsMaterial: boolean
  selectedMaterialId: string | null
  hasSelectedMaterial: boolean
}) {
  if (selectedMaterialId && hasSelectedMaterial) {
    if (!selectedObjectType || (selectedObjectType !== 'material' && selectedObjectType !== 'mesh')) {
      return selectedMaterialId
    }
  }

  if (!selectedObjectId) {
    return selectedMaterialId && hasSelectedMaterial ? selectedMaterialId : null
  }

  if (selectedObjectType === 'material') {
    return selectedObjectIsMaterial ? selectedObjectId : null
  }

  if (selectedObjectType === 'mesh') {
    return selectedMaterialId && hasSelectedMaterial ? selectedMaterialId : null
  }

  return selectedMaterialId && hasSelectedMaterial ? selectedMaterialId : null
}

function getSceneEnvironmentOptionLabel(sourceLabel: string | null | undefined, fallbackUrl: string) {
  const matchedPreset = getStandardEnvironmentPresetByLabel(sourceLabel) ?? getStandardEnvironmentPresetByLabel(fallbackUrl)
  if (matchedPreset) {
    return matchedPreset.label
  }

  return getAssetName(sourceLabel, getAssetName(fallbackUrl, 'Studio')).replace(/\.(hdr|exr|jpg|jpeg|png)$/i, '')
}

type MaterialInspectorSectionKey = 'summary' | 'baseMaterial' | 'emission' | 'effects'

function SectionChevron({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`inspector-section__chevron${isCollapsed ? ' is-collapsed' : ''}`} aria-hidden="true">
      <path d="M2.5 4.25 6 7.75l3.5-3.5" />
    </svg>
  )
}

function EyeIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      <path
        d="M1.25 8s2.35-3.75 6.75-3.75S14.75 8 14.75 8s-2.35 3.75-6.75 3.75S1.25 8 1.25 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2.05" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {!isOpen ? <path d="M2.2 13.3 13.8 2.7" fill="none" stroke="currentColor" strokeWidth="1.2" /> : null}
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      <path d="M5.25 2.75h5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4.5h10" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 4.5v8h6v-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 6.4v4.2M9.4 6.4v4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function PlayIcon({ isPlaying }: { isPlaying: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      {isPlaying ? (
        <>
          <path d="M4.5 3.25h2.25v9.5H4.5z" fill="currentColor" />
          <path d="M9.25 3.25h2.25v9.5H9.25z" fill="currentColor" />
        </>
      ) : (
        <path d="M4.75 3.25 12 8l-7.25 4.75V3.25Z" fill="currentColor" />
      )}
    </svg>
  )
}

function SectionPanel({
  title,
  children,
  isCollapsed = false,
  onToggle,
}: {
  title: string
  children: ReactNode
  isCollapsed?: boolean
  onToggle?: (() => void) | undefined
}) {
  return (
    <section className="inspector-section">
      <div className="inspector-section__header">
        <span>{title}</span>
        {onToggle ? (
          <button type="button" className="inspector-section__toggle" onClick={onToggle} aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}>
            <SectionChevron isCollapsed={isCollapsed} />
          </button>
        ) : null}
      </div>
      {!isCollapsed ? <div className="inspector-section__body">{children}</div> : null}
    </section>
  )
}

function buildFallbackPreviewMaterial(material?: {
  color?: string
  emissive?: string
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  emissiveIntensity?: number
}) {
  const fallback = material ?? {}

  return new THREE.MeshStandardMaterial({
    color: fallback.color ?? '#ffffff',
    emissive: fallback.emissive ?? '#000000',
    metalness: fallback.metalness ?? 0,
    roughness: fallback.roughness ?? 1,
    envMapIntensity: fallback.envMapIntensity ?? 1,
    emissiveIntensity: fallback.emissiveIntensity ?? 1,
  })
}

const PREVIEW_TEXTURE_SLOTS = [
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
  'envMap',
] as const

const EDITABLE_TEXTURE_SLOTS = [
  { slot: 'map', label: 'Base Color' },
  { slot: 'normalMap', label: 'Normal' },
  { slot: 'roughnessMap', label: 'Roughness' },
  { slot: 'metalnessMap', label: 'Metalness' },
  { slot: 'aoMap', label: 'AO' },
  { slot: 'emissiveMap', label: 'Emissive' },
  { slot: 'alphaMap', label: 'Alpha' },
  { slot: 'bumpMap', label: 'Bump' },
  { slot: 'displacementMap', label: 'Displacement' },
  { slot: 'specularMap', label: 'Specular' },
] as const

type EditableTextureSlot = (typeof EDITABLE_TEXTURE_SLOTS)[number]['slot']

type PreviewCapableMaterial = THREE.Material & {
  uuid: string
  name?: string
  vertexColors?: boolean
  color?: THREE.Color
  emissive?: THREE.Color
  metalness?: number
  roughness?: number
  envMapIntensity?: number
  emissiveIntensity?: number
  envMapRotation?: THREE.Euler
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
  envMap?: THREE.Texture | null
  userData: THREE.Material['userData'] & {
    originalTextureSlots?: Partial<Record<EditableTextureSlot, THREE.Texture | null>>
    customTextureSlots?: Partial<Record<EditableTextureSlot, THREE.Texture | null>>
  }
}

type TextureRowEntry = {
  slot: EditableTextureSlot
  label: string
  selectedSource: 'original' | 'custom' | null
  originalLabel: string | null
  customLabel: string | null
  isTextureAvailable: boolean
}

function isFlipbookTargetSlotOverridden(
  effect:
    | {
        isAdded: boolean
        enabled: boolean
        targetSlot: 'emissive' | 'baseColor'
      }
    | null
    | undefined,
  atlasLoaded: boolean,
  slot: 'map' | 'emissiveMap',
) {
  if (!effect?.isAdded || !effect.enabled || !atlasLoaded) {
    return false
  }

  return (
    (slot === 'map' && effect.targetSlot === 'baseColor') ||
    (slot === 'emissiveMap' && effect.targetSlot === 'emissive')
  )
}

function getFlipbookTextureOptionLabel(slotLabel: 'Base Color' | 'Emissive') {
  return `Flipbook texture (${slotLabel})`
}

function beginInspectorGesture(gestureRef: { current: boolean }, beginHistoryGesture: () => void) {
  if (gestureRef.current) {
    return
  }

  gestureRef.current = true
  beginHistoryGesture()
}

function endInspectorGesture(gestureRef: { current: boolean }, endHistoryGesture: () => void) {
  if (!gestureRef.current) {
    return
  }

  gestureRef.current = false
  endHistoryGesture()
}

function getResolvedTextureForSlot(
  material: PreviewCapableMaterial,
  slot: EditableTextureSlot,
) {
  const currentTexture = material[slot]
  if (currentTexture instanceof THREE.Texture) {
    return currentTexture
  }

  const backupTexture = material.userData.originalTextureSlots?.[slot]
  if (backupTexture instanceof THREE.Texture) {
    return backupTexture
  }

  return null
}

function getOriginalTextureForSlot(
  material: PreviewCapableMaterial,
  slot: EditableTextureSlot,
) {
  const texture = material.userData.originalTextureSlots?.[slot]
  if (texture instanceof THREE.Texture) {
    return texture
  }

  const hasCustomTexture = material.userData.customTextureSlots?.[slot] instanceof THREE.Texture
  if (!hasCustomTexture) {
    const currentTexture = material[slot]
    if (currentTexture instanceof THREE.Texture) {
      return currentTexture
    }
  }

  return null
}

function getCustomTextureForSlot(
  material: PreviewCapableMaterial,
  slot: EditableTextureSlot,
) {
  const texture = material.userData.customTextureSlots?.[slot]
  return texture instanceof THREE.Texture ? texture : null
}

function getSelectedTextureSource(textureState: MaterialTextureSlotState | undefined) {
  if (textureState?.selectedSource === 'custom' && textureState.customLabel) {
    return 'custom'
  }
  if (textureState?.selectedSource === 'original' && textureState.originalLabel) {
    return 'original'
  }
  if (textureState?.customLabel) {
    return 'custom'
  }
  if (textureState?.originalLabel) {
    return 'original'
  }
  return null
}

function hasPreviewTexture(material: PreviewCapableMaterial | null | undefined) {
  if (!material) {
    return false
  }

  return Boolean(
    material.map ||
      material.emissiveMap ||
      material.normalMap ||
      material.roughnessMap ||
      material.metalnessMap ||
      material.aoMap,
  )
}

function pickMeshMaterialCandidate(
  materials: PreviewCapableMaterial[],
  targetMaterialUuid: string,
  targetMaterialName: string | undefined,
) {
  return (
    materials.find((material) => material.uuid === targetMaterialUuid && hasPreviewTexture(material)) ??
    materials.find((material) => material.uuid === targetMaterialUuid) ??
    materials.find((material) => material.name === targetMaterialName && hasPreviewTexture(material)) ??
    materials.find((material) => material.name === targetMaterialName) ??
    materials.find((material) => hasPreviewTexture(material)) ??
    materials[0] ??
    null
  )
}

function resolvePreviewRuntimeMaterial(
  materialId: string,
  materialState: {
    name: string
    meshIds: string[]
  },
  runtimeMaterialById: Record<string, THREE.Material>,
  runtimeObjectById: Record<string, THREE.Object3D>,
) {
  const targetMaterialUuid = materialId.replace(/^material:/, '')
  const directMaterial = (runtimeMaterialById[materialId] as PreviewCapableMaterial | undefined) ?? null
  if (hasPreviewTexture(directMaterial)) {
    return {
      material: directMaterial,
      source: 'runtime.materialById',
    }
  }

  for (const meshId of materialState.meshIds) {
    const runtimeObject = runtimeObjectById[meshId]
    if (!runtimeObject || !(runtimeObject as THREE.Mesh).isMesh) {
      continue
    }

    const mesh = runtimeObject as THREE.Mesh
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const typedMaterials = meshMaterials.filter(Boolean) as PreviewCapableMaterial[]
    const candidate = pickMeshMaterialCandidate(typedMaterials, targetMaterialUuid, materialState.name)
    if (candidate && hasPreviewTexture(candidate)) {
      return {
        material: candidate,
        source: 'fallback from mesh.material',
      }
    }

    if (!directMaterial && candidate) {
      return {
        material: candidate,
        source: 'fallback from mesh.material',
      }
    }
  }

  return {
    material: directMaterial,
    source: 'runtime.materialById',
  }
}

function getTextureDisplayName(texture: THREE.Texture, label: string) {
  const explicitName = texture.name?.trim()
  if (explicitName) {
    return explicitName
  }

  const imageSource = texture.source?.data as { currentSrc?: string; src?: string } | undefined
  const sourceUrl = imageSource?.currentSrc || imageSource?.src
  if (typeof sourceUrl === 'string' && sourceUrl) {
    const sanitized = sourceUrl.split('#')[0]?.split('?')[0] ?? sourceUrl
    const pieces = sanitized.split(/[\\/]/)
    const fileName = pieces[pieces.length - 1]
    if (fileName) {
      return decodeURIComponent(fileName)
    }
  }

  return `${label} Texture`
}

function copyTextureSettings(
  texture: THREE.Texture,
  previousTexture: THREE.Texture | null,
  slot: EditableTextureSlot,
) {
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

function cloneMaterialForPreview(source: THREE.Material) {
  const previewMaterial = source.clone() as PreviewCapableMaterial
  const runtimeLike = source as typeof previewMaterial

  PREVIEW_TEXTURE_SLOTS.forEach((slot) => {
    if (slot in runtimeLike) {
      previewMaterial[slot] = runtimeLike[slot] ?? null
    }
  })

  previewMaterial.userData = {
    ...previewMaterial.userData,
    originalTextureSlots: { ...(runtimeLike.userData.originalTextureSlots ?? {}) },
    customTextureSlots: { ...(runtimeLike.userData.customTextureSlots ?? {}) },
  }

  if (previewMaterial.map) {
    previewMaterial.needsUpdate = true
  }
  previewMaterial.needsUpdate = true

  return previewMaterial
}

function buildPreviewSphereGeometry(material: PreviewCapableMaterial) {
  const geometry = new THREE.SphereGeometry(0.94, 96, 96)
  const uv = geometry.getAttribute('uv')

  if (uv) {
    geometry.setAttribute('uv1', uv.clone())
    geometry.setAttribute('uv2', uv.clone())
    geometry.setAttribute('uv3', uv.clone())
  }

  if (material.vertexColors) {
    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    colors.fill(1)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  return geometry
}

function markPreviewTexturesForUpdate(material: PreviewCapableMaterial | THREE.Material) {
  const previewMaterial = material as PreviewCapableMaterial

  if (previewMaterial.map) {
    previewMaterial.map.needsUpdate = true
  }
  if (previewMaterial.emissiveMap) {
    previewMaterial.emissiveMap.needsUpdate = true
  }
  if (previewMaterial.normalMap) {
    previewMaterial.normalMap.needsUpdate = true
  }
  if (previewMaterial.roughnessMap) {
    previewMaterial.roughnessMap.needsUpdate = true
  }
  if (previewMaterial.metalnessMap) {
    previewMaterial.metalnessMap.needsUpdate = true
  }
  if (previewMaterial.aoMap) {
    previewMaterial.aoMap.needsUpdate = true
  }
  if (previewMaterial.envMap) {
    previewMaterial.envMap.needsUpdate = true
  }

  previewMaterial.needsUpdate = true
}

function applyPreviewEnvironment(
  material: PreviewCapableMaterial,
  materialState: {
    environmentOverrideId?: string | null
    environmentRotation?: number
    envMapIntensity?: number
  },
  environment: {
    isEnvironmentEnabled: boolean
    intensity: number
    rotation: number
  },
  sceneEnvironmentMap: THREE.Texture | null,
  materialEnvironmentMaps: Record<string, THREE.Texture>,
) {
  const localIntensity = materialState.envMapIntensity ?? 1
  const overrideTexture = materialState.environmentOverrideId
    ? materialEnvironmentMaps[materialState.environmentOverrideId] ?? null
    : null

  if (overrideTexture) {
    material.envMap = overrideTexture
    material.envMapIntensity = localIntensity
    material.envMapRotation?.set(0, THREE.MathUtils.degToRad(materialState.environmentRotation ?? 0), 0)
    return
  }

  if (environment.isEnvironmentEnabled && sceneEnvironmentMap) {
    material.envMap = sceneEnvironmentMap
    material.envMapIntensity = environment.intensity * localIntensity
    material.envMapRotation?.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    return
  }

  material.envMap = null
  material.envMapIntensity = localIntensity
}

function applyPreviewMaterialState(
  material: PreviewCapableMaterial,
  materialState: {
    color?: string
    emissive?: string
    metalness?: number
    roughness?: number
    emissiveIntensity?: number
    textureSlots: Record<
      EditableTextureSlot,
      {
        selectedSource: 'original' | 'custom' | null
        originalLabel: string | null
        customLabel: string | null
      }
    >
  },
) {
  if (materialState.color && material.color) {
    material.color.set(materialState.color)
  }
  if (materialState.emissive && material.emissive) {
    material.emissive.set(materialState.emissive)
  }
  if (materialState.metalness != null && 'metalness' in material) {
    material.metalness = materialState.metalness
  }
  if (materialState.roughness != null && 'roughness' in material) {
    material.roughness = materialState.roughness
  }
  if (materialState.emissiveIntensity != null && 'emissiveIntensity' in material) {
    material.emissiveIntensity = materialState.emissiveIntensity
  }
}

function applyPreviewTextureSelections(
  material: PreviewCapableMaterial,
  materialState: {
    textureSlots: Record<
      EditableTextureSlot,
      {
        selectedSource: 'original' | 'custom' | null
      }
    >
  },
  sourceMaterial?: PreviewCapableMaterial | null,
) {
  EDITABLE_TEXTURE_SLOTS.forEach(({ slot }) => {
    const selectedSource = materialState.textureSlots[slot]?.selectedSource ?? null
    const textureSource = sourceMaterial ?? material
    const originalTexture = getOriginalTextureForSlot(textureSource, slot)
    const customTexture = getCustomTextureForSlot(textureSource, slot)

    if (selectedSource === 'custom' && customTexture) {
      material[slot] = customTexture
      return
    }

    if (selectedSource === 'original' && originalTexture) {
      material[slot] = originalTexture
      return
    }

    material[slot] = customTexture ?? originalTexture ?? null
  })
}

function MaterialTextureList({ materialId }: { materialId: string }) {
  const materialState = useEditorStore((state) => state.materials[materialId] ?? null)
  const runtimeMaterialById = useEditorStore((state) => state.runtime.materialById)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const setStatus = useEditorStore((state) => state.setStatus)
  const [loadingSlots, setLoadingSlots] = useState<Partial<Record<EditableTextureSlot, boolean>>>({})
  const inputRefs = useRef<Partial<Record<EditableTextureSlot, HTMLInputElement | null>>>({})

  const resolvedMaterial = useMemo(() => {
    if (!materialState) {
      return null
    }
    return resolvePreviewRuntimeMaterial(materialId, materialState, runtimeMaterialById, runtimeObjectById)
      .material as PreviewCapableMaterial | null
  }, [materialId, materialState, runtimeMaterialById, runtimeObjectById])
  const resolvedSwatchColor = useMemo(() => {
    const runtimeColor = resolvedMaterial?.color
    if (runtimeColor instanceof THREE.Color) {
      return `#${runtimeColor.getHexString()}`
    }

    return materialState?.color ?? '#ffffff'
  }, [materialState?.color, resolvedMaterial])

  const textureRows = useMemo<TextureRowEntry[]>(() => {
    if (!materialState) {
      return []
    }

    return EDITABLE_TEXTURE_SLOTS.flatMap((entry) => {
      if (entry.slot === 'emissiveMap' || entry.slot === 'map') {
        return []
      }

      const textureState = materialState.textureSlots[entry.slot]
      const selectedSource = getSelectedTextureSource(textureState)
      const isTextureAvailable = Boolean(textureState.originalLabel || textureState.customLabel)

      if (!selectedSource) {
        return []
      }

      return [
        {
          slot: entry.slot,
          label: entry.label,
          selectedSource,
          originalLabel: textureState.originalLabel,
          customLabel: textureState.customLabel,
          isTextureAvailable,
        },
      ]
    })
  }, [materialState])

  if (!materialState || !textureRows.length) {
    return null
  }

  return (
    <div className="material-texture-list">
      {textureRows.map((entry) => (
        <div key={entry.slot} className="material-texture-row">
          <p className="material-texture-row__slot">{entry.label}</p>
          <div
            className={`material-asset-control${entry.slot === 'map' ? ' material-asset-control--with-swatch' : ''}`}
          >
            {entry.slot === 'map' ? (
              <label className="material-color-swatch" title={`Base Color: ${resolvedSwatchColor}`}>
                <input
                  type="color"
                  value={resolvedSwatchColor}
                  onChange={(event) => updateMaterial(materialId, { color: event.currentTarget.value })}
                />
                <span
                  className="material-color-swatch__chip"
                  style={{ backgroundColor: resolvedSwatchColor }}
                />
              </label>
            ) : null}
            <select
              className="material-asset-control__select material-texture-row__select"
              value={entry.selectedSource ?? ''}
              disabled={!entry.isTextureAvailable}
              onChange={(event) => {
                const nextSource = event.currentTarget.value as 'original' | 'custom'
                updateMaterial(materialId, {
                  textureSlots: {
                    ...materialState.textureSlots,
                    [entry.slot]: {
                      ...materialState.textureSlots[entry.slot],
                      selectedSource: nextSource,
                    },
                  },
                })
              }}
            >
              {!entry.isTextureAvailable ? <option value="">No texture</option> : null}
              {entry.originalLabel ? <option value="original">Original: {entry.originalLabel}</option> : null}
              {entry.customLabel ? <option value="custom">Custom: {entry.customLabel}</option> : null}
            </select>
            <button
              type="button"
              className="material-asset-control__button"
              disabled={!entry.isTextureAvailable}
              onClick={() => inputRefs.current[entry.slot]?.click()}
            >
              {loadingSlots[entry.slot] ? 'Loading' : 'Replace'}
            </button>
          </div>
          <input
            ref={(node) => {
              inputRefs.current[entry.slot] = node
            }}
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              if (!file) {
                return
              }

              const objectUrl = createObjectUrl(file)
              setLoadingSlots((current) => ({
                ...current,
                [entry.slot]: true,
              }))

              void (async () => {
                try {
                  const texture = await loadTexture(objectUrl)
                  texture.name = file.name

                  const latestState = useEditorStore.getState()
                  const latestMaterialState = latestState.materials[materialId]
                  if (!latestMaterialState) {
                    texture.dispose()
                    return
                  }

                  const resolvedLatest = resolvePreviewRuntimeMaterial(
                    materialId,
                    latestMaterialState,
                    latestState.runtime.materialById,
                    latestState.runtime.objectById,
                  ).material as PreviewCapableMaterial | null

                  if (!resolvedLatest) {
                    texture.dispose()
                    latestState.setStatus(`Failed to replace ${entry.label} texture.`)
                    return
                  }

                  const previousTexture =
                    getCustomTextureForSlot(resolvedLatest, entry.slot) ??
                    getOriginalTextureForSlot(resolvedLatest, entry.slot)
                  const originalTexture = getOriginalTextureForSlot(resolvedLatest, entry.slot)
                  copyTextureSettings(texture, previousTexture, entry.slot)
                  texture.needsUpdate = true

                  if (previousTexture && previousTexture !== originalTexture) {
                    previousTexture.dispose()
                  }

                  resolvedLatest.userData.customTextureSlots = {
                    ...(resolvedLatest.userData.customTextureSlots ?? {}),
                    [entry.slot]: texture,
                  }
                  resolvedLatest[entry.slot] = texture
                  resolvedLatest.needsUpdate = true

                  registerMaterialRef(materialId, resolvedLatest)
                  registerMaterialRef(`material:${resolvedLatest.uuid}`, resolvedLatest)
                  updateMaterial(materialId, {
                    textureSlots: {
                      ...latestMaterialState.textureSlots,
                      [entry.slot]: {
                        ...latestMaterialState.textureSlots[entry.slot],
                        customLabel: file.name,
                        customUrl: objectUrl,
                        customFileSize: file.size,
                        selectedSource: 'custom',
                      },
                    },
                  })
                  setStatus(`${entry.label} texture updated: ${file.name}`)
                } catch (error) {
                  console.error(error)
                  setStatus(`Failed to replace ${entry.label} texture.`)
                } finally {
                  URL.revokeObjectURL(objectUrl)
                  input.value = ''
                  setLoadingSlots((current) => {
                    const next = { ...current }
                    delete next[entry.slot]
                    return next
                  })
                }
              })()
            }}
          />
        </div>
      ))}
    </div>
  )
}

function MaterialPreviewSphere({ materialId }: { materialId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const interactionStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    rotationX: -0.18,
    rotationY: 0.62,
    targetRotationX: -0.18,
    targetRotationY: 0.62,
  })
  const materialName = useEditorStore((state) => state.materials[materialId]?.name ?? '')
  const materialMeshIds = useEditorStore((state) => state.materials[materialId]?.meshIds ?? null)
  const textureSlots = useEditorStore((state) => state.materials[materialId]?.textureSlots ?? null)
  const materialColor = useEditorStore((state) => state.materials[materialId]?.color)
  const materialEmissive = useEditorStore((state) => state.materials[materialId]?.emissive)
  const materialMetalness = useEditorStore((state) => state.materials[materialId]?.metalness)
  const materialRoughness = useEditorStore((state) => state.materials[materialId]?.roughness)
  const materialEmissiveIntensity = useEditorStore((state) => state.materials[materialId]?.emissiveIntensity)
  const materialEnvMapIntensity = useEditorStore((state) => state.materials[materialId]?.envMapIntensity)
  const materialEnvironmentOverrideId = useEditorStore((state) => state.materials[materialId]?.environmentOverrideId)
  const materialEnvironmentRotation = useEditorStore((state) => state.materials[materialId]?.environmentRotation)
  const environment = useEditorStore((state) => state.environment)
  const runtimeMaterialById = useEditorStore((state) => state.runtime.materialById)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const sceneEnvironmentMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const materialEnvironmentMaps = useEditorStore((state) => state.runtimeTextures.materialEnvironmentMaps)
  const sphereRef = useRef<THREE.Mesh | null>(null)
  const previewMaterialRef = useRef<THREE.Material | null>(null)
  const frameIdRef = useRef<number>(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const previewSourceState = useMemo(() => {
    if (!materialMeshIds) {
      return null
    }

    return {
      name: materialName,
      meshIds: materialMeshIds,
    }
  }, [materialMeshIds, materialName])
  const materialState = useMemo(() => {
    if (!materialMeshIds || !textureSlots) {
      return null
    }

    return {
      name: materialName,
      meshIds: materialMeshIds,
      textureSlots,
      color: materialColor,
      emissive: materialEmissive,
      metalness: materialMetalness,
      roughness: materialRoughness,
      emissiveIntensity: materialEmissiveIntensity,
      envMapIntensity: materialEnvMapIntensity,
      environmentOverrideId: materialEnvironmentOverrideId,
      environmentRotation: materialEnvironmentRotation,
    }
  }, [
    materialColor,
    materialEmissive,
    materialEmissiveIntensity,
    materialEnvMapIntensity,
    materialEnvironmentOverrideId,
    materialEnvironmentRotation,
    materialMeshIds,
    materialMetalness,
    materialName,
    materialRoughness,
    textureSlots,
  ])
  const resolvedPreview = useMemo(() => {
    if (!previewSourceState) {
      return null
    }

    return resolvePreviewRuntimeMaterial(materialId, previewSourceState, runtimeMaterialById, runtimeObjectById)
  }, [materialId, previewSourceState, runtimeMaterialById, runtimeObjectById])

  const textureSelectionKey = useMemo(() => {
    if (!materialState) {
      return ''
    }

    return EDITABLE_TEXTURE_SLOTS.map(({ slot }) => {
      const selection = materialState.textureSlots[slot]?.selectedSource ?? 'none'
      const runtimeMaterial = resolvedPreview?.material as PreviewCapableMaterial | null
      const originalTexture = runtimeMaterial ? getOriginalTextureForSlot(runtimeMaterial, slot) : null
      const customTexture = runtimeMaterial ? getCustomTextureForSlot(runtimeMaterial, slot) : null
      return `${slot}:${selection}:${originalTexture?.uuid ?? 'none'}:${customTexture?.uuid ?? 'none'}`
    }).join('|')
  }, [materialState, resolvedPreview])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#131c22')
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)
    camera.position.set(0, 0.06, 4.75)

    const ambientLight = new THREE.AmbientLight('#d7e4ec', 1.9)
    const keyLight = new THREE.DirectionalLight('#fffaf2', 2.8)
    keyLight.position.set(2.8, 2.4, 4.8)
    const fillLight = new THREE.DirectionalLight('#abc5d5', 1.45)
    fillLight.position.set(-2.8, 1.1, 3.4)
    const rimLight = new THREE.DirectionalLight('#89a4b6', 0.8)
    rimLight.position.set(0.8, -2.2, 2.8)
    const hemiLight = new THREE.HemisphereLight('#f0f6fa', '#172026', 1.05)

    scene.add(ambientLight, keyLight, fillLight, rimLight, hemiLight)

    const initialMaterial = buildFallbackPreviewMaterial()
    const sphereGeometry = buildPreviewSphereGeometry(initialMaterial as PreviewCapableMaterial)
    const sphere = new THREE.Mesh(sphereGeometry, initialMaterial)
    sphere.position.y = 0.08
    sphere.rotation.x = interactionStateRef.current.rotationX
    sphere.rotation.y = interactionStateRef.current.rotationY
    sphere.scale.setScalar(0.9)
    sphereRef.current = sphere
    previewMaterialRef.current = initialMaterial
    scene.add(sphere)

    const backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 64),
      new THREE.MeshBasicMaterial({
        color: '#1a252d',
        transparent: true,
        opacity: 0.94,
      }),
    )
    backdrop.position.set(0, 0, -1.2)
    scene.add(backdrop)

    const resize = () => {
      const width = Math.max(220, Math.round(canvas.clientWidth || 280))
      const height = Math.max(180, Math.round(canvas.clientHeight || 220))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    resize()
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(canvas)
    resizeObserverRef.current = resizeObserver

    const handlePointerDown = (event: PointerEvent) => {
      interactionStateRef.current.isDragging = true
      interactionStateRef.current.pointerId = event.pointerId
      interactionStateRef.current.lastX = event.clientX
      interactionStateRef.current.lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionStateRef.current
      if (!interaction.isDragging || interaction.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.clientX - interaction.lastX
      const deltaY = event.clientY - interaction.lastY
      interaction.lastX = event.clientX
      interaction.lastY = event.clientY

      interaction.rotationY += deltaX * 0.01
      interaction.rotationX = THREE.MathUtils.clamp(interaction.rotationX + deltaY * 0.008, -0.65, 0.28)
      interaction.targetRotationY = interaction.rotationY
      interaction.targetRotationX = interaction.rotationX
    }

    const stopDragging = (event: PointerEvent) => {
      const interaction = interactionStateRef.current
      if (interaction.pointerId !== event.pointerId) {
        return
      }

      interaction.isDragging = false
      interaction.pointerId = -1
      interaction.targetRotationX = -0.18
      interaction.targetRotationY = 0.62
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', stopDragging)
    canvas.addEventListener('pointercancel', stopDragging)

    const renderFrame = () => {
      const interaction = interactionStateRef.current
      if (interaction.isDragging) {
        sphere.rotation.x = interaction.rotationX
        sphere.rotation.y = interaction.rotationY
      } else {
        interaction.rotationX = THREE.MathUtils.lerp(interaction.rotationX, -0.18, 0.045)
        interaction.rotationY = THREE.MathUtils.lerp(interaction.rotationY, interaction.targetRotationY, 0.035)
        interaction.targetRotationY += 0.0008333333333333334
        sphere.rotation.x = interaction.rotationX
        sphere.rotation.y = interaction.rotationY
      }
      renderer.render(scene, camera)
      frameIdRef.current = window.requestAnimationFrame(renderFrame)
    }
    renderFrame()

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', stopDragging)
      canvas.removeEventListener('pointercancel', stopDragging)
      window.cancelAnimationFrame(frameIdRef.current)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      sphereGeometry.dispose()
      backdrop.geometry.dispose()
      ;(backdrop.material as THREE.Material).dispose()
      previewMaterialRef.current?.dispose()
      previewMaterialRef.current = null
      sphereRef.current = null
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const sphere = sphereRef.current
    if (!sphere || !materialState) {
      return
    }

    const resolvedMaterial = resolvedPreview?.material as PreviewCapableMaterial | null
    const nextPreviewMaterial =
      resolvedMaterial != null
        ? cloneMaterialForPreview(resolvedMaterial)
        : buildFallbackPreviewMaterial(materialState)

    applyPreviewTextureSelections(
      nextPreviewMaterial as PreviewCapableMaterial,
      materialState,
      resolvedMaterial as PreviewCapableMaterial | null,
    )
    applyPreviewMaterialState(nextPreviewMaterial as PreviewCapableMaterial, materialState)
    applyPreviewEnvironment(
      nextPreviewMaterial as PreviewCapableMaterial,
      materialState,
      environment,
      sceneEnvironmentMap,
      materialEnvironmentMaps,
    )
    markPreviewTexturesForUpdate(nextPreviewMaterial)

    const requiresVertexColors = Boolean((nextPreviewMaterial as PreviewCapableMaterial).vertexColors)
    const hasVertexColors = sphere.geometry.getAttribute('color') != null

    if (requiresVertexColors !== hasVertexColors) {
      sphere.geometry.dispose()
      sphere.geometry = buildPreviewSphereGeometry(nextPreviewMaterial as PreviewCapableMaterial)
    }

    const previousMaterial = previewMaterialRef.current
    sphere.material = nextPreviewMaterial
    previewMaterialRef.current = nextPreviewMaterial
    previousMaterial?.dispose()
  }, [
    resolvedPreview,
    textureSelectionKey,
  ])

  useEffect(() => {
    const material = previewMaterialRef.current as PreviewCapableMaterial | null
    if (!material || !materialState) {
      return
    }

    applyPreviewMaterialState(material, materialState)
    applyPreviewEnvironment(material, materialState, environment, sceneEnvironmentMap, materialEnvironmentMaps)
    markPreviewTexturesForUpdate(material)
  }, [
    environment,
    materialEnvironmentMaps,
    materialState?.color,
    materialState?.emissive,
    materialState?.metalness,
    materialState?.roughness,
    materialState?.emissiveIntensity,
    materialState?.envMapIntensity,
    materialState?.environmentOverrideId,
    materialState?.environmentRotation,
    sceneEnvironmentMap,
  ])

  return (
    <div className="material-preview">
      <canvas ref={canvasRef} className="material-preview__canvas" />
    </div>
  )
}

function MaterialIdentity({
  materialId,
  isCollapsed,
  onToggle,
}: {
  materialId: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  const hasMaterial = useEditorStore((state) => Boolean(state.materials[materialId]))
  const materialName = useEditorStore((state) => state.materials[materialId]?.name ?? '')
  const meshCount = useEditorStore((state) => state.materials[materialId]?.meshIds.length ?? 0)

  if (!hasMaterial) {
    return null
  }

  const usedByLabel = `Used by: ${meshCount} ${meshCount === 1 ? 'mesh' : 'meshes'}`

  return (
    <section className="inspector-section material-inspector-summary">
      <div className="inspector-section__header">
        <span>Material Summary</span>
        <button type="button" className="inspector-section__toggle" onClick={onToggle} aria-label={isCollapsed ? 'Expand Material Summary' : 'Collapse Material Summary'}>
          <SectionChevron isCollapsed={isCollapsed} />
        </button>
      </div>
      {!isCollapsed ? <div className="inspector-section__body material-inspector-summary__body">
        <div className="material-inspector-summary__text">
          <p className="material-inspector-summary__name">{materialName || 'Unnamed Material'}</p>
          <p className="material-inspector-summary__meta">{usedByLabel}</p>
        </div>
        <MaterialPreviewSphere materialId={materialId} />
        <MaterialTextureList materialId={materialId} />
      </div> : null}
    </section>
  )
}

function MaterialEnvironmentControls({ materialId }: { materialId: string }) {
  const material = useEditorStore((state) => state.materials[materialId] ?? null)
  const materialEnvironments = useEditorStore((state) => state.materialEnvironments)
  const environmentEnabled = useEditorStore((state) => state.environment.isEnvironmentEnabled)
  const environmentRotation = useEditorStore((state) => state.environment.rotation)
  const environmentSource = useEditorStore((state) => state.environment.source ?? state.assets.reflections)
  const environmentSourceUrl = useEditorStore((state) => state.assets.reflectionsUrl)
  const defaultEnvUrl = useEditorStore((state) => state.defaultEnvUrl)
  const sceneEnvironmentMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const previewMaterialEnvironmentId = useEditorStore((state) => state.environment.previewMaterialEnvironmentId)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const upsertMaterialEnvironment = useEditorStore((state) => state.upsertMaterialEnvironment)
  const removeMaterialEnvironment = useEditorStore((state) => state.removeMaterialEnvironment)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setStatus = useEditorStore((state) => state.setStatus)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const environmentSliderGestureActiveRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingSelectValue, setPendingSelectValue] = useState<string | null>(null)

  if (!material) {
    return null
  }

  const currentSceneStandardPreset = getStandardEnvironmentPresetByUrl(environmentSourceUrl ?? defaultEnvUrl)
  const standardEnvironmentOptions = useMemo(
    () =>
      STANDARD_ENVIRONMENT_PRESETS.filter((preset) => preset.id !== currentSceneStandardPreset?.id).map((preset) => ({
        id: createStandardMaterialEnvironmentId(preset.id),
        presetId: preset.id,
        label: preset.label,
        kind: preset.kind,
      })),
    [currentSceneStandardPreset?.id],
  )
  const customEnvironmentOptions = useMemo(
    () =>
      Object.values(materialEnvironments)
        .filter((entry) => !STANDARD_ENVIRONMENT_PRESETS.some((preset) => createStandardMaterialEnvironmentId(preset.id) === entry.id))
        .filter((entry) => !getStandardEnvironmentPresetByLabel(entry.label))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [materialEnvironments],
  )

  const usesSceneEnvironment = !material.environmentOverrideId
  const hasActiveSceneEnvironment = environmentEnabled && Boolean(sceneEnvironmentMap)
  const isSceneEnvironmentUnavailable = usesSceneEnvironment && !hasActiveSceneEnvironment
  const hasAnyEnvironmentChoice =
    hasActiveSceneEnvironment || standardEnvironmentOptions.length > 0 || customEnvironmentOptions.length > 0
  const isEnvironmentSelectorDisabled = !hasAnyEnvironmentChoice
  const rotationValue = usesSceneEnvironment ? environmentRotation : material.environmentRotation ?? 0
  const activeOverrideEntry = material.environmentOverrideId ? materialEnvironments[material.environmentOverrideId] ?? null : null
  const activeStandardPreset =
    STANDARD_ENVIRONMENT_PRESETS.find((preset) => createStandardMaterialEnvironmentId(preset.id) === material.environmentOverrideId) ??
    getStandardEnvironmentPresetByLabel(activeOverrideEntry?.label)
  const activeLabel =
    activeStandardPreset
      ? activeStandardPreset.label
      : activeOverrideEntry
        ? activeOverrideEntry.label.replace(/\.(hdr|exr|jpg|jpeg|png)$/i, '')
        : getSceneEnvironmentOptionLabel(environmentSource, defaultEnvUrl)
  const deletableCustomEnvironment = activeOverrideEntry && !activeStandardPreset ? activeOverrideEntry : null
  const resolvedSelectValue = activeStandardPreset
    ? `standard:${activeStandardPreset.id}`
    : activeOverrideEntry
      ? `custom:${material.environmentOverrideId}`
      : 'scene'
  const activeSelectValue = pendingSelectValue ?? resolvedSelectValue

  useEffect(() => {
    if (!previewMaterialEnvironmentId) {
      return
    }

    const clearMaterialEnvironmentPreview = () => {
      useEditorStore.getState().setEnvironment({
        previewMaterialEnvironmentId: null,
        previewReflections: false,
      })
    }

    window.addEventListener('pointerup', clearMaterialEnvironmentPreview)
    window.addEventListener('pointercancel', clearMaterialEnvironmentPreview)
    window.addEventListener('mouseup', clearMaterialEnvironmentPreview)
    window.addEventListener('touchend', clearMaterialEnvironmentPreview)
    window.addEventListener('blur', clearMaterialEnvironmentPreview)

    return () => {
      window.removeEventListener('pointerup', clearMaterialEnvironmentPreview)
      window.removeEventListener('pointercancel', clearMaterialEnvironmentPreview)
      window.removeEventListener('mouseup', clearMaterialEnvironmentPreview)
      window.removeEventListener('touchend', clearMaterialEnvironmentPreview)
      window.removeEventListener('blur', clearMaterialEnvironmentPreview)
    }
  }, [previewMaterialEnvironmentId])

  useEffect(() => {
    if (pendingSelectValue && pendingSelectValue === resolvedSelectValue) {
      setPendingSelectValue(null)
    }
  }, [pendingSelectValue, resolvedSelectValue])

  useEffect(() => {
    if (!isSceneEnvironmentUnavailable || material.environmentOverrideId || !standardEnvironmentOptions.length) {
      return
    }

    updateMaterial(materialId, {
      environmentOverrideId: standardEnvironmentOptions[0].id,
      environmentRotation: 0,
    })
  }, [
    standardEnvironmentOptions,
    isSceneEnvironmentUnavailable,
    material.environmentOverrideId,
    materialId,
    updateMaterial,
  ])

  useEffect(() => {
    return () => {
      endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)
    }
  }, [endHistoryGesture])

  return (
    <>
      <div className={`material-environment-control${deletableCustomEnvironment ? ' material-environment-control--with-remove' : ''}`}>
        <div className={`material-environment-control__field${isEnvironmentSelectorDisabled ? ' is-disabled' : ''}`} title={activeLabel}>
          <select
            className={`material-asset-control__select${isEnvironmentSelectorDisabled ? ' is-disabled' : ''}`}
            disabled={isEnvironmentSelectorDisabled || isLoading}
            value={activeSelectValue}
            onChange={(event) => {
              const nextValue = event.currentTarget.value

              if (nextValue === 'scene') {
                setPendingSelectValue('scene')
                updateMaterial(materialId, { environmentOverrideId: null, environmentRotation: 0 })
                return
              }

              if (nextValue.startsWith('custom:')) {
                setPendingSelectValue(nextValue)
                updateMaterial(materialId, {
                  environmentOverrideId: nextValue.slice('custom:'.length),
                  environmentRotation: 0,
                })
                return
              }

              if (!nextValue.startsWith('standard:')) {
                return
              }

              const preset = getStandardEnvironmentPresetById(nextValue.slice('standard:'.length))
              if (!preset) {
                return
              }

              const nextEnvironmentId = createStandardMaterialEnvironmentId(preset.id)
              setPendingSelectValue(nextValue)
              updateMaterial(materialId, {
                environmentOverrideId: nextEnvironmentId,
                environmentRotation: 0,
              })

              if (materialEnvironments[nextEnvironmentId]) {
                return
              }

              setIsLoading(true)

              void (async () => {
                try {
                  const texture = await loadEnvironmentTexture(preset.url, preset.label)
                  texture.name = preset.label
                  upsertMaterialEnvironment(
                    {
                      id: nextEnvironmentId,
                      label: preset.label,
                      kind: preset.kind,
                      assetUrl: preset.url,
                    },
                    texture,
                  )
                } catch (error) {
                  console.error(error)
                  setPendingSelectValue(null)
                  setStatus(`Failed to load material HDRI: ${preset.label}`)
                } finally {
                  setIsLoading(false)
                }
              })()
            }}
          >
            <option value="scene" disabled={!hasActiveSceneEnvironment}>
              {hasActiveSceneEnvironment ? getSceneEnvironmentOptionLabel(environmentSource, defaultEnvUrl) : 'Scene HDRI unavailable'}
            </option>
            {standardEnvironmentOptions.map((entry) => (
              <option key={entry.id} value={`standard:${entry.presetId}`}>
                {entry.label}
              </option>
            ))}
            {customEnvironmentOptions.map((entry) => (
              <option key={entry.id} value={`custom:${entry.id}`}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        {deletableCustomEnvironment ? (
          <button
            type="button"
            className="material-asset-control__menu-remove"
            aria-label={`Delete ${deletableCustomEnvironment.label}`}
            onClick={() => {
              removeMaterialEnvironment(deletableCustomEnvironment.id)
            }}
          >
            ?
          </button>
        ) : null}
        <button
          type="button"
          className="material-asset-control__button material-asset-control__button--compact"
          onClick={() => inputRef.current?.click()}
        >
          {isLoading ? 'Loading HDRI' : 'Load HDRI'}
        </button>
      </div>
      <div className="grid-two">
        <label className="field">
          <span>
            Env Map Intensity <output>{formatNumber(material.envMapIntensity ?? 1)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.01"
            value={material.envMapIntensity ?? 1}
            onInput={(event) => {
              beginInspectorGesture(environmentSliderGestureActiveRef, beginHistoryGesture)
              updateMaterial(materialId, { envMapIntensity: Number(event.currentTarget.value) })
            }}
            onPointerUp={() => endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)}
            onPointerCancel={() => endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)}
            onBlur={() => endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)}
          />
        </label>
      </div>
      <label className={`left-slider material-environment-rotation${isEnvironmentSelectorDisabled ? ' is-disabled' : ''}`}>
        <span>Rotation</span>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          disabled={isEnvironmentSelectorDisabled}
          value={rotationValue}
          onInput={(event) => {
            beginInspectorGesture(environmentSliderGestureActiveRef, beginHistoryGesture)
            const nextValue = Number(event.currentTarget.value)

            if (usesSceneEnvironment) {
              setEnvironment({ rotation: nextValue })
              return
            }

            updateMaterial(materialId, { environmentRotation: nextValue })
            setEnvironment({ previewMaterialEnvironmentRotation: nextValue })
          }}
          onPointerDown={() => {
            if (usesSceneEnvironment) {
              setEnvironment({ previewReflections: true })
              return
            }

            if (material.environmentOverrideId) {
              setEnvironment({
                previewMaterialEnvironmentId: material.environmentOverrideId,
                previewMaterialEnvironmentRotation: material.environmentRotation ?? 0,
              })
            }
          }}
          onPointerUp={() =>
            {
              endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)
              setEnvironment({
                previewReflections: false,
                previewMaterialEnvironmentId: null,
              })
            }
          }
          onPointerCancel={() =>
            {
              endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)
              setEnvironment({
                previewReflections: false,
                previewMaterialEnvironmentId: null,
              })
            }
          }
          onBlur={() =>
            {
              endInspectorGesture(environmentSliderGestureActiveRef, endHistoryGesture)
              setEnvironment({
                previewReflections: false,
                previewMaterialEnvironmentId: null,
              })
            }
          }
        />
        <strong>{formatDegrees(rotationValue)}</strong>
      </label>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".hdr,.exr,.jpg,.jpeg,.png,image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) {
            return
          }

          const objectUrl = createObjectUrl(file)
          setIsLoading(true)

          void (async () => {
            try {
              const texture = await loadEnvironmentTexture(objectUrl, file.name)
              texture.name = file.name

              const id = createMaterialEnvironmentId(file.name)
              upsertMaterialEnvironment(
                {
                  id,
                  label: file.name,
                  kind: isHdriAsset(file.name) ? 'hdri' : 'panorama',
                  assetUrl: objectUrl,
                  fileSize: file.size,
                },
                texture,
              )
              updateMaterial(materialId, { environmentOverrideId: id, environmentRotation: 0 })
              setPendingSelectValue(`custom:${id}`)
              setStatus(`Material HDRI loaded: ${file.name}`)
            } catch (error) {
              console.error(error)
              setPendingSelectValue(null)
              setStatus(`Failed to load material HDRI: ${file.name}`)
            } finally {
              URL.revokeObjectURL(objectUrl)
              event.currentTarget.value = ''
              setIsLoading(false)
            }
          })()
        }}
      />
    </>
  )
}

function MaterialBaseSection({
  materialId,
  isCollapsed,
  onToggle,
}: {
  materialId: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  const material = useEditorStore((state) => state.materials[materialId])
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const runtimeMaterialById = useEditorStore((state) => state.runtime.materialById)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const setStatus = useEditorStore((state) => state.setStatus)
  const atlasLoaded = useEditorStore((state) => Boolean(state.assets.atlas && state.runtimeTextures.atlasTexture))
  const [isLoadingBaseColorTexture, setIsLoadingBaseColorTexture] = useState(false)
  const baseColorInputRef = useRef<HTMLInputElement | null>(null)
  const isBaseColorGestureActiveRef = useRef(false)
  const materialSliderGestureActiveRef = useRef(false)

  const resolvedMaterial = useMemo(() => {
    if (!material) {
      return null
    }
    return resolvePreviewRuntimeMaterial(materialId, material, runtimeMaterialById, runtimeObjectById)
      .material as PreviewCapableMaterial | null
  }, [material, materialId, runtimeMaterialById, runtimeObjectById])

  const resolvedBaseColor = useMemo(() => {
    const runtimeColor = resolvedMaterial?.color
    if (runtimeColor instanceof THREE.Color) {
      return `#${runtimeColor.getHexString()}`
    }

    return material?.color ?? '#ffffff'
  }, [material?.color, resolvedMaterial])

  if (!material) {
    return null
  }

  const baseColorTextureState = material.textureSlots.map
  const baseColorTextureSource = getSelectedTextureSource(baseColorTextureState)
  const hasBaseColorTexture = Boolean(baseColorTextureState.originalLabel || baseColorTextureState.customLabel)
  const isBaseColorOverriddenByFlipbook = isFlipbookTargetSlotOverridden(material.effect, atlasLoaded, 'map')
  const baseColorTextureValue = isBaseColorOverriddenByFlipbook ? 'flipbook' : (baseColorTextureSource ?? '')

  useEffect(() => {
    return () => {
      endInspectorGesture(isBaseColorGestureActiveRef, endHistoryGesture)
      endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)
    }
  }, [endHistoryGesture])

  return (
    <SectionPanel title="Base Material" isCollapsed={isCollapsed} onToggle={onToggle}>
      <div className="material-texture-row base-material-texture-row">
        <div className="material-asset-control material-asset-control--with-swatch">
          <label className="material-color-swatch" title={`Base Color: ${resolvedBaseColor}`}>
            <input
              type="color"
              value={resolvedBaseColor}
              onInput={(event) => {
                beginInspectorGesture(isBaseColorGestureActiveRef, beginHistoryGesture)
                updateMaterial(materialId, { color: event.currentTarget.value })
              }}
              onChange={(event) => updateMaterial(materialId, { color: event.currentTarget.value })}
              onBlur={() => endInspectorGesture(isBaseColorGestureActiveRef, endHistoryGesture)}
            />
            <span className="material-color-swatch__chip" style={{ backgroundColor: resolvedBaseColor }} />
          </label>
          <select
            className="material-asset-control__select material-texture-row__select"
            value={baseColorTextureValue}
            disabled={!hasBaseColorTexture || isBaseColorOverriddenByFlipbook}
            onChange={(event) => {
              const nextSource = event.currentTarget.value as 'original' | 'custom'
              updateMaterial(materialId, {
                textureSlots: {
                  ...material.textureSlots,
                  map: {
                    ...material.textureSlots.map,
                    selectedSource: nextSource,
                  },
                },
              })
            }}
          >
            {isBaseColorOverriddenByFlipbook ? (
              <option value="flipbook">{getFlipbookTextureOptionLabel('Base Color')}</option>
            ) : null}
            {!hasBaseColorTexture ? <option value="">No texture</option> : null}
            {baseColorTextureState.originalLabel ? (
              <option value="original">Original: {baseColorTextureState.originalLabel}</option>
            ) : null}
            {baseColorTextureState.customLabel ? (
              <option value="custom">Custom: {baseColorTextureState.customLabel}</option>
            ) : null}
          </select>
          <button
            type="button"
            className="material-asset-control__button"
            disabled={!hasBaseColorTexture || isBaseColorOverriddenByFlipbook}
            onClick={() => baseColorInputRef.current?.click()}
          >
            {isLoadingBaseColorTexture ? 'Loading' : 'Replace'}
          </button>
        </div>
        <input
          ref={baseColorInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (!file) {
              return
            }

            const objectUrl = createObjectUrl(file)
            setIsLoadingBaseColorTexture(true)

            void (async () => {
              try {
                const texture = await loadTexture(objectUrl)
                texture.name = file.name

                const latestState = useEditorStore.getState()
                const latestMaterialState = latestState.materials[materialId]
                if (!latestMaterialState) {
                  texture.dispose()
                  return
                }

                const resolvedLatest = resolvePreviewRuntimeMaterial(
                  materialId,
                  latestMaterialState,
                  latestState.runtime.materialById,
                  latestState.runtime.objectById,
                ).material as PreviewCapableMaterial | null

                if (!resolvedLatest) {
                  texture.dispose()
                  latestState.setStatus('Failed to replace Base Color texture.')
                  return
                }

                const previousTexture =
                  getCustomTextureForSlot(resolvedLatest, 'map') ??
                  getOriginalTextureForSlot(resolvedLatest, 'map')
                const originalTexture = getOriginalTextureForSlot(resolvedLatest, 'map')
                copyTextureSettings(texture, previousTexture, 'map')
                texture.needsUpdate = true

                if (previousTexture && previousTexture !== originalTexture) {
                  previousTexture.dispose()
                }

                resolvedLatest.userData.customTextureSlots = {
                  ...(resolvedLatest.userData.customTextureSlots ?? {}),
                  map: texture,
                }
                resolvedLatest.map = texture
                resolvedLatest.needsUpdate = true

                registerMaterialRef(materialId, resolvedLatest)
                registerMaterialRef(`material:${resolvedLatest.uuid}`, resolvedLatest)
                updateMaterial(materialId, {
                  textureSlots: {
                    ...latestMaterialState.textureSlots,
                    map: {
                      ...latestMaterialState.textureSlots.map,
                      customLabel: file.name,
                      customUrl: objectUrl,
                      customFileSize: file.size,
                      selectedSource: 'custom',
                    },
                  },
                })
                setStatus(`Base Color texture updated: ${file.name}`)
              } catch (error) {
                console.error(error)
                setStatus('Failed to replace Base Color texture.')
              } finally {
                URL.revokeObjectURL(objectUrl)
                input.value = ''
                setIsLoadingBaseColorTexture(false)
              }
            })()
          }}
        />
      </div>
      <label className="field">
        <span>
          Metalness <output>{formatNumber(material.metalness ?? 0)}</output>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={material.metalness ?? 0}
          onInput={(event) => {
            beginInspectorGesture(materialSliderGestureActiveRef, beginHistoryGesture)
            updateMaterial(materialId, { metalness: Number(event.currentTarget.value) })
          }}
          onPointerUp={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
          onPointerCancel={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
          onBlur={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
        />
      </label>
      <label className="field">
        <span>
          Roughness <output>{formatNumber(material.roughness ?? 1)}</output>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={material.roughness ?? 1}
          onInput={(event) => {
            beginInspectorGesture(materialSliderGestureActiveRef, beginHistoryGesture)
            updateMaterial(materialId, { roughness: Number(event.currentTarget.value) })
          }}
          onPointerUp={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
          onPointerCancel={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
          onBlur={() => endInspectorGesture(materialSliderGestureActiveRef, endHistoryGesture)}
        />
      </label>
      <div className="material-environment-block">
        <p className="settings-note">Material Environment (HDRI)</p>
        <MaterialEnvironmentControls materialId={materialId} />
      </div>
    </SectionPanel>
  )
}

function EmissionSection({
  materialId,
  isCollapsed,
  onToggle,
}: {
  materialId: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  const material = useEditorStore((state) => state.materials[materialId])
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const runtimeMaterialById = useEditorStore((state) => state.runtime.materialById)
  const runtimeObjectById = useEditorStore((state) => state.runtime.objectById)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const setStatus = useEditorStore((state) => state.setStatus)
  const atlasLoaded = useEditorStore((state) => Boolean(state.assets.atlas && state.runtimeTextures.atlasTexture))
  const [isLoadingTexture, setIsLoadingTexture] = useState(false)
  const emissiveInputRef = useRef<HTMLInputElement | null>(null)
  const isEmissiveGestureActiveRef = useRef(false)
  const emissiveSliderGestureActiveRef = useRef(false)

  const resolvedMaterial = useMemo(() => {
    if (!material) {
      return null
    }
    return resolvePreviewRuntimeMaterial(materialId, material, runtimeMaterialById, runtimeObjectById)
      .material as PreviewCapableMaterial | null
  }, [material, materialId, runtimeMaterialById, runtimeObjectById])

  const resolvedEmissiveColor = useMemo(() => {
    const runtimeEmissive = resolvedMaterial?.emissive
    if (runtimeEmissive instanceof THREE.Color) {
      return `#${runtimeEmissive.getHexString()}`
    }

    return material?.emissive ?? '#000000'
  }, [material?.emissive, resolvedMaterial])

  if (!material) {
    return null
  }

  const emissiveTextureState = material.textureSlots.emissiveMap
  const emissiveTextureSource = getSelectedTextureSource(emissiveTextureState)
  const hasEmissiveTexture = Boolean(emissiveTextureState.originalLabel || emissiveTextureState.customLabel)
  const isEmissiveOverriddenByFlipbook = isFlipbookTargetSlotOverridden(material.effect, atlasLoaded, 'emissiveMap')
  const emissiveTextureValue = isEmissiveOverriddenByFlipbook ? 'flipbook' : (emissiveTextureSource ?? '')

  useEffect(() => {
    return () => {
      endInspectorGesture(isEmissiveGestureActiveRef, endHistoryGesture)
      endInspectorGesture(emissiveSliderGestureActiveRef, endHistoryGesture)
    }
  }, [endHistoryGesture])

  return (
    <SectionPanel title="Emission" isCollapsed={isCollapsed} onToggle={onToggle}>
      <div className="material-texture-row emission-texture-row">
        <div className="material-asset-control material-asset-control--with-swatch">
          <label className="material-color-swatch" title={`Emissive Color: ${resolvedEmissiveColor}`}>
            <input
              type="color"
              value={resolvedEmissiveColor}
              onInput={(event) => {
                beginInspectorGesture(isEmissiveGestureActiveRef, beginHistoryGesture)
                updateMaterial(materialId, { emissive: event.currentTarget.value })
              }}
              onChange={(event) => updateMaterial(materialId, { emissive: event.currentTarget.value })}
              onBlur={() => endInspectorGesture(isEmissiveGestureActiveRef, endHistoryGesture)}
            />
            <span className="material-color-swatch__chip" style={{ backgroundColor: resolvedEmissiveColor }} />
          </label>
          <select
            className="material-asset-control__select material-texture-row__select"
            value={emissiveTextureValue}
            disabled={!hasEmissiveTexture || isEmissiveOverriddenByFlipbook}
            onChange={(event) => {
              const nextSource = event.currentTarget.value as 'original' | 'custom'
              updateMaterial(materialId, {
                textureSlots: {
                  ...material.textureSlots,
                  emissiveMap: {
                    ...material.textureSlots.emissiveMap,
                    selectedSource: nextSource,
                  },
                },
              })
            }}
          >
            {isEmissiveOverriddenByFlipbook ? (
              <option value="flipbook">{getFlipbookTextureOptionLabel('Emissive')}</option>
            ) : null}
            {!hasEmissiveTexture ? <option value="">No texture</option> : null}
            {emissiveTextureState.originalLabel ? (
              <option value="original">Original: {emissiveTextureState.originalLabel}</option>
            ) : null}
            {emissiveTextureState.customLabel ? (
              <option value="custom">Custom: {emissiveTextureState.customLabel}</option>
            ) : null}
          </select>
          <button
            type="button"
            className="material-asset-control__button"
            disabled={!hasEmissiveTexture || isEmissiveOverriddenByFlipbook}
            onClick={() => emissiveInputRef.current?.click()}
          >
            {isLoadingTexture ? 'Loading' : 'Replace'}
          </button>
        </div>
        <input
          ref={emissiveInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            if (!file) {
              return
            }

            const objectUrl = createObjectUrl(file)
            setIsLoadingTexture(true)

            void (async () => {
              try {
                const texture = await loadTexture(objectUrl)
                texture.name = file.name

                const latestState = useEditorStore.getState()
                const latestMaterialState = latestState.materials[materialId]
                if (!latestMaterialState) {
                  texture.dispose()
                  return
                }

                const resolvedLatest = resolvePreviewRuntimeMaterial(
                  materialId,
                  latestMaterialState,
                  latestState.runtime.materialById,
                  latestState.runtime.objectById,
                ).material as PreviewCapableMaterial | null

                if (!resolvedLatest) {
                  texture.dispose()
                  latestState.setStatus('Failed to replace Emissive texture.')
                  return
                }

                const previousTexture =
                  getCustomTextureForSlot(resolvedLatest, 'emissiveMap') ??
                  getOriginalTextureForSlot(resolvedLatest, 'emissiveMap')
                const originalTexture = getOriginalTextureForSlot(resolvedLatest, 'emissiveMap')
                copyTextureSettings(texture, previousTexture, 'emissiveMap')
                texture.needsUpdate = true

                if (previousTexture && previousTexture !== originalTexture) {
                  previousTexture.dispose()
                }

                resolvedLatest.userData.customTextureSlots = {
                  ...(resolvedLatest.userData.customTextureSlots ?? {}),
                  emissiveMap: texture,
                }
                resolvedLatest.emissiveMap = texture
                resolvedLatest.needsUpdate = true

                registerMaterialRef(materialId, resolvedLatest)
                registerMaterialRef(`material:${resolvedLatest.uuid}`, resolvedLatest)
                updateMaterial(materialId, {
                  textureSlots: {
                    ...latestMaterialState.textureSlots,
                    emissiveMap: {
                      ...latestMaterialState.textureSlots.emissiveMap,
                      customLabel: file.name,
                      customUrl: objectUrl,
                      customFileSize: file.size,
                      selectedSource: 'custom',
                    },
                  },
                })
                setStatus(`Emissive texture updated: ${file.name}`)
              } catch (error) {
                console.error(error)
                setStatus('Failed to replace Emissive texture.')
              } finally {
                URL.revokeObjectURL(objectUrl)
                input.value = ''
                setIsLoadingTexture(false)
              }
            })()
          }}
        />
      </div>
      <label className="field">
        <span>
          Emissive Intensity <output>{formatNumber(material.emissiveIntensity ?? 1)}</output>
        </span>
        <input
          type="range"
          min="0"
          max="10"
          step="0.01"
          value={material.emissiveIntensity ?? 1}
          onInput={(event) => {
            beginInspectorGesture(emissiveSliderGestureActiveRef, beginHistoryGesture)
            updateMaterial(materialId, { emissiveIntensity: Number(event.currentTarget.value) })
          }}
          onPointerUp={() => endInspectorGesture(emissiveSliderGestureActiveRef, endHistoryGesture)}
          onPointerCancel={() => endInspectorGesture(emissiveSliderGestureActiveRef, endHistoryGesture)}
          onBlur={() => endInspectorGesture(emissiveSliderGestureActiveRef, endHistoryGesture)}
        />
      </label>
    </SectionPanel>
  )
}

function AtlasPreviewCanvas({ materialId }: { materialId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const effect = useEditorStore((state) => state.materials[materialId]?.effect)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !effect) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const image = atlasTexture?.image as CanvasImageSource & { width?: number; height?: number } | undefined
    const imageWidth = image?.width ?? 512
    const imageHeight = image?.height ?? 512
    const width = 360
    const height = Math.max(220, Math.round(width * (imageHeight / imageWidth)))
    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#06090c'
    ctx.fillRect(0, 0, width, height)

    if (image) {
      ctx.save()
      ctx.globalAlpha = Math.min(Math.max(effect.opacity, 0), 1)
      ctx.drawImage(image, 0, 0, width, height)
      ctx.restore()
    }

    const columns = Math.max(1, effect.gridX)
    const rows = Math.max(1, effect.gridY)
    const cellWidth = width / columns
    const cellHeight = height / rows
    const activeFrame = Math.min(
      Math.max(0, effect.currentFrame),
      Math.max(0, columns * rows - 1),
    )
    const activeColumn =
      effect.frameOrder === 'column' ? Math.floor(activeFrame / rows) : activeFrame % columns
    const activeRow =
      effect.frameOrder === 'column' ? activeFrame % rows : Math.floor(activeFrame / columns)

    ctx.save()
    ctx.strokeStyle = 'rgba(236, 244, 248, 0.18)'
    ctx.lineWidth = 1
    for (let column = 1; column < columns; column += 1) {
      const x = Math.round(column * cellWidth) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let row = 1; row < rows; row += 1) {
      const y = Math.round(row * cellHeight) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()

    ctx.fillStyle = 'rgba(113, 179, 214, 0.18)'
    ctx.fillRect(activeColumn * cellWidth, activeRow * cellHeight, cellWidth, cellHeight)
    ctx.strokeStyle = '#9bd3f0'
    ctx.lineWidth = 2
    ctx.strokeRect(activeColumn * cellWidth + 1, activeRow * cellHeight + 1, cellWidth - 2, cellHeight - 2)
  }, [atlasTexture, effect])

  if (!effect || !atlasTexture) {
    return null
  }

  return (
    <div className="atlas-preview-wrap">
      <canvas ref={canvasRef} width={360} height={220} />
    </div>
  )
}

function AtlasEffectSection({
  materialId,
  isCollapsed,
  onToggle,
}: {
  materialId: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  const material = useEditorStore((state) => state.materials[materialId] ?? null)
  const atlasSource = useEditorStore((state) => state.assets.atlas)
  const atlasLoaded = useEditorStore((state) => Boolean(state.assets.atlas && state.runtimeTextures.atlasTexture))
  const updateMaterialEffect = useEditorStore((state) => state.updateMaterialEffect)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const atlasInputRef = useRef<HTMLInputElement | null>(null)

  if (!material) {
    return null
  }

  const totalFrames = Math.max(1, material.effect.gridX * material.effect.gridY)

  const activeEffects = material.effect.isAdded
      ? [
        {
          id: 'anim',
          label: 'Flipbook Animation',
          enabled: material.effect.enabled,
        },
      ]
    : []

  return (
    <SectionPanel title="Material Effects" isCollapsed={isCollapsed} onToggle={onToggle}>
      <div className="fx-buttons-row material-effects-buttons-row">
        <button
          type="button"
          className={`tool-button effect-create-button ${material.effect.isAdded ? 'is-active' : ''}`}
          onClick={() => updateMaterialEffect(materialId, { isAdded: true, enabled: true })}
        >
          <span className="tool-button__glyph">FLIPBOOK</span>
          <span className="tool-button__label">{material.effect.isAdded ? 'Added' : 'Create'}</span>
        </button>
      </div>

      <div className="material-effects-list" aria-label="Material effects list">
        {activeEffects.length ? (
          activeEffects.map((effect) => (
            <div key={effect.id} className="material-effects-list__row">
              <span className="material-effects-list__label">{effect.label}</span>
              <div className="material-effects-list__actions">
                <button
                  type="button"
                  className={`material-effects-list__icon-button${effect.enabled ? ' is-active' : ''}`}
                  aria-label={effect.enabled ? `Hide ${effect.label}` : `Show ${effect.label}`}
                  title={effect.enabled ? `Hide ${effect.label}` : `Show ${effect.label}`}
                  onClick={() => updateMaterialEffect(materialId, { enabled: !effect.enabled })}
                >
                  <EyeIcon isOpen={effect.enabled} />
                </button>
                <button
                  type="button"
                  className="material-effects-list__icon-button"
                  aria-label={`Remove ${effect.label}`}
                  title={`Remove ${effect.label}`}
                  onClick={() => updateMaterialEffect(materialId, { isAdded: false, enabled: false })}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="material-effects-list__row material-effects-list__row--empty" aria-hidden="true" />
        )}
      </div>

      {material.effect.isAdded ? (
        <>
          <p className="left-controls__label material-effect-active-title">Flipbook Animation</p>

          <div className="material-effect-toolbar">
            <button
              type="button"
              className={`material-asset-control__select material-asset-control__select-button material-effect-toolbar__atlas${!atlasLoaded ? ' is-disabled' : ''}`}
              disabled
              aria-label={atlasLoaded ? `Atlas texture: ${getAssetName(atlasSource, 'Atlas texture')}` : 'No atlas texture loaded'}
            >
              <span className="material-asset-control__select-label">
                {atlasLoaded ? getAssetName(atlasSource, 'Atlas texture') : 'No texture'}
              </span>
              <span className="material-asset-control__chevron">⌄</span>
            </button>

            <button
              type="button"
              className="material-asset-control__button material-effect-toolbar__load"
              onClick={() => atlasInputRef.current?.click()}
            >
              <span className="material-effect-toolbar__load-line">Atlas</span>
              <span className="material-effect-toolbar__load-line">{atlasLoaded ? 'swap' : 'load'}</span>
            </button>

            <label className="material-effect-toolbar__target">
              <span className="material-effect-toolbar__target-label">Target Slot</span>
              <select
                className="material-asset-control__select"
                value={material.effect.targetSlot}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    targetSlot: event.currentTarget.value as typeof material.effect.targetSlot,
                  })
                }
              >
                <option value="emissive">Emissive</option>
                <option value="baseColor">Base Color</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>
              Opacity <output>{formatNumber(material.effect.opacity)}</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={material.effect.opacity}
              onInput={(event) => updateMaterialEffect(materialId, { opacity: Number(event.currentTarget.value) })}
            />
          </label>

          {atlasLoaded ? <AtlasPreviewCanvas materialId={materialId} /> : null}

          <div className="material-effect-setup-row">
            <label className="field field--compact-number">
              <span>Column</span>
              <input
                type="number"
                min="1"
                max="32"
                step="1"
                value={material.effect.gridX}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    gridX: Math.min(Math.max(1, Number(event.currentTarget.value) || 1), 32),
                  })
                }
              />
            </label>
            <label className="field field--compact-number">
              <span>Row</span>
              <input
                type="number"
                min="1"
                max="32"
                step="1"
                value={material.effect.gridY}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    gridY: Math.min(Math.max(1, Number(event.currentTarget.value) || 1), 32),
                  })
                }
              />
            </label>
            <label className="field field--compact-select">
              <span>Frame Order</span>
              <select
                value={material.effect.frameOrder}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    frameOrder: event.currentTarget.value as typeof material.effect.frameOrder,
                  })
                }
              >
                <option value="row">Row</option>
                <option value="column">Column</option>
              </select>
            </label>
            <label className="field field--compact-number material-effect-setup-row__fps">
              <span>FPS</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={material.effect.fps}
                onChange={(event) => updateMaterialEffect(materialId, { fps: Number(event.currentTarget.value) || 1 })}
              />
            </label>
          </div>

          <label className="field field--inline-range material-effect-current-frame">
            <span>
              Current Frame <output>{material.effect.currentFrame}</output>
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0, totalFrames - 1)}
              step="1"
              value={material.effect.currentFrame}
              onInput={(event) =>
                updateMaterialEffect(materialId, {
                  currentFrame: Number(event.currentTarget.value),
                  play: false,
                })
              }
            />
          </label>

          <div className="material-effect-playback-row">
            <button
              type="button"
              className={`tool-button material-effect-play-button${material.effect.play ? ' is-active' : ''}`}
              aria-label={material.effect.play ? 'Pause animation' : 'Play animation'}
              title={material.effect.play ? 'Pause animation' : 'Play animation'}
              onClick={() => updateMaterialEffect(materialId, { play: !material.effect.play })}
            >
              <PlayIcon isPlaying={material.effect.play} />
            </button>
            <label className="checkbox checkbox--bare material-effect-toggle">
              <input
                type="checkbox"
                checked={material.effect.frameBlend}
                onChange={(event) => updateMaterialEffect(materialId, { frameBlend: event.currentTarget.checked })}
              />
              <span>Frame Blend</span>
            </label>
            <label className="checkbox checkbox--bare material-effect-toggle material-effect-loop">
              <input
                type="checkbox"
                checked={material.effect.loop}
                onChange={(event) => updateMaterialEffect(materialId, { loop: event.currentTarget.checked })}
              />
              <span>Loop</span>
            </label>
          </div>

          <details className="panel-subsection">
            <summary>Advanced</summary>
            <div className="grid-two">
              <label className="field">
                <span>UV Channel</span>
                <select
                  value={material.effect.uvChannel}
                  onChange={(event) =>
                    updateMaterialEffect(materialId, {
                      uvChannel: event.currentTarget.value as typeof material.effect.uvChannel,
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="normal">Normal</option>
                  <option value="baseColor">BaseColor</option>
                  <option value="emissive">Emissive</option>
                  <option value="uv">UV</option>
                  <option value="uv2">UV2</option>
                </select>
              </label>
              <label className="field">
                <span>Wrap Mode</span>
                <select
                  value={material.effect.wrapMode}
                  onChange={(event) =>
                    updateMaterialEffect(materialId, {
                      wrapMode: event.currentTarget.value as typeof material.effect.wrapMode,
                    })
                  }
                >
                  <option value="repeat">Repeat</option>
                  <option value="clamp">Clamp</option>
                </select>
              </label>
            </div>

            <div className="grid-two">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={material.effect.swapXY}
                  onChange={(event) => updateMaterialEffect(materialId, { swapXY: event.currentTarget.checked })}
                />
                <span>Swap X / Y</span>
              </label>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>
                  Offset X <output>{formatNumber(material.effect.offsetX)}</output>
                </span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.01"
                  value={material.effect.offsetX}
                  onInput={(event) => updateMaterialEffect(materialId, { offsetX: Number(event.currentTarget.value) })}
                />
              </label>
              <label className="field">
                <span>
                  Offset Y <output>{formatNumber(material.effect.offsetY)}</output>
                </span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.01"
                  value={material.effect.offsetY}
                  onInput={(event) => updateMaterialEffect(materialId, { offsetY: Number(event.currentTarget.value) })}
                />
              </label>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>
                  Scale X <output>{formatNumber(material.effect.scaleX)}</output>
                </span>
                <input
                  type="range"
                  min="0.01"
                  max="4"
                  step="0.01"
                  value={material.effect.scaleX}
                  onInput={(event) => updateMaterialEffect(materialId, { scaleX: Number(event.currentTarget.value) })}
                />
              </label>
              <label className="field">
                <span>
                  Scale Y <output>{formatNumber(material.effect.scaleY)}</output>
                </span>
                <input
                  type="range"
                  min="0.01"
                  max="4"
                  step="0.01"
                  value={material.effect.scaleY}
                  onInput={(event) => updateMaterialEffect(materialId, { scaleY: Number(event.currentTarget.value) })}
                />
              </label>
            </div>

            <label className="field">
              <span>
                Rotation <output>{formatNumber(material.effect.rotation)}</output>
              </span>
              <input
                type="range"
                min="-180"
                max="180"
                step="0.1"
                value={material.effect.rotation}
                onInput={(event) => updateMaterialEffect(materialId, { rotation: Number(event.currentTarget.value) })}
              />
            </label>
          </details>
        </>
      ) : null}

      <input
        ref={atlasInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) {
            return
          }
          requestAtlasLoad({ url: createObjectUrl(file), label: file.name, revokeAfter: true, fileSize: file.size })
          event.currentTarget.value = ''
        }}
      />
    </SectionPanel>
  )
}

export function InspectorContent() {
  const [collapsedSectionsByMaterial, setCollapsedSectionsByMaterial] = useState<
    Record<string, Partial<Record<MaterialInspectorSectionKey, boolean>>>
  >({})
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const selectedObjectType = useEditorStore((state) =>
    selectedObjectId ? state.sceneGraph[selectedObjectId]?.type ?? null : null,
  )
  const selectedObjectIsMaterial = useEditorStore((state) =>
    selectedObjectId ? Boolean(state.materials[selectedObjectId]) : false,
  )
  const hasSelectedMaterial = useEditorStore((state) =>
    selectedMaterialId ? Boolean(state.materials[selectedMaterialId]) : false,
  )

  const resolvedMaterialId = resolveInspectorMaterialId({
    selectedObjectId,
    selectedObjectType,
    selectedObjectIsMaterial,
    selectedMaterialId,
    hasSelectedMaterial,
  })

  const hasResolvedMaterial = useEditorStore((state) =>
    resolvedMaterialId ? Boolean(state.materials[resolvedMaterialId]) : false,
  )

  if (!resolvedMaterialId || !hasResolvedMaterial) {
    return null
  }

  const isSectionCollapsed = (sectionKey: MaterialInspectorSectionKey) =>
    collapsedSectionsByMaterial[resolvedMaterialId]?.[sectionKey] ?? (sectionKey === 'effects')

  const toggleSection = (sectionKey: MaterialInspectorSectionKey) => {
    setCollapsedSectionsByMaterial((current) => ({
      ...current,
      [resolvedMaterialId]: {
        ...(current[resolvedMaterialId] ?? {}),
        [sectionKey]: !(current[resolvedMaterialId]?.[sectionKey] ?? false),
      },
    }))
  }

  return (
    <>
      <MaterialIdentity
        materialId={resolvedMaterialId}
        isCollapsed={isSectionCollapsed('summary')}
        onToggle={() => toggleSection('summary')}
      />
      <MaterialBaseSection
        materialId={resolvedMaterialId}
        isCollapsed={isSectionCollapsed('baseMaterial')}
        onToggle={() => toggleSection('baseMaterial')}
      />
      <EmissionSection
        materialId={resolvedMaterialId}
        isCollapsed={isSectionCollapsed('emission')}
        onToggle={() => toggleSection('emission')}
      />
      <AtlasEffectSection
        materialId={resolvedMaterialId}
        isCollapsed={isSectionCollapsed('effects')}
        onToggle={() => toggleSection('effects')}
      />
    </>
  )
}

export function Inspector() {
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedObjectType = useEditorStore((state) =>
    selectedObjectId ? state.sceneGraph[selectedObjectId]?.type ?? null : null,
  )
  const selectedObjectIsMaterial = useEditorStore((state) =>
    selectedObjectId ? Boolean(state.materials[selectedObjectId]) : false,
  )
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const hasSelectedMaterial = useEditorStore((state) =>
    selectedMaterialId ? Boolean(state.materials[selectedMaterialId]) : false,
  )

  const resolvedMaterialId = resolveInspectorMaterialId({
    selectedObjectId,
    selectedObjectType,
    selectedObjectIsMaterial,
    selectedMaterialId,
    hasSelectedMaterial,
  })

  const canInspectMaterial =
    selectedObjectType === 'material' || selectedObjectType === 'mesh' || Boolean(resolvedMaterialId)
  const hasMaterial = Boolean(resolvedMaterialId)

  return (
    <aside className="inspector-dock">
      <div className="inspector-dock__header">
        <span>Material Inspector</span>
      </div>
      <div className="inspector-dock__content">
        {!canInspectMaterial || !hasMaterial ? (
          <div className="inspector-placeholder">
            <p className="inspector-placeholder__title">No material selected</p>
            <p className="inspector-placeholder__body">
              Select a mesh or material to edit its material settings.
            </p>
          </div>
        ) : (
          <InspectorContent />
        )}
      </div>
    </aside>
  )
}
