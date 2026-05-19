import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  MATERIAL_TEXTURE_SLOTS,
  type MaterialTextureSlot,
  useEditorStore,
} from '../store/editorStore'
import { useAtlasAnimator } from '../features/atlas/useAtlasAnimator'

type RuntimeMaterial = THREE.Material & {
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
  emissive?: THREE.Color
  userData: THREE.Material['userData'] & {
    originalTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    customTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    flipbookOriginalEmissiveHex?: number
  }
}

function ensureMaterialTextureBackup(material: RuntimeMaterial) {
  if (!material.userData.originalTextureSlots) {
    material.userData.originalTextureSlots = Object.fromEntries(
      MATERIAL_TEXTURE_SLOTS.map((slot) => [slot, material[slot] ?? null]),
    ) as Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
  }

  material.userData.customTextureSlots ??= {}
}

function getSelectedTexture(
  material: RuntimeMaterial,
  textureState: {
    selectedSource: 'original' | 'custom' | null
  },
  slot: MaterialTextureSlot,
) {
  const originalTexture = material.userData.originalTextureSlots?.[slot] ?? null
  const customTexture = material.userData.customTextureSlots?.[slot] ?? null

  if (textureState.selectedSource === 'custom' && customTexture) {
    return customTexture
  }

  if (textureState.selectedSource === 'original' && originalTexture) {
    return originalTexture
  }

  return customTexture ?? originalTexture ?? null
}

function restoreMaterialTextureSelections(
  material: RuntimeMaterial,
  materialState: {
    textureSlots: Record<
      MaterialTextureSlot,
      {
        selectedSource: 'original' | 'custom' | null
      }
    >
  },
) {
  ensureMaterialTextureBackup(material)

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    material[slot] = getSelectedTexture(material, materialState.textureSlots[slot], slot)
  })

  if (material.emissive && material.userData.flipbookOriginalEmissiveHex != null) {
    material.emissive.setHex(material.userData.flipbookOriginalEmissiveHex)
    delete material.userData.flipbookOriginalEmissiveHex
  }
}

function applyFlipbookSlotOverride(
  material: RuntimeMaterial,
  materialState: {
    textureSlots: Record<
      MaterialTextureSlot,
      {
        selectedSource: 'original' | 'custom' | null
      }
    >
    effect: {
      isAdded: boolean
      enabled: boolean
      targetSlot: 'emissive' | 'baseColor'
    }
  },
  atlasTexture: THREE.Texture | null,
  atlasFrameTexture: THREE.Texture | null,
) {
  restoreMaterialTextureSelections(material, materialState)

  if (!materialState.effect.isAdded || !materialState.effect.enabled || !atlasTexture) {
    material.needsUpdate = true
    return
  }

  const overrideTexture = atlasFrameTexture ?? atlasTexture
  if (!overrideTexture) {
    material.needsUpdate = true
    return
  }

  if (materialState.effect.targetSlot === 'baseColor') {
    material.map = overrideTexture
  } else {
    if (material.emissive) {
      if (material.userData.flipbookOriginalEmissiveHex == null) {
        material.userData.flipbookOriginalEmissiveHex = material.emissive.getHex()
      }

      if (material.emissive.getHex() === 0x000000) {
        material.emissive.setHex(0xffffff)
      }
    }

    material.emissiveMap = overrideTexture
  }

  material.needsUpdate = true
}

export function MaterialEffectController() {
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const materials = useEditorStore((state) => state.materials)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const atlasFrameTexture = useEditorStore((state) => state.runtimeTextures.atlasFrameTexture)
  const activeMaterialId = (() => {
    const selectedMaterial = selectedMaterialId ? materials[selectedMaterialId] : null
    if (selectedMaterial?.effect.isAdded && selectedMaterial.effect.enabled) {
      return selectedMaterialId
    }

    const fallbackMaterial = Object.values(materials).find(
      (material) => material.effect.isAdded && material.effect.enabled,
    )

    return fallbackMaterial?.id ?? null
  })()

  useAtlasAnimator(activeMaterialId)

  useEffect(() => {
    Object.values(materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id] as RuntimeMaterial | undefined
      if (!material) {
        return
      }

      if (materialState.id === activeMaterialId) {
        applyFlipbookSlotOverride(material, materialState, atlasTexture, atlasFrameTexture)
        return
      }

      restoreMaterialTextureSelections(material, materialState)
      material.needsUpdate = true
    })
  }, [activeMaterialId, atlasFrameTexture, atlasTexture, materials])

  useEffect(() => {
    return () => {
      const store = useEditorStore.getState()
      Object.values(store.materials).forEach((materialState) => {
        const material = store.runtime.materialById[materialState.id] as RuntimeMaterial | undefined
        if (!material) {
          return
        }

        restoreMaterialTextureSelections(material, materialState)
        material.needsUpdate = true
      })
    }
  }, [])

  useFrame(() => {
    if (!activeMaterialId) {
      return
    }

    const store = useEditorStore.getState()
    const materialState = store.materials[activeMaterialId]
    const material = store.runtime.materialById[activeMaterialId] as RuntimeMaterial | undefined

    if (!materialState || !material) {
      return
    }

    applyFlipbookSlotOverride(
      material,
      materialState,
      store.runtimeTextures.atlasTexture,
      store.runtimeTextures.atlasFrameTexture,
    )
  })

  return null
}
