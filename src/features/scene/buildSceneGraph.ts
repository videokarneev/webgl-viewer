import * as THREE from 'three'
import { DEFAULT_ATLAS_EFFECT, type ObjectTransformState, type PbrMaterialState, type SceneGraphNode } from '../../store/editorStore'

function getNodeType(object: THREE.Object3D): SceneGraphNode['type'] {
  if ((object as THREE.Mesh).isMesh) return 'mesh'
  if ((object as THREE.Camera).isCamera) return 'camera'
  if ((object as THREE.Light).isLight) return 'light'
  if (object.type === 'Scene') return 'scene'
  return 'group'
}

function getObjectLabel(object: THREE.Object3D) {
  if (object.parent === null && object.type !== 'Scene') {
    return object.name || 'Loaded Model'
  }

  if (object.type === 'Group') {
    return object.name || 'Model Root'
  }

  return object.name || object.type || 'Object'
}

function materialNodeId(material: THREE.Material) {
  return `material:${material.uuid}`
}

export function buildSceneGraph(root: THREE.Object3D) {
  const sceneGraph: Record<string, SceneGraphNode> = {}
  const objects: Record<string, ObjectTransformState> = {}
  const materials: Record<string, PbrMaterialState> = {}
  const attachedMaterialNodes = new Set<string>()

  root.traverse((object) => {
    const nodeId = object.uuid
    const childIds = object.children.map((child) => child.uuid)

    sceneGraph[nodeId] = {
      id: nodeId,
      parentId: object.parent ? object.parent.uuid : null,
      children: [...childIds],
      type: getNodeType(object),
      label: getObjectLabel(object),
      objectUuid: object.uuid,
      visible: object.visible,
    }

    objects[nodeId] = {
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: [object.scale.x, object.scale.y, object.scale.z],
      visible: object.visible,
    }

    if (!(object as THREE.Mesh).isMesh) {
      return
    }

    const mesh = object as THREE.Mesh
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

    meshMaterials.forEach((material, index) => {
      if (!material) {
        return
      }

      const nodeId = materialNodeId(material)
      const materialLabel = material.name || `${mesh.name || 'Mesh'} / Material ${index + 1}`

      if (!materials[nodeId]) {
        const standardMaterial = material as THREE.MeshStandardMaterial & { clearcoat?: number }
        materials[nodeId] = {
          id: nodeId,
          name: material.name || 'Unnamed material',
          type: material.type,
          meshIds: [mesh.uuid],
          useSystemMaterial: false,
          color: 'color' in standardMaterial ? `#${standardMaterial.color.getHexString()}` : undefined,
          emissive: 'emissive' in standardMaterial ? `#${standardMaterial.emissive.getHexString()}` : undefined,
          metalness: 'metalness' in standardMaterial ? standardMaterial.metalness : undefined,
          roughness: 'roughness' in standardMaterial ? standardMaterial.roughness : undefined,
          envMapIntensity: 'envMapIntensity' in standardMaterial ? standardMaterial.envMapIntensity : undefined,
          emissiveIntensity: 'emissiveIntensity' in standardMaterial ? standardMaterial.emissiveIntensity : undefined,
          clearcoat: 'clearcoat' in standardMaterial ? standardMaterial.clearcoat : undefined,
          hasMaps: {
            baseColor: Boolean(standardMaterial.map),
            emissive: Boolean(standardMaterial.emissiveMap),
            normal: Boolean(standardMaterial.normalMap),
            ao: Boolean(standardMaterial.aoMap),
            roughness: Boolean(standardMaterial.roughnessMap),
            metalness: Boolean(standardMaterial.metalnessMap),
          },
          effect: { ...DEFAULT_ATLAS_EFFECT },
        }
      } else if (!materials[nodeId].meshIds.includes(mesh.uuid)) {
        materials[nodeId].meshIds.push(mesh.uuid)
      }

      if (!attachedMaterialNodes.has(nodeId)) {
        attachedMaterialNodes.add(nodeId)
        sceneGraph[nodeId] = {
          id: nodeId,
          parentId: mesh.uuid,
          children: [],
          type: 'material',
          label: materialLabel,
          materialUuid: material.uuid,
          visible: true,
        }
        sceneGraph[mesh.uuid].children.push(nodeId)
      }
    })
  })

  if (sceneGraph[root.uuid]?.type === 'group') {
    sceneGraph[root.uuid].label = root.name || 'Loaded Model'
  }

  return {
    sceneGraph,
    objects,
    materials,
    rootNodeId: root.uuid,
    firstMaterialId: Object.keys(materials)[0] ?? null,
  }
}
