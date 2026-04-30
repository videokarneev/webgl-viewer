import { useEffect, useState } from 'react'
import { Sidebar } from '../components/Sidebar'
import { Viewport } from '../components/Viewport'
import { Inspector } from '../components/Inspector'
import { AssetController } from '../components/AssetController'
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
    store.setEnvironment({
      source: objectUrl,
      kind: 'panorama',
      background: 'environment',
      backgroundVisible: true,
    })
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
  const sidebarVisible = useEditorStore((state) => state.hud.sidebarVisible)
  const inspectorVisible = useEditorStore((state) => state.hud.inspectorVisible)
  const [dragDepth, setDragDepth] = useState(0)

  useEffect(() => {
    document.body.classList.toggle('is-dragging', dragDepth > 0)
    return () => {
      document.body.classList.remove('is-dragging')
    }
  }, [dragDepth])

  return (
    <main
      className="app-shell"
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
    >
      <AssetController />
      {sidebarVisible ? <Sidebar /> : null}
      <Viewport />
      {inspectorVisible ? <Inspector /> : null}
    </main>
  )
}
