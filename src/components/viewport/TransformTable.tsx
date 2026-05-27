import { useEffect, useMemo, useRef } from 'react'
import {
  getGodRaysDirectionArrowId,
  getGodRaysStoredDirectionFromArrowObject,
  getStencilVolumeEndHandleId,
  useEditorStore,
} from '../../store/editorStore'
import {
  formatTransformNumber,
  sanitizeNumber,
  syncRuntimeObjectTransform,
  toDisplayDistance,
  toDisplayRotation,
  toInternalDistance,
  toInternalRotation,
} from './transformShared'

type AxisKey = 'x' | 'y' | 'z'

const POSITION_AXES: AxisKey[] = ['x', 'y', 'z']

function isStencilVolumeAxisEnabled(transformMode: 'translate' | 'rotate' | 'scale' | 'none', axis: AxisKey) {
  if (transformMode === 'translate') {
    return true
  }

  if (transformMode === 'rotate' || transformMode === 'scale') {
    return axis !== 'z'
  }

  return false
}

export function TransformTable() {
  const repeatTimeoutRef = useRef<number | null>(null)
  const repeatIntervalRef = useRef<number | null>(null)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )
  const objectState = useEditorStore((state) =>
    state.selectedObjectId ? state.objects[state.selectedObjectId] ?? null : null,
  )
  const selectedRuntimeObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const directionRuntimeObject = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.runtime.objectById[getGodRaysDirectionArrowId(state.hud.activeGodRaysDirectionBoxId)] ?? null
      : null,
  )
  const activeGodRaysEntry = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.godRaysBoxes.find((entry) => entry.id === state.hud.activeGodRaysDirectionBoxId) ?? null
      : null,
  )
  const activeGodRaysObject = useEditorStore((state) =>
    state.hud.activeGodRaysDirectionBoxId
      ? state.runtime.objectById[state.hud.activeGodRaysDirectionBoxId] ?? null
      : null,
  )
  const activeStencilVolumeEndHandleId = useEditorStore((state) => state.hud.activeStencilVolumeEndHandleId)
  const endRuntimeObject = useEditorStore((state) =>
    state.hud.activeStencilVolumeEndHandleId
      ? state.runtime.objectById[getStencilVolumeEndHandleId(state.hud.activeStencilVolumeEndHandleId)] ?? null
      : null,
  )
  const activeStencilVolumeEntry = useEditorStore((state) =>
    state.hud.activeStencilVolumeEndHandleId
      ? state.stencilVolumes.find((entry) => entry.id === state.hud.activeStencilVolumeEndHandleId) ?? null
      : null,
  )
  const transformMode = useEditorStore((state) => state.hud.transformMode)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const updateGodRaysBox = useEditorStore((state) => state.updateGodRaysBox)
  const updateStencilVolume = useEditorStore((state) => state.updateStencilVolume)
  const setGodRaysGlobalDirection = useEditorStore((state) => state.setGodRaysGlobalDirection)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const isEditingGodRaysDirection = Boolean(
    activeGodRaysDirectionBoxId &&
      selectedObjectId === activeGodRaysDirectionBoxId,
  )
  const wantsStencilVolumeEndEdit = Boolean(
    activeStencilVolumeEndHandleId &&
      selectedObjectId === activeStencilVolumeEndHandleId,
  )
  const isEditingStencilVolumeEnd = wantsStencilVolumeEndEdit && Boolean(endRuntimeObject)
  const runtimeObject = isEditingGodRaysDirection
    ? directionRuntimeObject
    : wantsStencilVolumeEndEdit
      ? endRuntimeObject
      : selectedRuntimeObject
  const activeTransformMode = transformMode

  const canTransform = isEditingGodRaysDirection
    ? Boolean(transformMode === 'rotate' && activeGodRaysDirectionBoxId && runtimeObject)
    : wantsStencilVolumeEndEdit
      ? Boolean(
          activeTransformMode !== 'none' &&
            activeStencilVolumeEndHandleId &&
            runtimeObject &&
            activeStencilVolumeEntry,
        )
    : Boolean(
        selectedObjectId &&
        selectedNode &&
          selectedNode.type !== 'material' &&
          objectState &&
          runtimeObject,
      )

  const displayedValues = (() => {
    if (isEditingGodRaysDirection && runtimeObject) {
      return {
        x: formatTransformNumber(toDisplayRotation(runtimeObject.rotation.x)),
        y: formatTransformNumber(toDisplayRotation(runtimeObject.rotation.y)),
        z: formatTransformNumber(toDisplayRotation(runtimeObject.rotation.z)),
      }
    }

    if (wantsStencilVolumeEndEdit && activeStencilVolumeEntry) {
      if (transformMode === 'rotate') {
        return {
          x: formatTransformNumber(toDisplayRotation(activeStencilVolumeEntry.endRotationX)),
          y: formatTransformNumber(toDisplayRotation(activeStencilVolumeEntry.endRotationY)),
          z: 0,
        }
      }

      if (transformMode === 'scale') {
        return {
          x: formatTransformNumber(activeStencilVolumeEntry.endScaleX),
          y: formatTransformNumber(activeStencilVolumeEntry.endScaleY),
          z: 1,
        }
      }

      return {
        x: formatTransformNumber(toDisplayDistance(activeStencilVolumeEntry.extrudeEnd[0], transformSettings.measurementUnit)),
        y: formatTransformNumber(toDisplayDistance(activeStencilVolumeEntry.extrudeEnd[1], transformSettings.measurementUnit)),
        z: formatTransformNumber(toDisplayDistance(activeStencilVolumeEntry.extrudeEnd[2], transformSettings.measurementUnit)),
      }
    }

    if (!objectState) {
      return { x: 0, y: 0, z: 0 }
    }

    if (transformMode === 'rotate') {
      return {
        x: formatTransformNumber(toDisplayRotation(objectState.rotation[0])),
        y: formatTransformNumber(toDisplayRotation(objectState.rotation[1])),
        z: formatTransformNumber(toDisplayRotation(objectState.rotation[2])),
      }
    }

    if (transformMode === 'scale') {
      return {
        x: formatTransformNumber(objectState.scale[0]),
        y: formatTransformNumber(objectState.scale[1]),
        z: formatTransformNumber(objectState.scale[2]),
      }
    }

    return {
      x: formatTransformNumber(toDisplayDistance(objectState.position[0], transformSettings.measurementUnit)),
      y: formatTransformNumber(toDisplayDistance(objectState.position[1], transformSettings.measurementUnit)),
      z: formatTransformNumber(toDisplayDistance(objectState.position[2], transformSettings.measurementUnit)),
    }
  })()

  useEffect(() => {
    const handleMouseUp = () => {
      endHistoryGesture()
      if (repeatTimeoutRef.current != null) {
        window.clearTimeout(repeatTimeoutRef.current)
        repeatTimeoutRef.current = null
      }
      if (repeatIntervalRef.current != null) {
        window.clearInterval(repeatIntervalRef.current)
        repeatIntervalRef.current = null
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      handleMouseUp()
    }
  }, [endHistoryGesture])

  const handleValueChange = (axis: AxisKey, value: number) => {
    if (!canTransform || !runtimeObject) {
      return
    }
    if (wantsStencilVolumeEndEdit && !isStencilVolumeAxisEnabled(transformMode, axis)) {
      return
    }

    const nextValue = sanitizeNumber(value)
    if (isEditingGodRaysDirection && activeGodRaysDirectionBoxId && activeGodRaysEntry && activeGodRaysObject) {
      runtimeObject.rotation[axis] = toInternalRotation(nextValue)
      const nextDirection = getGodRaysStoredDirectionFromArrowObject(
        runtimeObject,
        activeGodRaysEntry.dustDirectionMode,
        activeGodRaysObject,
      )
      const patch =
        activeGodRaysEntry.dustDirectionMode === 'local'
          ? {
              dustDirectionMode: activeGodRaysEntry.dustDirectionMode,
              dustDirectionLocal: nextDirection,
            }
          : null
      if (activeGodRaysEntry.dustDirectionMode === 'global') {
        setGodRaysGlobalDirection(nextDirection)
      } else if (patch) {
        updateGodRaysBox(activeGodRaysDirectionBoxId, patch)
      }
      return
    }

    if (wantsStencilVolumeEndEdit && activeStencilVolumeEndHandleId && activeStencilVolumeEntry) {
      if (transformMode === 'rotate') {
        updateStencilVolume(activeStencilVolumeEndHandleId, {
          endRotationX: axis === 'x' ? toInternalRotation(nextValue) : activeStencilVolumeEntry.endRotationX,
          endRotationY: axis === 'y' ? toInternalRotation(nextValue) : activeStencilVolumeEntry.endRotationY,
        })
        return
      }

      if (transformMode === 'scale') {
        updateStencilVolume(activeStencilVolumeEndHandleId, {
          endScaleX: axis === 'x' ? Math.max(0.05, nextValue) : activeStencilVolumeEntry.endScaleX,
          endScaleY: axis === 'y' ? Math.max(0.05, nextValue) : activeStencilVolumeEntry.endScaleY,
        })
        return
      }

      const nextInternalValue = toInternalDistance(nextValue, transformSettings.measurementUnit)
      const nextExtrudeEnd = [...activeStencilVolumeEntry.extrudeEnd] as [number, number, number]
      if (axis === 'x') {
        nextExtrudeEnd[0] = nextInternalValue
      } else if (axis === 'y') {
        nextExtrudeEnd[1] = nextInternalValue
      } else {
        nextExtrudeEnd[2] = nextInternalValue
      }

      updateStencilVolume(activeStencilVolumeEndHandleId, {
        extrudeEnd: nextExtrudeEnd,
      })
      return
    }

    if (!selectedObjectId || !selectedNode) {
      return
    }

    if (transformMode === 'rotate') {
      runtimeObject.rotation[axis] = toInternalRotation(nextValue)
    } else if (transformMode === 'scale') {
      runtimeObject.scale[axis] = Math.max(0.01, nextValue)
    } else {
      runtimeObject.position[axis] = toInternalDistance(nextValue, transformSettings.measurementUnit)
    }

    syncRuntimeObjectTransform({
      selectedObjectId,
      selectedNode,
      runtimeObject,
      updateObjectTransform,
      updateExtraLight,
    })
  }

  const stopRepeating = () => {
    if (repeatTimeoutRef.current != null) {
      window.clearTimeout(repeatTimeoutRef.current)
      repeatTimeoutRef.current = null
    }
    if (repeatIntervalRef.current != null) {
      window.clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }

  const getDisplayStep = () => {
    if (transformMode === 'rotate') {
      return transformSettings.rotationStep > 0 ? transformSettings.rotationStep : 1
    }

    if (transformMode === 'scale') {
      return 0.05
    }

    if (transformSettings.translationStep > 0) {
      return transformSettings.measurementUnit === 'm'
        ? transformSettings.translationStep / 100
        : transformSettings.translationStep
    }

    return transformSettings.measurementUnit === 'm' ? 0.001 : 0.1
  }

  const nudgeAxis = (axis: AxisKey, direction: 1 | -1) => {
    if (!canTransform) {
      return
    }
    if (wantsStencilVolumeEndEdit && !isStencilVolumeAxisEnabled(transformMode, axis)) {
      return
    }

    const precision = transformMode === 'rotate' ? 2 : 3
    const nextValue = sanitizeNumber(displayedValues[axis]) + getDisplayStep() * direction
    handleValueChange(axis, Number(nextValue.toFixed(precision)))
  }

  const startRepeating = (axis: AxisKey, direction: 1 | -1) => {
    beginHistoryGesture()
    stopRepeating()
    nudgeAxis(axis, direction)
    repeatTimeoutRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => {
        nudgeAxis(axis, direction)
      }, 60)
    }, 260)
  }

  const unitLabel =
    transformMode === 'rotate' ? 'deg' : transformMode === 'scale' ? 'x' : transformSettings.measurementUnit

  return (
    <div className="transform-table">
      {POSITION_AXES.map((axis) => (
        (() => {
          const axisEnabled = !wantsStencilVolumeEndEdit || isStencilVolumeAxisEnabled(transformMode, axis)
          return (
            <label key={axis} className="transform-table__field">
              <span>{axis.toUpperCase()}:</span>
              <div className="transform-table__control">
                <input
                  type="text"
                  inputMode="decimal"
                  value={canTransform && axisEnabled ? String(displayedValues[axis]) : '-'}
                  disabled={!canTransform || !axisEnabled}
                  onChange={(event) => handleValueChange(axis, Number(event.currentTarget.value.replace(',', '.')))}
                />
                <em>{unitLabel}</em>
                <div className="transform-table__spinner">
                  <button
                    type="button"
                    aria-label={`Increase ${axis.toUpperCase()}`}
                    disabled={!canTransform || !axisEnabled}
                    onMouseDown={() => startRepeating(axis, 1)}
                    onMouseUp={stopRepeating}
                    onMouseLeave={stopRepeating}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Decrease ${axis.toUpperCase()}`}
                    disabled={!canTransform || !axisEnabled}
                    onMouseDown={() => startRepeating(axis, -1)}
                    onMouseUp={stopRepeating}
                    onMouseLeave={stopRepeating}
                  >
                    -
                  </button>
                </div>
              </div>
            </label>
          )
        })()
      ))}
    </div>
  )
}
