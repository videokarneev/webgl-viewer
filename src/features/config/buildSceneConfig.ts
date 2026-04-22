import * as THREE from 'three'
import type { SceneConfig } from '../../store/editorStore'
import { useEditorStore } from '../../store/editorStore'

function toAssetConfig() {
  const { assets, environment } = useEditorStore.getState()

  return {
    model: assets.model,
    atlas: assets.atlas,
    hdri: assets.reflections,
    panorama: assets.background,
  }
}

function getSelectedMaterialEntry() {
  const state = useEditorStore.getState()
  const selectedNode = state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] : null

  if (selectedNode?.type === 'material' && state.materials[selectedNode.id]) {
    return state.materials[selectedNode.id]
  }

  const firstMaterialId = Object.keys(state.materials)[0]
  return firstMaterialId ? state.materials[firstMaterialId] : null
}

export function buildSceneConfig(): SceneConfig {
  const state = useEditorStore.getState()
  const selectedMaterial = getSelectedMaterialEntry()
  const rootObject = state.rootNodeId ? state.objects[state.rootNodeId] : null

  return {
    version: 1,
    assets: toAssetConfig(),
    viewer: {
      cameraMode: state.viewer.cameraMode,
      focalLength: state.viewer.focalLength,
      exposure: state.viewer.exposure,
      envIntensity: state.environment.intensity,
      cameraPosition: [...state.viewer.cameraPosition],
      orbitTarget: [...state.viewer.orbitTarget],
      dofEnabled: state.viewer.dofEnabled,
      dofVisualizerEnabled: state.viewer.dofVisualizerEnabled,
      dofFocusDistance: state.viewer.dofFocusDistance,
      dofAperture: state.viewer.dofAperture,
      dofManualBlur: state.viewer.dofManualBlur,
    },
    materialSettings: selectedMaterial
      ? {
          color: selectedMaterial.color?.replace('#', '') ?? null,
          emissive: selectedMaterial.emissive?.replace('#', '') ?? null,
          metalness: selectedMaterial.metalness ?? null,
          roughness: selectedMaterial.roughness ?? null,
          envMapIntensity: selectedMaterial.envMapIntensity ?? null,
          emissiveIntensity: selectedMaterial.emissiveIntensity ?? null,
          clearcoat: selectedMaterial.clearcoat ?? null,
        }
      : null,
    modelTransform: rootObject
      ? {
          position: [...rootObject.position],
          rotation: rootObject.rotation.map((value) => THREE.MathUtils.radToDeg(value)),
        }
      : null,
    materialEffect: selectedMaterial
      ? {
          materialId: selectedMaterial.id,
          materialName: selectedMaterial.name,
          ...selectedMaterial.effect,
        }
      : null,
  }
}

export function downloadSceneConfig(filename = 'scene-config.json') {
  const config = buildSceneConfig()
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function copySceneConfigToClipboard() {
  const config = buildSceneConfig()
  await navigator.clipboard.writeText(JSON.stringify(config, null, 2))
}
