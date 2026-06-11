import * as THREE from 'three'
import {
  MATERIAL_TEXTURE_SLOTS,
  type EnvironmentState,
  type MaterialTextureSlot,
  type PbrMaterialState,
} from '../../../store/editorStore'

const RUNTIME_TEXTURE_SLOTS = [...MATERIAL_TEXTURE_SLOTS, 'envMap'] as const
type RuntimeTextureSlot = (typeof RUNTIME_TEXTURE_SLOTS)[number]

export type RuntimeMeshMaterial = THREE.MeshStandardMaterial & {
  clearcoat?: number
  envMapRotation: THREE.Euler
  alphaMap?: THREE.Texture | null
  bumpMap?: THREE.Texture | null
  displacementMap?: THREE.Texture | null
  specularMap?: THREE.Texture | null
  userData: THREE.Material['userData'] & {
    originalTextureSlots?: Partial<Record<RuntimeTextureSlot, THREE.Texture | null>>
    customTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    originalEnvMapRotation?: [number, number, number]
  }
}

function getTextureSourceUrl(texture: THREE.Texture) {
  const imageSource = texture.source?.data as { currentSrc?: string; src?: string } | undefined
  const sourceUrl = imageSource?.currentSrc || imageSource?.src
  return typeof sourceUrl === 'string' && sourceUrl ? sourceUrl : null
}

function getTextureDisplayName(texture: THREE.Texture, fallback: string) {
  const explicitName = texture.name?.trim()
  if (explicitName) {
    return explicitName
  }

  const sourceUrl = getTextureSourceUrl(texture)
  if (sourceUrl) {
    const sanitized = sourceUrl.split('#')[0]?.split('?')[0] ?? sourceUrl
    const pieces = sanitized.split(/[\\/]/)
    const fileName = pieces[pieces.length - 1]
    if (fileName) {
      return decodeURIComponent(fileName)
    }
  }

  return fallback
}

function textureMatchesOriginalSlot(
  texture: THREE.Texture | null | undefined,
  textureState: Pick<PbrMaterialState, 'textureSlots'>['textureSlots'][MaterialTextureSlot] | undefined,
  slot: MaterialTextureSlot,
) {
  if (!texture || !textureState) {
    return false
  }

  const sourceUrl = getTextureSourceUrl(texture)
  if (textureState.originalUrl && sourceUrl === textureState.originalUrl) {
    return true
  }

  if (!textureState.originalLabel) {
    return false
  }

  return getTextureDisplayName(texture, `${slot} Texture`) === textureState.originalLabel
}

export function ensureMaterialTextureBackup(
  material: THREE.Material,
  materialState?: Pick<PbrMaterialState, 'textureSlots'>,
) {
  const standardMaterial = material as RuntimeMeshMaterial

  if (!standardMaterial.userData.originalTextureSlots) {
    standardMaterial.userData.originalTextureSlots = Object.fromEntries(
      RUNTIME_TEXTURE_SLOTS.map((slot) => [slot, standardMaterial[slot] ?? null]),
    )
  }

  standardMaterial.userData.customTextureSlots ??= {}

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    const currentTexture = standardMaterial[slot] ?? null
    const customTexture = standardMaterial.userData.customTextureSlots?.[slot] ?? null
    const textureState = materialState?.textureSlots[slot]
    const currentMatchesOriginal = textureState
      ? textureMatchesOriginalSlot(currentTexture, textureState, slot)
      : Boolean(currentTexture)
    const backupMatchesOriginal = textureState
      ? textureMatchesOriginalSlot(standardMaterial.userData.originalTextureSlots?.[slot], textureState, slot)
      : Boolean(standardMaterial.userData.originalTextureSlots?.[slot])

    if (
      currentTexture &&
      currentTexture !== customTexture &&
      currentMatchesOriginal &&
      (!backupMatchesOriginal || standardMaterial.userData.originalTextureSlots?.[slot] === customTexture)
    ) {
      standardMaterial.userData.originalTextureSlots![slot] = currentTexture
    }
  })

  if (!standardMaterial.userData.originalEnvMapRotation) {
    standardMaterial.userData.originalEnvMapRotation = [
      standardMaterial.envMapRotation.x,
      standardMaterial.envMapRotation.y,
      standardMaterial.envMapRotation.z,
    ]
  }
}

export function applySystemMaterialView(material: THREE.Material) {
  const standardMaterial = material as RuntimeMeshMaterial
  ensureMaterialTextureBackup(material)

  RUNTIME_TEXTURE_SLOTS.forEach((slot) => {
    standardMaterial[slot] = null
  })
  standardMaterial.color.set('#8e9399')
  standardMaterial.emissive.set('#000000')
  standardMaterial.metalness = 0
  standardMaterial.roughness = 1
  standardMaterial.emissiveIntensity = 1
  if ('envMapIntensity' in standardMaterial) {
    standardMaterial.envMapIntensity = 1
  }
  if ('clearcoat' in standardMaterial) {
    standardMaterial.clearcoat = 0
  }
  material.needsUpdate = true
}

export function restoreMaterialTextureSlots(material: THREE.Material) {
  const standardMaterial = material as RuntimeMeshMaterial
  const originalTextureSlots = standardMaterial.userData.originalTextureSlots

  if (!originalTextureSlots) {
    return
  }

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    standardMaterial[slot] = originalTextureSlots[slot] ?? null
  })

  const originalEnvMapRotation = standardMaterial.userData.originalEnvMapRotation
  if (originalEnvMapRotation) {
    standardMaterial.envMapRotation.set(
      originalEnvMapRotation[0],
      originalEnvMapRotation[1],
      originalEnvMapRotation[2],
    )
  }
}

export function applyMaterialEnvironment(
  material: RuntimeMeshMaterial,
  materialState: Pick<PbrMaterialState, 'environmentOverrideId' | 'environmentRotation' | 'envMapIntensity'>,
  environment: Pick<EnvironmentState, 'isEnvironmentEnabled' | 'intensity' | 'rotation'>,
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
    material.envMapRotation.set(0, THREE.MathUtils.degToRad(materialState.environmentRotation ?? 0), 0)
    return
  }

  if (environment.isEnvironmentEnabled && sceneEnvironmentMap) {
    material.envMap = sceneEnvironmentMap
    material.envMapIntensity = environment.intensity * localIntensity
    material.envMapRotation.set(0, THREE.MathUtils.degToRad(environment.rotation), 0)
    return
  }

  material.envMap = null
  material.envMapIntensity = localIntensity
}

export function applyMaterialTextureSelections(
  material: RuntimeMeshMaterial,
  materialState: Pick<PbrMaterialState, 'textureSlots'>,
) {
  ensureMaterialTextureBackup(material, materialState)

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    const selectedSource = materialState.textureSlots[slot]?.selectedSource ?? null
    const originalTexture = material.userData.originalTextureSlots?.[slot] ?? null
    const customTexture = material.userData.customTextureSlots?.[slot] ?? null

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

export function applyRuntimeMaterialState(
  material: THREE.Material,
  materialState: PbrMaterialState,
  environment: Pick<EnvironmentState, 'isEnvironmentEnabled' | 'intensity' | 'rotation'>,
  sceneEnvironmentMap: THREE.Texture | null,
  materialEnvironmentMaps: Record<string, THREE.Texture>,
) {
  const runtimeMaterial = material as RuntimeMeshMaterial

  if (materialState.useSystemMaterial) {
    applySystemMaterialView(material)
    return
  }

  restoreMaterialTextureSlots(material)
  applyMaterialTextureSelections(runtimeMaterial, materialState)
  if (materialState.color && 'color' in runtimeMaterial) runtimeMaterial.color.set(materialState.color)
  if (materialState.emissive && 'emissive' in runtimeMaterial) runtimeMaterial.emissive.set(materialState.emissive)
  if ('metalness' in runtimeMaterial && materialState.metalness != null) runtimeMaterial.metalness = materialState.metalness
  if ('roughness' in runtimeMaterial && materialState.roughness != null) runtimeMaterial.roughness = materialState.roughness
  if ('emissiveIntensity' in runtimeMaterial && materialState.emissiveIntensity != null) {
    runtimeMaterial.emissiveIntensity = materialState.emissiveIntensity
  }
  if ('clearcoat' in runtimeMaterial && materialState.clearcoat != null) runtimeMaterial.clearcoat = materialState.clearcoat
  applyMaterialEnvironment(runtimeMaterial, materialState, environment, sceneEnvironmentMap, materialEnvironmentMaps)
  material.needsUpdate = true
}
