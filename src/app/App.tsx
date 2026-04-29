import { useEffect, useRef } from 'react'
import { SceneCanvas } from '../components/SceneCanvas'
import { SceneManager } from '../components/SceneManager'
import { InspectorDock } from '../components/InspectorDock'
import { useEditorStore } from '../store/editorStore'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { ViewportPresentationProvider } from '../features/viewport/ViewportPresentationContext'

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
    store.requestModelLoad({ url: URL.createObjectURL(file), label: file.name, revokeAfter: true, fileSize: file.size })
    return
  }

  if (file.name.match(/\.hdr$/i)) {
    const url = URL.createObjectURL(file)
    store.setEnvironment({ customHdriUrl: url, isEnvironmentEnabled: true })
    store.requestEnvironmentLoad({
      url,
      label: file.name,
      kind: 'hdri',
      revokeAfter: false,
      fileSize: null,
    })
    return
  }

  if (file.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
    store.requestAtlasLoad({ url: URL.createObjectURL(file), label: file.name, revokeAfter: true, fileSize: null })
  }
}

export function App() {
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const didBootstrapRef = useRef(false)

  useEffect(() => {
    if (didBootstrapRef.current) {
      return
    }
    didBootstrapRef.current = true
    requestModelLoad({ url: '/assets/ring.glb', label: 'demo://ring.glb', revokeAfter: false, fileSize: null })
    requestAtlasLoad({ url: '/assets/fire.jpg', label: 'demo://fire.jpg', revokeAfter: false, fileSize: null })
  }, [requestAtlasLoad, requestModelLoad])

  return (
    <ViewportPresentationProvider>
      <main
        className="app-shell"
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          Array.from(event.dataTransfer.files ?? []).forEach(routeDroppedFile)
        }}
      >
        <SceneCanvas />
        <SceneManager />
        <InspectorDock />
      </main>
    </ViewportPresentationProvider>
  )
}
