import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

type PointerStart = {
  id: number
  x: number
  y: number
  handlesFocus: boolean
}

const CLICK_MOVE_THRESHOLD = 8
const RETURN_POINTER_SUPPRESSION_PADDING_MS = 180

export const focusPointerState = {
  targetX: 0,
  targetY: 0,
  suppressScenePointerUntil: 0,
}

export function resetFocusPointerPosition() {
  focusPointerState.targetX = 0
  focusPointerState.targetY = 0
}

export function suppressFocusScenePointerInput(durationMs: number) {
  const now = performance.now()
  focusPointerState.suppressScenePointerUntil = Math.max(
    focusPointerState.suppressScenePointerUntil,
    now + Math.max(durationMs, 0),
  )
}

export function isFocusScenePointerInputSuppressed() {
  return performance.now() < focusPointerState.suppressScenePointerUntil
}

function stopPointerEvent(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function collectRaycastTargets(object: THREE.Object3D) {
  const targets: THREE.Object3D[] = []
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible) {
      targets.push(child)
    }
  })
  return targets
}

export function FocusInteractionController({ enabled = true }: { enabled?: boolean }) {
  const { gl, camera } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const startRef = useRef<PointerStart | null>(null)

  useEffect(() => {
    const element = gl.domElement
    const updateFocusPointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      focusPointerState.targetX = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -1,
        1,
      )
      focusPointerState.targetY = THREE.MathUtils.clamp(
        -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1),
        -1,
        1,
      )
    }

    const raycastFocusTarget = (targetObject: THREE.Object3D, event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return false
      }

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)

      return raycaster.intersectObjects(collectRaycastTargets(targetObject), true).length > 0
    }

    const isFocusCapturingPointer = () => {
      if (!enabled) {
        return false
      }

      const focus = useEditorStore.getState().focusAnimation
      return Boolean(focus.isAdded && focus.enabled && focus.focused && focus.targetObjectId)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled) {
        return
      }

      if (!event.isPrimary) {
        return
      }

      const store = useEditorStore.getState()
      const focus = store.focusAnimation
      const targetObject = focus.targetObjectId ? store.runtime.objectById[focus.targetObjectId] ?? null : null
      const canHandleFocus = Boolean(focus.isAdded && focus.enabled && focus.targetObjectId && targetObject)

      if (!canHandleFocus || !targetObject) {
        startRef.current = null
        return
      }

      if (focus.focused) {
        updateFocusPointer(event)
        startRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          handlesFocus: true,
        }
        stopPointerEvent(event)
        return
      }

      if (!raycastFocusTarget(targetObject, event)) {
        startRef.current = null
        return
      }

      startRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        handlesFocus: true,
      }
      resetFocusPointerPosition()
      stopPointerEvent(event)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!enabled) {
        return
      }

      const start = startRef.current
      startRef.current = null
      if (!event.isPrimary || !start || start.id !== event.pointerId || !start.handlesFocus) {
        return
      }

      const moveDistance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (moveDistance > CLICK_MOVE_THRESHOLD) {
        resetFocusPointerPosition()
        return
      }

      const store = useEditorStore.getState()
      const focus = store.focusAnimation
      if (!focus.isAdded || !focus.enabled || !focus.targetObjectId) {
        return
      }

      if (focus.focused) {
        event.preventDefault()
        useEditorStore.getState().updateFocusAnimation({ focused: false })
        resetFocusPointerPosition()
        suppressFocusScenePointerInput(focus.duration * 1000 + RETURN_POINTER_SUPPRESSION_PADDING_MS)
        return
      }

      stopPointerEvent(event)
      resetFocusPointerPosition()
      useEditorStore.getState().updateFocusAnimation({ focused: true })
    }

    const handlePointerMove = (event: PointerEvent) => {
      const start = startRef.current
      if (event.isPrimary && start?.handlesFocus && start.id === event.pointerId) {
        if (isFocusCapturingPointer()) {
          updateFocusPointer(event)
        } else {
          resetFocusPointerPosition()
        }
        stopPointerEvent(event)
        return
      }

      if (!event.isPrimary || !isFocusCapturingPointer()) {
        resetFocusPointerPosition()
        return
      }

      updateFocusPointer(event)
      stopPointerEvent(event)
    }

    const resetFocusPointer = () => {
      startRef.current = null
      resetFocusPointerPosition()
    }

    element.addEventListener('pointerdown', handlePointerDown, { capture: true })
    element.addEventListener('pointermove', handlePointerMove, { capture: true })
    element.addEventListener('pointerup', handlePointerUp, { capture: true })
    element.addEventListener('pointercancel', resetFocusPointer, { capture: true })
    element.addEventListener('pointerleave', resetFocusPointer)

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      element.removeEventListener('pointermove', handlePointerMove, { capture: true })
      element.removeEventListener('pointerup', handlePointerUp, { capture: true })
      element.removeEventListener('pointercancel', resetFocusPointer, { capture: true })
      element.removeEventListener('pointerleave', resetFocusPointer)
    }
  }, [camera, enabled, gl.domElement, pointer, raycaster])

  return null
}
