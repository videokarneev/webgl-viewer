import { useEffect, useMemo } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { MATERIAL_TEXTURE_SLOTS, type MaterialTextureSlot, useEditorStore } from '../../../store/editorStore'

const RUNTIME_TEXTURE_SLOTS = [...MATERIAL_TEXTURE_SLOTS, 'envMap'] as const
type RuntimeTextureSlot = (typeof RUNTIME_TEXTURE_SLOTS)[number]

type RuntimeMeshMaterial = THREE.MeshStandardMaterial & {
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

function ensureMaterialTextureBackup(material: THREE.Material) {
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

function applySystemMaterialView(material: THREE.Material) {
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

function restoreMaterialTextureSlots(material: THREE.Material) {
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

function applyMaterialEnvironment(
  material: RuntimeMeshMaterial,
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

function applyMaterialTextureSelections(
  material: RuntimeMeshMaterial,
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

export function LoadedSceneRoot({ root, selectable = true }: { root: THREE.Object3D; selectable?: boolean }) {
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const environment = useEditorStore((state) => state.environment)
  const sceneEnvironmentMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const materialEnvironmentMaps = useEditorStore((state) => state.runtimeTextures.materialEnvironmentMaps)
  const runtimeRegistryState = useEditorStore((state) => state.runtime)

  const objectUuidToNodeId = useMemo(() => {
    const map = new Map<string, string>()
    Object.entries(runtimeRegistryState.objectById).forEach(([nodeId, object]) => {
      map.set(object.uuid, nodeId)
    })
    Object.keys(objects).forEach((nodeId) => {
      map.set(nodeId, nodeId)
    })
    return map
  }, [objects, runtimeRegistryState.objectById])

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
      const material = useEditorStore.getState().runtime.materialById[materialState.id] as RuntimeMeshMaterial | undefined
      if (!material) return

      if (materialState.useSystemMaterial) {
        applySystemMaterialView(material)
        return
      }

      restoreMaterialTextureSlots(material)
      applyMaterialTextureSelections(material, materialState)
      if (materialState.color && 'color' in material) material.color.set(materialState.color)
      if (materialState.emissive && 'emissive' in material) material.emissive.set(materialState.emissive)
      if ('metalness' in material && materialState.metalness != null) material.metalness = materialState.metalness
      if ('roughness' in material && materialState.roughness != null) material.roughness = materialState.roughness
      if ('emissiveIntensity' in material && materialState.emissiveIntensity != null) material.emissiveIntensity = materialState.emissiveIntensity
      if ('clearcoat' in material && materialState.clearcoat != null) material.clearcoat = materialState.clearcoat
      applyMaterialEnvironment(material, materialState, environment, sceneEnvironmentMap, materialEnvironmentMaps)
      material.needsUpdate = true
    })
  }, [environment, materialEnvironmentMaps, materials, sceneEnvironmentMap])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!selectable) {
      return
    }

    if (event.delta > 2) {
      return
    }
    event.stopPropagation()
    let currentObject: THREE.Object3D | null = event.object
    let objectNodeId: string | undefined

    while (currentObject && !objectNodeId) {
      objectNodeId = objectUuidToNodeId.get(currentObject.uuid)
      currentObject = currentObject.parent
    }

    if (objectNodeId) {
      setSelectedObjectId(objectNodeId)
    }
  }

  return (
    <primitive
      object={root}
      onClick={selectable ? handleClick : undefined}
      onPointerDown={selectable ? (event: ThreeEvent<PointerEvent>) => event.stopPropagation() : undefined}
    />
  )
}
