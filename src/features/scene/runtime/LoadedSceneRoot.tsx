import { useEffect, useMemo } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'
import { applyRuntimeMaterialState } from './materialRuntime'

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
      const material = useEditorStore.getState().runtime.materialById[materialState.id]
      if (!material) return

      applyRuntimeMaterialState(material, materialState, environment, sceneEnvironmentMap, materialEnvironmentMaps)
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
