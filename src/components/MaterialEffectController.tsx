import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useEditorStore } from '../store/editorStore'
import {
  applyPatchToMaterial,
  clearPatchFromMaterial,
  updatePatchedMaterialUniforms,
} from '../features/atlas/atlasMaterialPatch'
import { useAtlasAnimator } from '../features/atlas/useAtlasAnimator'

export function MaterialEffectController() {
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const materials = useEditorStore((state) => state.materials)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const atlasFrameTexture = useEditorStore((state) => state.runtimeTextures.atlasFrameTexture)

  useAtlasAnimator(selectedMaterialId)

  useEffect(() => {
    Object.values(materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id]
      if (!material) {
        return
      }

      if (materialState.id === selectedMaterialId && atlasTexture && materialState.effect.enabled) {
        applyPatchToMaterial(material, materialState.effect, atlasTexture, atlasFrameTexture)
        updatePatchedMaterialUniforms(
          material,
          materialState.effect,
          atlasTexture,
          atlasFrameTexture,
        )
        return
      }

      clearPatchFromMaterial(material)
    })
  }, [atlasFrameTexture, atlasTexture, materials, selectedMaterialId])

  useEffect(() => {
    return () => {
      Object.values(useEditorStore.getState().runtime.materialById).forEach((material) => {
        clearPatchFromMaterial(material)
      })
    }
  }, [])

  useFrame((frameState) => {
    if (!selectedMaterialId) {
      return
    }

    const store = useEditorStore.getState()
    const materialState = store.materials[selectedMaterialId]
    const material = store.runtime.materialById[selectedMaterialId]

    if (!materialState || !material || !materialState.effect.enabled) {
      return
    }

    updatePatchedMaterialUniforms(
      material,
      materialState.effect,
      store.runtimeTextures.atlasTexture,
      store.runtimeTextures.atlasFrameTexture,
      frameState.clock.elapsedTime,
    )
  })

  return null
}
