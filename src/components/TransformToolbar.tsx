import { useEffect, useRef, useState } from 'react'
import { useEditorStore, type TransformMode } from '../store/editorStore'
import magnetIcon from '../assets/icons/magnet.svg'
import { TransformTable } from './viewport/TransformTable'
import { formatTransformNumber, sanitizeNumber } from './viewport/transformShared'

type ToolbarMenu = Extract<TransformMode, 'translate' | 'rotate'> | null

export function TransformToolbar() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const moveInputRef = useRef<HTMLInputElement | null>(null)
  const rotateInputRef = useRef<HTMLInputElement | null>(null)
  const moveSnappingInitialRef = useRef(false)
  const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null)
  const [draftTranslationStep, setDraftTranslationStep] = useState('0')
  const [draftGridSnapping, setDraftGridSnapping] = useState(false)
  const [draftRotationStep, setDraftRotationStep] = useState('0')
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
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const setHud = useEditorStore((state) => state.setHud)
  const setTransformSettings = useEditorStore((state) => state.setTransformSettings)
  const setSelectedAnchorIndex = useEditorStore((state) => state.setSelectedAnchorIndex)

  const isEditingGodRaysDirection = Boolean(
    activeGodRaysDirectionBoxId &&
      selectedObjectId === activeGodRaysDirectionBoxId,
  )
  const canTransform = Boolean(
    selectedObjectId &&
      selectedNode &&
      selectedNode.type !== 'material' &&
      objectState &&
      runtimeObject,
  )
  const canTranslate = canTransform && !isEditingGodRaysDirection
  const canRotate = canTransform && (isEditingGodRaysDirection || selectedNode?.type !== 'light')
  const canScale = canTransform && !isEditingGodRaysDirection && selectedNode?.type !== 'light'

  useEffect(() => {
    if (!canTransform) {
      setOpenMenu(null)
    }
  }, [canTransform])

  useEffect(() => {
    if (!canRotate) {
      if (transformMode === 'rotate') {
        setHud({ transformMode: 'none' })
      }
      if (openMenu === 'rotate') {
        setOpenMenu(null)
      }
    }
  }, [canRotate, openMenu, setHud, transformMode])

  useEffect(() => {
    if (!canTranslate && openMenu === 'translate') {
      setOpenMenu(null)
    }
  }, [canTranslate, openMenu])

  useEffect(() => {
    if (!canScale && transformMode === 'scale') {
      setHud({ transformMode: 'none' })
    }
  }, [canScale, setHud, transformMode])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const handleModeClick = (mode: Exclude<TransformMode, 'none'>) => {
    if (
      !canTransform ||
      (mode === 'translate' && !canTranslate) ||
      (mode === 'rotate' && !canRotate) ||
      (mode === 'scale' && !canScale)
    ) {
      return
    }

    setHud({ transformMode: mode })
  }

  const handleMenuToggle = (mode: ToolbarMenu) => {
    if (!canTransform || (mode === 'translate' && !canTranslate) || (mode === 'rotate' && !canRotate)) {
      return
    }

    setOpenMenu((current) => (current === mode ? null : mode))
  }

  const displayedTranslationStep = formatTransformNumber(
    transformSettings.measurementUnit === 'm'
      ? transformSettings.translationStep / 100
      : transformSettings.translationStep,
  )
  const displayedRotationStep = formatTransformNumber(transformSettings.rotationStep)
  const isMoveDirty =
    draftTranslationStep !== String(displayedTranslationStep) ||
    draftGridSnapping !== moveSnappingInitialRef.current
  const isRotateDirty = draftRotationStep !== String(displayedRotationStep)

  useEffect(() => {
    if (openMenu === 'translate') {
      moveSnappingInitialRef.current = transformSettings.isGridSnapping
      setDraftTranslationStep(String(displayedTranslationStep))
      setDraftGridSnapping(transformSettings.isGridSnapping)
      window.setTimeout(() => {
        moveInputRef.current?.focus()
        moveInputRef.current?.select()
      }, 0)
    }
    if (openMenu === 'rotate') {
      setDraftRotationStep(String(displayedRotationStep))
      window.setTimeout(() => {
        rotateInputRef.current?.focus()
        rotateInputRef.current?.select()
      }, 0)
    }
  }, [displayedRotationStep, displayedTranslationStep, openMenu, transformSettings.isGridSnapping])

  const closeMenu = () => {
    setOpenMenu(null)
  }

  const commitMoveStep = () => {
    setTransformSettings({
      translationStep: Math.max(
        0,
        sanitizeNumber(Number(draftTranslationStep.replace(',', '.'))) *
          (transformSettings.measurementUnit === 'm' ? 100 : 1),
      ),
      isGridSnapping: draftGridSnapping,
    })
    moveSnappingInitialRef.current = draftGridSnapping
    closeMenu()
  }

  const cancelMoveStep = () => {
    setDraftTranslationStep(String(displayedTranslationStep))
    setDraftGridSnapping(moveSnappingInitialRef.current)
    setTransformSettings({ isGridSnapping: moveSnappingInitialRef.current })
    closeMenu()
  }

  const toggleGridSnapping = () => {
    const nextValue = !transformSettings.isGridSnapping
    const fallbackStep = transformSettings.translationStep > 0 ? transformSettings.translationStep : transformSettings.gridSize

    setDraftGridSnapping(nextValue)

    if (nextValue && transformSettings.translationStep <= 0 && fallbackStep > 0) {
      setDraftTranslationStep(
        String(
          formatTransformNumber(
            transformSettings.measurementUnit === 'm' ? fallbackStep / 100 : fallbackStep,
          ),
        ),
      )
      setTransformSettings({
        isGridSnapping: true,
        translationStep: fallbackStep,
      })
      return
    }

    setTransformSettings({ isGridSnapping: nextValue })
  }

  const commitRotateStep = () => {
    setTransformSettings({
      rotationStep: Math.max(0, sanitizeNumber(Number(draftRotationStep.replace(',', '.')))),
    })
    closeMenu()
  }

  const cancelRotateStep = () => {
    setDraftRotationStep(String(displayedRotationStep))
    closeMenu()
  }

  return (
    <div ref={rootRef} className="transform-toolbar" onContextMenu={(event) => event.preventDefault()}>
      <div className="transform-toolbar__mag-slot" aria-hidden={transformMode !== 'translate' || !canTransform}>
        {transformMode === 'translate' && canTransform ? (
          <button
            type="button"
            className={`transform-toolbar__button transform-toolbar__button--mag ${transformSettings.isGridSnapping ? 'is-active' : ''}`}
            disabled={!canTransform}
          aria-label={transformSettings.isGridSnapping ? 'Disable grid snapping' : 'Enable grid snapping'}
          title={transformSettings.isGridSnapping ? 'Disable grid snapping' : 'Enable grid snapping'}
          onClick={toggleGridSnapping}
        >
          <img src={magnetIcon} className="transform-toolbar__icon" alt="" aria-hidden="true" />
        </button>
      ) : null}
      </div>
      <button
        type="button"
        className={`transform-toolbar__button ${transformMode === 'translate' ? 'is-active' : ''}`}
        disabled={!canTranslate}
        onClick={() => handleModeClick('translate')}
        onContextMenu={(event) => {
          event.preventDefault()
          handleMenuToggle('translate')
        }}
      >
        Move
      </button>
      <button
        type="button"
        className={`transform-toolbar__button ${transformMode === 'rotate' ? 'is-active' : ''}`}
        disabled={!canRotate}
        onClick={() => handleModeClick('rotate')}
        onContextMenu={(event) => {
          event.preventDefault()
          handleMenuToggle('rotate')
        }}
      >
        Rotate
      </button>
      <button
        type="button"
        className={`transform-toolbar__button ${transformMode === 'scale' ? 'is-active' : ''}`}
        disabled={!canScale}
        onClick={() => handleModeClick('scale')}
      >
        Scale
      </button>
      <TransformTable />
      <button
        type="button"
        className="transform-toolbar__button"
        disabled={transformMode === 'rotate' || transformMode === 'scale'}
        onClick={() =>
          setTransformSettings({
            measurementUnit: transformSettings.measurementUnit === 'cm' ? 'm' : 'cm',
          })
        }
      >
        Units: {transformSettings.measurementUnit}
      </button>
      <button
        type="button"
        className={`transform-toolbar__button ${anchorModeEnabled ? 'is-active' : ''}`}
        disabled={!canTransform || isEditingGodRaysDirection}
        onClick={() => {
          const nextValue = !anchorModeEnabled
          setHud({ anchorModeEnabled: nextValue })
          if (!nextValue) {
            setSelectedAnchorIndex(null)
          }
        }}
      >
        Anchor
      </button>

      {openMenu === 'translate' ? (
        <div className="transform-toolbar__popup transform-toolbar__popup--move">
          <label className="transform-toolbar__field transform-toolbar__field--compact">
            <span>Step</span>
            <input
              ref={moveInputRef}
              type="number"
              min="0"
              step={transformSettings.measurementUnit === 'm' ? '0.001' : '0.1'}
              className={isMoveDirty ? 'is-dirty' : ''}
              value={draftTranslationStep}
              onChange={(event) => setDraftTranslationStep(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitMoveStep()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelMoveStep()
                }
              }}
            />
            <em>{transformSettings.measurementUnit}</em>
            <div className="transform-toolbar__actions">
              <button
                type="button"
                className="transform-toolbar__action transform-toolbar__action--confirm"
                onClick={commitMoveStep}
              >
                OK
              </button>
              <button
                type="button"
                className="transform-toolbar__action transform-toolbar__action--cancel"
                onClick={cancelMoveStep}
              >
                X
              </button>
            </div>
          </label>
        </div>
      ) : null}

      {openMenu === 'rotate' ? (
        <div className="transform-toolbar__popup transform-toolbar__popup--rotate">
          <label className="transform-toolbar__field transform-toolbar__field--compact">
            <span>Step</span>
            <input
              ref={rotateInputRef}
              type="number"
              min="0"
              step="1"
              className={isRotateDirty ? 'is-dirty' : ''}
              value={draftRotationStep}
              onChange={(event) => setDraftRotationStep(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRotateStep()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRotateStep()
                }
              }}
            />
            <em>deg</em>
            <div className="transform-toolbar__actions">
              <button
                type="button"
                className="transform-toolbar__action transform-toolbar__action--confirm"
                onClick={commitRotateStep}
              >
                OK
              </button>
              <button
                type="button"
                className="transform-toolbar__action transform-toolbar__action--cancel"
                onClick={cancelRotateStep}
              >
                X
              </button>
            </div>
          </label>
        </div>
      ) : null}
    </div>
  )
}
