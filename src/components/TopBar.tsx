import { useMemo, useRef } from 'react'
import { downloadSceneConfig } from '../features/config/buildSceneConfig'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { useEditorStore } from '../store/editorStore'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function formatDiskSize(bytes: number | null) {
  if (!bytes) {
    return '--'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function TopBar() {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const materials = useEditorStore((state) => state.materials)
  const runtime = useEditorStore((state) => state.runtime)
  const assets = useEditorStore((state) => state.assets)
  const metrics = useEditorStore((state) => state.viewportMetrics)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestConfigImport = useEditorStore((state) => state.requestConfigImport)
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const setStatus = useEditorStore((state) => state.setStatus)
  const glbInputRef = useRef<HTMLInputElement | null>(null)
  const configInputRef = useRef<HTMLInputElement | null>(null)

  const objectCount = useMemo(
    () => Object.values(sceneGraph).filter((node) => node.type !== 'material').length,
    [sceneGraph],
  )

  const textureStats = useMemo(() => {
    const textures = new Map<string, { width: number; height: number }>()

    Object.values(runtime.materialById).forEach((material) => {
      const standardMaterial = material as {
        map?: { uuid: string; image?: { width?: number; height?: number } }
        emissiveMap?: { uuid: string; image?: { width?: number; height?: number } }
        normalMap?: { uuid: string; image?: { width?: number; height?: number } }
        roughnessMap?: { uuid: string; image?: { width?: number; height?: number } }
        metalnessMap?: { uuid: string; image?: { width?: number; height?: number } }
        aoMap?: { uuid: string; image?: { width?: number; height?: number } }
      }

      ;['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((slot) => {
        const texture = standardMaterial[slot as keyof typeof standardMaterial] as
          | { uuid: string; image?: { width?: number; height?: number } }
          | undefined
        if (!texture?.uuid) {
          return
        }
        textures.set(texture.uuid, {
          width: texture.image?.width ?? 512,
          height: texture.image?.height ?? 512,
        })
      })
    })

    const totalBytes = Array.from(textures.values()).reduce(
      (sum, texture) => sum + texture.width * texture.height * 4 * 1.33,
      0,
    )

    return {
      count: textures.size,
      mb: totalBytes / (1024 * 1024),
    }
  }, [runtime.materialById])

  const metricRows = useMemo(
    () => [
      { metric: 'Vertices', total: metrics.vertices.toLocaleString('en-US'), none: '0' },
      { metric: 'Triangles', total: metrics.triangles.toLocaleString('en-US'), none: '0' },
      { metric: 'VRAM Textures', total: `${textureStats.count} (${textureStats.mb.toFixed(1)} MB)`, none: '--' },
      { metric: 'Disk', total: formatDiskSize(assets.fileSize), none: '--' },
      { metric: 'Draw Calls', total: metrics.drawCalls.toLocaleString('en-US'), none: '--' },
      { metric: 'FPS', total: metrics.fps.toLocaleString('en-US'), none: '--' },
    ],
    [assets.fileSize, metrics.drawCalls, metrics.fps, metrics.triangles, metrics.vertices, textureStats.count, textureStats.mb],
  )

  return (
    <header className="app-topbar">
      <input
        ref={glbInputRef}
        className="hidden-input"
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestModelLoad({
            url: createObjectUrl(file),
            label: file.name,
            revokeAfter: true,
            fileSize: file.size,
          })
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={configInputRef}
        className="hidden-input"
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
      <div className="app-topbar__brand">
        <div className="app-topbar__title-row">
          <p className="panel-eyebrow">GLB Viewer</p>
          <p className="panel-meta">
            {objectCount} OBJECTS / {Object.keys(materials).length} MATERIALS
          </p>
        </div>
        <div className="app-topbar__action-grid">
          <button type="button" className="tool-button" onClick={() => glbInputRef.current?.click()}>
            <span className="tool-button__glyph">GLB</span>
            <span className="tool-button__label">load GLB</span>
          </button>
          <button type="button" className="tool-button" onClick={() => configInputRef.current?.click()}>
            <span className="tool-button__glyph">LOAD</span>
            <span className="tool-button__label">config</span>
          </button>
          <button type="button" className="tool-button" onClick={() => downloadSceneConfig()}>
            <span className="tool-button__glyph">SAVE</span>
            <span className="tool-button__label">Config</span>
          </button>
          <button type="button" className="tool-button project-toolbar__reset" onClick={() => requestSceneReset()}>
            <span className="tool-button__glyph">RST</span>
            <span className="tool-button__label">Reset Scene</span>
          </button>
        </div>
      </div>
      <div className="app-topbar__dashboard">
        <div className="app-topbar__dashboard-head">
          <span className="dashboard-stat dashboard-stat--label">Metric</span>
          <span className="dashboard-stat dashboard-stat--label">Total</span>
          <span className="dashboard-stat dashboard-stat--label">None</span>
        </div>
        <div className="app-topbar__dashboard-body">
          {metricRows.map((row) => (
            <div key={row.metric} className="app-topbar__dashboard-row">
              <span className="dashboard-stat dashboard-stat--label">{row.metric}</span>
              <strong className="dashboard-stat">{row.total}</strong>
              <strong className="dashboard-stat">{row.none}</strong>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
}
