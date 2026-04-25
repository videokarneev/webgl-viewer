import { useRef } from 'react'
import { useEditorStore } from '../store/editorStore'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { copySceneConfigToClipboard, downloadSceneConfig } from '../features/config/buildSceneConfig'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

export function AssetDock() {
  const assets = useEditorStore((state) => state.assets)
  const status = useEditorStore((state) => state.status)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const requestConfigImport = useEditorStore((state) => state.requestConfigImport)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setStatus = useEditorStore((state) => state.setStatus)

  const modelInputRef = useRef<HTMLInputElement>(null)
  const atlasInputRef = useRef<HTMLInputElement>(null)
  const hdriInputRef = useRef<HTMLInputElement>(null)
  const configInputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="asset-dock">
      <div className="asset-dock__actions">
        <button type="button" onClick={() => modelInputRef.current?.click()}>
          Load Model
        </button>
        <button type="button" onClick={() => atlasInputRef.current?.click()}>
          Load Atlas
        </button>
        <button type="button" onClick={() => hdriInputRef.current?.click()}>
          Load HDRI
        </button>
        <button type="button" onClick={() => configInputRef.current?.click()}>
          Load Config
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await copySceneConfigToClipboard()
              setStatus('Scene config copied to clipboard.')
            } catch (error) {
              console.error(error)
              setStatus('Failed to copy config to clipboard.')
            }
          }}
        >
          Copy JSON
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              downloadSceneConfig()
              setStatus('Scene config downloaded.')
            } catch (error) {
              console.error(error)
              setStatus('Failed to download config.')
            }
          }}
        >
          Download Config
        </button>
      </div>

      <div className="asset-dock__meta">
        <span>Model: {assets.model ?? 'none'}</span>
        <span>Atlas: {assets.atlas ?? 'none'}</span>
        <span>HDRI: {assets.reflections ?? 'default studio'}</span>
      </div>

      <p className="asset-dock__status">{status}</p>

      <input
        ref={configInputRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return

          try {
            const config = await readSceneConfigFile(file)
            requestConfigImport({ config, label: file.name })
          } catch (error) {
            console.error(error)
            setStatus(`Failed to import config: ${file.name}`)
          } finally {
            event.currentTarget.value = ''
          }
        }}
      />

      <input
        ref={modelInputRef}
        hidden
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestModelLoad({ url: createObjectUrl(file), label: file.name, revokeAfter: true, fileSize: file.size })
          event.currentTarget.value = ''
        }}
      />

      <input
        ref={atlasInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestAtlasLoad({ url: createObjectUrl(file), label: file.name, revokeAfter: true, fileSize: null })
          event.currentTarget.value = ''
        }}
      />

      <input
        ref={hdriInputRef}
        hidden
        type="file"
        accept=".hdr,image/vnd.radiance"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          const url = createObjectUrl(file)
          setEnvironment({ customHdriUrl: url })
          requestEnvironmentLoad({
            url,
            label: file.name,
            kind: 'hdri',
            revokeAfter: false,
            fileSize: null,
          })
          event.currentTarget.value = ''
        }}
      />
    </section>
  )
}
