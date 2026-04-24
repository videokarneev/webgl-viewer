import { useEffect, useMemo } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'
import { applyPatchToMaterial, clearPatchFromMaterial, updatePatchedMaterialUniforms } from '../../atlas/atlasMaterialPatch'
import { useAtlasAnimator } from '../../atlas/useAtlasAnimator'

const MATERIAL_TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const

function ensureMaterialTextureBackup(material: THREE.Material) {
  if (!material.userData.originalTextureSlots) {
    material.userData.originalTextureSlots = Object.fromEntries(
      MATERIAL_TEXTURE_SLOTS.map((slot) => [slot, (material as THREE.MeshStandardMaterial)[slot] ?? null]),
    )
  }
}

function applySystemMaterialView(material: THREE.Material) {
  const standardMaterial = material as THREE.MeshStandardMaterial & { clearcoat?: number }
  ensureMaterialTextureBackup(material)

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
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

function restoreMaterialTextureSlots(material: THREE.Material) {
  const standardMaterial = material as THREE.MeshStandardMaterial
  const originalTextureSlots = material.userData.originalTextureSlots as Partial<Record<(typeof MATERIAL_TEXTURE_SLOTS)[number], THREE.Texture | null>> | undefined

  if (!originalTextureSlots) {
    return
  }

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    standardMaterial[slot] = originalTextureSlots[slot] ?? null
  })
}

export function LoadedSceneRoot({ root }: { root: THREE.Object3D }) {
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const atlasFrameTexture = useEditorStore((state) => state.runtimeTextures.atlasFrameTexture)
  const selectedNode = useEditorStore((state) => (selectedObjectId ? state.sceneGraph[selectedObjectId] : null))
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const selectedMaterialId =
    selectedNode?.type === 'material'
      ? selectedNode.id
      : selectedNode?.type === 'mesh'
        ? selectedNode.children.find((childId) => sceneGraph[childId]?.type === 'material') ?? null
        : null

  useAtlasAnimator(selectedMaterialId)

  const objectUuidToNodeId = useMemo(() => {
    const map = new Map<string, string>()
    Object.keys(objects).forEach((nodeId) => {
      map.set(nodeId, nodeId)
    })
    return map
  }, [objects])

  useEffect(() => {
    root.traverse((object) => {
      registerObjectRef(object.uuid, object)

      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        meshMaterials.forEach((material) => {
          if (!material) return
          registerMaterialRef(`material:${material.uuid}`, material)
        })
      }
    })

    return () => {
      root.traverse((object) => {
        registerObjectRef(object.uuid, null)
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh
          const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          meshMaterials.forEach((material) => {
            if (!material) return
            registerMaterialRef(`material:${material.uuid}`, null)
          })
        }
      })
    }
  }, [registerMaterialRef, registerObjectRef, root])

  useEffect(() => {
    Object.entries(objects).forEach(([nodeId, objectState]) => {
      const object = useEditorStore.getState().runtime.objectById[nodeId]
      if (!object) return
      object.position.fromArray(objectState.position)
      object.rotation.set(objectState.rotation[0], objectState.rotation[1], objectState.rotation[2])
      object.scale.fromArray(objectState.scale)
      object.visible = objectState.visible
    })
  }, [objects])

  useEffect(() => {
    Object.values(materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id] as THREE.MeshStandardMaterial & {
        clearcoat?: number
      }
      if (!material) return

      if (materialState.useSystemMaterial) {
        applySystemMaterialView(material)
        return
      }

      restoreMaterialTextureSlots(material)
      if (materialState.color && 'color' in material) material.color.set(materialState.color)
      if (materialState.emissive && 'emissive' in material) material.emissive.set(materialState.emissive)
      if ('metalness' in material && materialState.metalness != null) material.metalness = materialState.metalness
      if ('roughness' in material && materialState.roughness != null) material.roughness = materialState.roughness
      if ('envMapIntensity' in material && materialState.envMapIntensity != null) material.envMapIntensity = materialState.envMapIntensity
      if ('emissiveIntensity' in material && materialState.emissiveIntensity != null) material.emissiveIntensity = materialState.emissiveIntensity
      if ('clearcoat' in material && materialState.clearcoat != null) material.clearcoat = materialState.clearcoat
      material.needsUpdate = true
    })
  }, [materials])

  useEffect(() => {
    Object.values(materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id]
      if (!material) return

      if (materialState.id === selectedMaterialId && atlasTexture && materialState.effect.enabled) {
        applyPatchToMaterial(material, materialState.effect, atlasTexture, atlasFrameTexture)
        updatePatchedMaterialUniforms(material, materialState.effect, atlasTexture, atlasFrameTexture)
      } else {
        clearPatchFromMaterial(material)
      }
    })
  }, [atlasFrameTexture, atlasTexture, materials, selectedMaterialId])

  useFrame(() => {
    if (!selectedMaterialId) {
      return
    }

    const materialState = materials[selectedMaterialId]
    const material = useEditorStore.getState().runtime.materialById[selectedMaterialId]
    if (!material || !materialState) {
      return
    }

    updatePatchedMaterialUniforms(material, materialState.effect, atlasTexture, atlasFrameTexture)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 2) {
      return
    }
    event.stopPropagation()
    const objectNodeId = objectUuidToNodeId.get(event.object.uuid)
    if (objectNodeId) {
      setSelectedObjectId(objectNodeId)
    }
  }

  return (
    <primitive
      object={root}
      onClick={handleClick}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => event.stopPropagation()}
    />
  )
}
