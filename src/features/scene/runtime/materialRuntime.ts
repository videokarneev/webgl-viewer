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

export function ensureMaterialTextureBackup(material: THREE.Material) {
  const standardMaterial = material as RuntimeMeshMaterial

  if (!standardMaterial.userData.originalTextureSlots) {
    standardMaterial.userData.originalTextureSlots = Object.fromEntries(
      RUNTIME_TEXTURE_SLOTS.map((slot) => [slot, standardMaterial[slot] ?? null]),
    )
  }

  standardMaterial.userData.customTextureSlots ??= {}

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
  ensureMaterialTextureBackup(material)

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
