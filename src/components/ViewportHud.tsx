import { useEditorStore } from '../store/editorStore'

function IconButton({
  active = false,
  title,
  onClick,
  children,
}: {
  active?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={active ? 'is-active' : ''}
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

export function ViewportHud({ onResetCamera }: { onResetCamera: () => void }) {
  const hud = useEditorStore((state) => state.hud)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  return (
    <div className="viewport-hud" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
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
            setHud({ orbitEnabled: false })
            setViewer({ cameraMode: 'firstPerson' })
          }}
        >
          Flight
        </IconButton>
        <IconButton title="Reset camera" onClick={onResetCamera}>
          Reset Camera
        </IconButton>
      </div>
    </div>
  )
}
