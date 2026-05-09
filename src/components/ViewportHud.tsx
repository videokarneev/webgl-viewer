import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditorStore } from '../store/editorStore'
import { requestFlightLock } from './viewport/flightLockBridge'
import { formatTransformNumber, sanitizeNumber } from './viewport/transformShared'

function IconButton({
  active = false,
  className = '',
  title,
  onClick,
  onContextMenu,
  children,
}: {
  active?: boolean
  className?: string
  title: string
  onClick: () => void
  onContextMenu?: () => void
  children: ReactNode
}) {
  const buttonClassName = [className, active ? 'is-active' : ''].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={buttonClassName}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onContextMenu()
      }}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

function FullscreenIcon() {
  return (
    <svg className="fullscreen-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

function WindowedIcon() {
  return (
    <svg className="fullscreen-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  )
}

export function ViewportHud({ onResetCamera }: { onResetCamera: () => void }) {
  const gridMenuRef = useRef<HTMLDivElement | null>(null)
  const gridInputRef = useRef<HTMLInputElement | null>(null)
  const [isGridMenuOpen, setIsGridMenuOpen] = useState(false)
  const [draftGridSize, setDraftGridSize] = useState('1')
  const hud = useEditorStore((state) => state.hud)
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const flightSpeed = useEditorStore((state) => state.viewer.flightSpeed)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const setHud = useEditorStore((state) => state.setHud)
  const setTransformSettings = useEditorStore((state) => state.setTransformSettings)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setZenMode = useEditorStore((state) => state.setZenMode)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!gridMenuRef.current?.contains(event.target as Node)) {
        setIsGridMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  const displayedGridSize = formatTransformNumber(
    transformSettings.measurementUnit === 'm'
      ? transformSettings.gridSize / 100
      : transformSettings.gridSize,
  )
  const isGridDirty = draftGridSize !== String(displayedGridSize)

  useEffect(() => {
    if (!isGridMenuOpen) {
      return
    }

    setDraftGridSize(String(displayedGridSize))
    window.setTimeout(() => {
      gridInputRef.current?.focus()
      gridInputRef.current?.select()
    }, 0)
  }, [displayedGridSize, isGridMenuOpen])

  const commitGridSize = () => {
    const nextDisplayValue = sanitizeNumber(Number(draftGridSize.replace(',', '.')))
    const nextInternalValue =
      nextDisplayValue * (transformSettings.measurementUnit === 'm' ? 100 : 1)
    const resolvedGridSize = nextInternalValue > 0 ? nextInternalValue : transformSettings.gridSize

    setTransformSettings({
      gridSize: resolvedGridSize,
      translationStep:
        transformSettings.isGridSnapping || transformSettings.translationStep <= 0
          ? resolvedGridSize
          : transformSettings.translationStep,
    })
    setIsGridMenuOpen(false)
  }

  const cancelGridSize = () => {
    setDraftGridSize(String(displayedGridSize))
    setIsGridMenuOpen(false)
  }

  useEffect(() => {
    const syncFullscreenState = () => {
      if (document.fullscreenElement) {
        setZenMode(true)
      }
    }

    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [setZenMode])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        setZenMode(false)
        await document.exitFullscreen()
      } else {
        setZenMode(true)
        await document.documentElement.requestFullscreen()
      }
    } catch (error) {
      setZenMode(Boolean(document.fullscreenElement))
      console.error('[Fullscreen Error]: Failed to toggle fullscreen mode', error)
    }
  }

  return (
    <>
      <div className="viewport-hud" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div
          className="viewport-hud__group"
          role="toolbar"
          aria-label="Viewport tools"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="viewport-hud__menu-anchor" ref={gridMenuRef}>
            <IconButton
              active={hud.gridVisible || isGridMenuOpen}
              title="Toggle grid"
              onClick={() => setHud({ gridVisible: !hud.gridVisible })}
              onContextMenu={() => {
                setDraftGridSize(String(displayedGridSize))
                setIsGridMenuOpen((value) => !value)
              }}
            >
              Grid
            </IconButton>
            {isGridMenuOpen ? (
              <div className="viewport-hud__popup">
                <label className="viewport-hud__popup-field">
                  <span>Step</span>
                  <input
                    ref={gridInputRef}
                    type="number"
                    min="0"
                    step={transformSettings.measurementUnit === 'm' ? '0.001' : '0.1'}
                    className={isGridDirty ? 'is-dirty' : ''}
                    value={draftGridSize}
                    onChange={(event) => setDraftGridSize(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitGridSize()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelGridSize()
                      }
                    }}
                  />
                  <em>{transformSettings.measurementUnit}</em>
                  <div className="viewport-hud__popup-actions">
                    <button type="button" className="viewport-hud__popup-action viewport-hud__popup-action--confirm" onClick={commitGridSize}>
                      ✔
                    </button>
                    <button type="button" className="viewport-hud__popup-action viewport-hud__popup-action--cancel" onClick={cancelGridSize}>
                      ✖
                    </button>
                  </div>
                </label>
              </div>
            ) : null}
          </div>
          <IconButton
            active={cameraMode === 'orbit'}
            title="Orbit camera mode"
            onClick={() => {
              setHud({ orbitEnabled: true })
              setViewer({ cameraMode: 'orbit' })
            }}
          >
            Orbit
          </IconButton>
          <IconButton
            active={cameraMode === 'firstPerson'}
            title="Flight camera mode"
            onClick={() => {
              requestFlightLock()
            }}
          >
            Flight
          </IconButton>
          <IconButton title="Reset camera" onClick={onResetCamera}>
            Reset Camera
          </IconButton>
        </div>
        {cameraMode === 'firstPerson' ? (
          <div
            className="viewport-hud__speed-row"
            role="toolbar"
            aria-label="Flight speed"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((speed) => (
              <button
                key={speed}
                type="button"
                className={flightSpeed === speed ? 'is-active' : ''}
                aria-label={`Set flight speed ${speed}`}
                title={`Flight speed ${speed}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setViewer({ flightSpeed: speed })
                }}
              >
                {speed}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <IconButton
        active={isZenMode}
        className="fullscreen-btn"
        title={isZenMode ? 'Exit fullscreen' : 'Enter fullscreen'}
        onClick={toggleFullscreen}
      >
        {isZenMode ? <WindowedIcon /> : <FullscreenIcon />}
      </IconButton>
    </>
  )
}
