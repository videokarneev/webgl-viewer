import { useEffect, type ReactNode } from 'react'
import { useEditorStore } from '../store/editorStore'
import { requestFlightLock } from './viewport/flightLockBridge'

function IconButton({
  active = false,
  className = '',
  title,
  onClick,
  children,
}: {
  active?: boolean
  className?: string
  title: string
  onClick: () => void
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
  const hud = useEditorStore((state) => state.hud)
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const flightSpeed = useEditorStore((state) => state.viewer.flightSpeed)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setZenMode = useEditorStore((state) => state.setZenMode)

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
        <div
          className="viewport-hud__group"
          role="toolbar"
          aria-label="Viewport tools"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <IconButton
            active={hud.gridVisible}
            title="Toggle grid"
            onClick={() => setHud({ gridVisible: !hud.gridVisible })}
          >
            Grid
          </IconButton>
          <IconButton
            active={hud.axesVisible}
            title="Toggle axes"
            onClick={() => setHud({ axesVisible: !hud.axesVisible })}
          >
            Axes
          </IconButton>
          <IconButton
            active={hud.postEffectsEnabled}
            title="Toggle post-processing"
            onClick={() => setHud({ postEffectsEnabled: !hud.postEffectsEnabled })}
          >
            FX
          </IconButton>
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
