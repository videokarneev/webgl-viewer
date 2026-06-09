import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore, type ObjectTransformState } from '../../../store/editorStore'

const DRAG_ROTATION_X = 0.008
const DRAG_ROTATION_Y = 0.007
const MAX_PITCH = Math.PI * 0.42

type DragState = {
  pointerId: number
  lastX: number
  lastY: number
}

function hasVisibleLockedPhoneBox() {
  const store = useEditorStore.getState()
  return store.phoneScreenBoxes.some((entry) => entry.screenBinding.lockToFrame && (store.objects[entry.id]?.visible ?? false))
}

function getVisibleLoadedModelEntries() {
  const store = useEditorStore.getState()
  return store.loadedModels
    .map((model) => {
      const objectState = store.objects[model.rootNodeId] ?? null
      const object = store.runtime.objectById[model.rootNodeId] ?? null
      return object && objectState?.visible ? { object, objectState } : null
    })
    .filter((entry): entry is { object: THREE.Object3D; objectState: ObjectTransformState } => Boolean(entry))
}

function stopPointerEvent(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

export function TouchObjectRotationController({ enabled }: { enabled: boolean }) {
  const { gl, camera } = useThree()
  const dragRef = useRef<DragState | null>(null)
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const rightAxis = useMemo(() => new THREE.Vector3(), [])
  const upAxis = useMemo(() => new THREE.Vector3(), [])
  const yawQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const pitchQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const baseQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const manualQuaternion = useMemo(() => new THREE.Quaternion(), [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const element = gl.domElement
    const previousTouchAction = element.style.touchAction
    element.style.touchAction = 'none'

    const canRotate = () => hasVisibleLockedPhoneBox() && getVisibleLoadedModelEntries().length > 0

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || !canRotate()) {
        return
      }

      stopPointerEvent(event)
      dragRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      }
      element.setPointerCapture?.(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }

      stopPointerEvent(event)
      const deltaX = event.clientX - drag.lastX
      const deltaY = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      yawRef.current += deltaX * DRAG_ROTATION_X
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + deltaY * DRAG_ROTATION_Y, -MAX_PITCH, MAX_PITCH)
    }

    const stopDragging = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }

      stopPointerEvent(event)
      dragRef.current = null
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    element.addEventListener('pointerdown', handlePointerDown, { capture: true })
    element.addEventListener('pointermove', handlePointerMove, { capture: true })
    element.addEventListener('pointerup', stopDragging, { capture: true })
    element.addEventListener('pointercancel', stopDragging, { capture: true })

    return () => {
      element.style.touchAction = previousTouchAction
      element.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      element.removeEventListener('pointermove', handlePointerMove, { capture: true })
      element.removeEventListener('pointerup', stopDragging, { capture: true })
      element.removeEventListener('pointercancel', stopDragging, { capture: true })
    }
  }, [enabled, gl.domElement])

  useFrame(() => {
    if (!enabled || (yawRef.current === 0 && pitchRef.current === 0) || !hasVisibleLockedPhoneBox()) {
      return
    }

    upAxis.copy(camera.up).normalize()
    rightAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize()
    yawQuaternion.setFromAxisAngle(upAxis, yawRef.current)
    pitchQuaternion.setFromAxisAngle(rightAxis, pitchRef.current)
    manualQuaternion.copy(yawQuaternion).multiply(pitchQuaternion)

    getVisibleLoadedModelEntries().forEach(({ object, objectState }) => {
      object.position.fromArray(objectState.position)
      object.scale.fromArray(objectState.scale)
      baseQuaternion.setFromEuler(new THREE.Euler(...objectState.rotation, 'XYZ'))
      object.quaternion.copy(manualQuaternion).multiply(baseQuaternion)
      object.visible = objectState.visible
      object.updateMatrixWorld(true)
    })
  })

  return null
}
