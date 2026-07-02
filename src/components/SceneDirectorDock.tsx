import { useEditorStore } from '../store/editorStore'

function AnimatorDirectorPanel() {
  return (
    <div className="scene-director-placeholder">
      <strong>Animator</strong>
      <span>Timeline, clips, and keyframes will use this wider viewport dock.</span>
    </div>
  )
}

export function SceneDirectorDock() {
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const hud = useEditorStore((state) => state.hud)
  const setHud = useEditorStore((state) => state.setHud)

  if (isZenMode || !hud.directorDockOpen || hud.directorMode !== 'animator') {
    return null
  }

  const dockClassName = [
    'scene-director-dock',
    !hud.sidebarVisible ? 'scene-director-dock--no-left' : '',
    !hud.inspectorVisible ? 'scene-director-dock--no-right' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={dockClassName} aria-label="Scene director animator">
      <header className="scene-director-dock__header scene-director-dock__header--compact">
        <div>
          <p className="panel-eyebrow">SCN Director</p>
          <strong>Animator</strong>
        </div>
        <button
          type="button"
          className="scene-director-dock__close"
          aria-label="Close scene director"
          onClick={() => setHud({ directorDockOpen: false })}
        >
          x
        </button>
      </header>
      <div className="scene-director-dock__body">
        <AnimatorDirectorPanel />
      </div>
    </section>
  )
}
