import { useEffect, useState } from 'react'
import { Sidebar } from '../components/Sidebar'
import { Viewport } from '../components/Viewport'
import { Inspector } from '../components/Inspector'
import { SceneDirectorDock } from '../components/SceneDirectorDock'
import { AssetController } from '../components/AssetController'
import { BackgroundAudioController } from '../components/BackgroundAudioController'
import { useEditorStore } from '../store/editorStore'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'

function routeDroppedFile(file: File) {
  const store = useEditorStore.getState()

  if (file.name.endsWith('.json')) {
    readSceneConfigFile(file)
      .then((config) => {
        store.requestConfigImport({ config, label: file.name })
      })
      .catch((error) => {
        console.error(error)
        store.setStatus(`Failed to import config: ${file.name}`)
      })
    return
  }

  if (file.name.match(/\.(glb|gltf)$/i)) {
    const objectUrl = URL.createObjectURL(file)
    store.requestModelLoad({ url: objectUrl, label: file.name, revokeAfter: true, fileSize: file.size })
    return
  }

  if (file.name.match(/\.(hdr|exr)$/i)) {
    const objectUrl = URL.createObjectURL(file)
    store.setEnvironment({ customHdriUrl: objectUrl, isEnvironmentEnabled: true })
    store.requestEnvironmentLoad({
      url: objectUrl,
      label: file.name,
      kind: 'hdri',
      revokeAfter: true,
      fileSize: file.size,
    })
    return
  }

  if (file.name.match(/\.(png|jpg|jpeg)$/i)) {
    const objectUrl = URL.createObjectURL(file)
    store.setBackgroundPanoramaUrl(objectUrl)
    store.setBackgroundMode('background')
    store.requestEnvironmentLoad({
      url: objectUrl,
      label: file.name,
      kind: 'panorama',
      revokeAfter: true,
      fileSize: file.size,
    })
  }
}

export function App() {
  const isZenMode = useEditorStore((state) => state.isZenMode)
  const sidebarVisible = useEditorStore((state) => state.hud.sidebarVisible)
  const inspectorVisible = useEditorStore((state) => state.hud.inspectorVisible)
  const sceneResetNonce = useEditorStore((state) => state.sceneResetNonce)
  const canUndo = useEditorStore((state) => state.history.past.length > 0)
  const canRedo = useEditorStore((state) => state.history.future.length > 0)
  const undoHistory = useEditorStore((state) => state.undoHistory)
  const redoHistory = useEditorStore((state) => state.redoHistory)
  const beginHistoryGesture = useEditorStore((state) => state.beginHistoryGesture)
  const endHistoryGesture = useEditorStore((state) => state.endHistoryGesture)
  const [dragDepth, setDragDepth] = useState(0)

  useEffect(() => {
    document.body.classList.toggle('is-dragging', dragDepth > 0)
    return () => {
      document.body.classList.remove('is-dragging')
    }
  }, [dragDepth])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (!event.ctrlKey && !event.metaKey) {
        if (event.key === 'Delete') {
          const state = useEditorStore.getState()
          const selectedObjectId = state.selectedObjectId
          const selectedInterfaceElementId = state.selectedInterfaceElementId

          if (!selectedObjectId && !selectedInterfaceElementId) {
            return
          }

          event.preventDefault()

          if (selectedInterfaceElementId) {
            state.removeInterfaceElement(selectedInterfaceElementId)
            state.setHud({ transformMode: 'none' })
            return
          }

          if (!selectedObjectId) {
            return
          }

          if (selectedObjectId === 'effect:bloom') {
            state.setHud({ postEffectsEnabled: false, postEffectsVisible: false, transformMode: 'none' })
            state.setSelectedObjectId(null)
            return
          }

          if (selectedObjectId === 'effect:scene-audio') {
            state.setBackgroundAudio({
              isAdded: false,
              enabled: false,
              previewEnabled: true,
              previewPlaying: true,
              previewCurrentTime: 0,
              previewDuration: 0,
              assetLabel: null,
              assetUrl: null,
              fileSize: null,
            })
            state.setSelectedObjectId(null)
            state.setHud({ transformMode: 'none' })
            return
          }

          if (selectedObjectId === 'environment:system' || selectedObjectId === 'environment:hdri') {
            state.removeEnvironment()
            state.setHud({ transformMode: 'none' })
            return
          }

          if (selectedObjectId === 'light:ambient:system') {
            state.removeAmbientLight()
            state.setHud({ transformMode: 'none' })
            return
          }

          const selectedNode = state.sceneGraph[selectedObjectId] ?? null
          if (!selectedNode && selectedObjectId.startsWith('effect:god-rays:')) {
            state.removeGodRaysBox(selectedObjectId)
            state.setHud({ transformMode: 'none' })
            return
          }

          if (selectedNode?.type === 'effect' && selectedObjectId.startsWith('effect:god-rays:')) {
            state.removeGodRaysBox(selectedObjectId)
            state.setHud({ transformMode: 'none' })
            return
          }

          if (selectedNode?.type === 'light') {
            state.removeExtraLight(selectedObjectId)
            state.setHud({ transformMode: 'none' })
            return
          }

          state.deleteObject(selectedObjectId)
          state.setHud({ transformMode: 'none' })
        }
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoHistory()
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoHistory()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [redoHistory, undoHistory])

  return (
    <main
      className={isZenMode ? 'app-shell app-shell--zen' : 'app-shell'}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragDepth((value) => value + 1)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragDepth((value) => Math.max(0, value - 1))
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragDepth(0)
        Array.from(event.dataTransfer.files ?? []).forEach(routeDroppedFile)
      }}
      onPointerDownCapture={(event) => {
        const target = event.target
        if (target instanceof HTMLInputElement && target.type === 'range') {
          beginHistoryGesture()
        }
      }}
      onFocusCapture={(event) => {
        const target = event.target
        if (
          target instanceof HTMLInputElement &&
          (target.type === 'number' || target.inputMode === 'decimal')
        ) {
          beginHistoryGesture()
        }
      }}
      onPointerUpCapture={(event) => {
        const target = event.target
        if (target instanceof HTMLInputElement && target.type === 'range') {
          endHistoryGesture()
        }
      }}
      onPointerCancelCapture={(event) => {
        const target = event.target
        if (target instanceof HTMLInputElement && target.type === 'range') {
          endHistoryGesture()
        }
      }}
      onBlurCapture={(event) => {
        const target = event.target
        if (
          target instanceof HTMLInputElement &&
          (target.type === 'range' || target.type === 'number' || target.inputMode === 'decimal')
        ) {
          endHistoryGesture()
        }
      }}
    >
      <AssetController key={`assets:${sceneResetNonce}`} />
      <BackgroundAudioController key={`audio:${sceneResetNonce}`} />
      {!isZenMode && sidebarVisible ? <Sidebar key={`sidebar:${sceneResetNonce}`} /> : null}
      <Viewport key={`viewport:${sceneResetNonce}`} />
      {!isZenMode ? <SceneDirectorDock key={`director:${sceneResetNonce}`} /> : null}
      {!isZenMode && inspectorVisible ? (
        <div key={`history:${sceneResetNonce}`} className="app-shell__history-floating" aria-label="History controls">
          <button
            type="button"
            className="app-shell__history-button"
            onClick={undoHistory}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="app-shell__history-button"
            onClick={redoHistory}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
          >
            ↷
          </button>
        </div>
      ) : null}
      {!isZenMode && inspectorVisible ? <Inspector key={`inspector:${sceneResetNonce}`} /> : null}
    </main>
  )
}
