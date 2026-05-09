import * as THREE from 'three'
import type { MeasurementUnit, SceneGraphNode } from '../../store/editorStore'

type UpdateObjectTransform = (
  id: string,
  patch: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
    visible?: boolean
  },
) => void

type UpdateExtraLight = (
  id: string,
  patch: {
    position?: [number, number, number]
  },
) => void

export function getUnitScale(unit: MeasurementUnit) {
  return unit === 'm' ? 100 : 1
}

export function sanitizeNumber(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function formatTransformNumber(value: number) {
  const rounded = Math.abs(value) < 0.000001 ? 0 : value
  return Number(rounded.toFixed(3))
}

export function toDisplayDistance(value: number, unit: MeasurementUnit) {
  return value / getUnitScale(unit)
}

export function toInternalDistance(value: number, unit: MeasurementUnit) {
  return value * getUnitScale(unit)
}

export function toDisplayRotation(radians: number) {
  return THREE.MathUtils.radToDeg(radians)
}

export function toInternalRotation(degrees: number) {
  return THREE.MathUtils.degToRad(degrees)
}

export function syncRuntimeObjectTransform(params: {
  selectedObjectId: string
  selectedNode: SceneGraphNode
  runtimeObject: THREE.Object3D
  updateObjectTransform: UpdateObjectTransform
  updateExtraLight: UpdateExtraLight
}) {
  const { selectedObjectId, selectedNode, runtimeObject, updateObjectTransform, updateExtraLight } = params
  const position: [number, number, number] = [
    runtimeObject.position.x,
    runtimeObject.position.y,
    runtimeObject.position.z,
  ]

  updateObjectTransform(selectedObjectId, {
    position,
    rotation: [runtimeObject.rotation.x, runtimeObject.rotation.y, runtimeObject.rotation.z],
    scale: [runtimeObject.scale.x, runtimeObject.scale.y, runtimeObject.scale.z],
    visible: runtimeObject.visible,
  })

  if (selectedNode.type === 'light') {
    updateExtraLight(selectedObjectId, { position })
  }
}
