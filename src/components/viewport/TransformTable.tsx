import { useEffect, useMemo, useRef } from 'react'
import { useEditorStore } from '../../store/editorStore'
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
  const runtimeObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const transformMode = useEditorStore((state) => state.hud.transformMode)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)

  const canTransform = Boolean(
    selectedObjectId &&
      selectedNode &&
      selectedNode.type !== 'material' &&
      objectState &&
      runtimeObject,
  )

  const displayedValues = useMemo(() => {
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

    return {
      x: formatTransformNumber(toDisplayDistance(objectState.position[0], transformSettings.measurementUnit)),
      y: formatTransformNumber(toDisplayDistance(objectState.position[1], transformSettings.measurementUnit)),
      z: formatTransformNumber(toDisplayDistance(objectState.position[2], transformSettings.measurementUnit)),
    }
  }, [objectState, transformMode, transformSettings.measurementUnit])

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
    if (!canTransform || !selectedObjectId || !selectedNode || !runtimeObject) {
      return
    }

    const nextValue = sanitizeNumber(value)
    if (transformMode === 'rotate') {
      runtimeObject.rotation[axis] = toInternalRotation(nextValue)
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

  return (
    <div className="transform-table">
      {POSITION_AXES.map((axis) => (
        <label key={axis} className="transform-table__field">
          <span>{axis.toUpperCase()}:</span>
          <div className="transform-table__control">
            <input
              type="text"
              inputMode="decimal"
              value={canTransform ? String(displayedValues[axis]) : '-'}
              disabled={!canTransform}
              onChange={(event) =>
                handleValueChange(axis, Number(event.currentTarget.value.replace(',', '.')))
              }
            />
            <em>{transformMode === 'rotate' ? '°' : transformSettings.measurementUnit}</em>
            <div className="transform-table__spinner">
              <button
                type="button"
                aria-label={`Increase ${axis.toUpperCase()}`}
                disabled={!canTransform}
                onMouseDown={() => startRepeating(axis, 1)}
                onMouseUp={stopRepeating}
                onMouseLeave={stopRepeating}
              >
                +
              </button>
              <button
                type="button"
                aria-label={`Decrease ${axis.toUpperCase()}`}
                disabled={!canTransform}
                onMouseDown={() => startRepeating(axis, -1)}
                onMouseUp={stopRepeating}
                onMouseLeave={stopRepeating}
              >
                -
              </button>
            </div>
          </div>
        </label>
      ))}
    </div>
  )
}
