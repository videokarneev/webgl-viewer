import { useMemo, useRef, useState } from 'react'
import { Outliner } from './Outliner'
import { downloadSceneConfig } from '../features/config/buildSceneConfig'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { useEditorStore } from '../store/editorStore'

type SidebarTab = 'scn' | 'cam' | 'lgt' | 'fx'

const TAB_LABELS: Record<SidebarTab, string> = {
  scn: 'SCN',
  cam: 'CAM',
  lgt: 'LGT',
  fx: 'FX',
}

const LIGHT_PRESETS = {
  studio: { hemisphere: 0.9, key: 1.8, fill: 0.85, rim: 0.65 },
  product: { hemisphere: 0.72, key: 2.2, fill: 1.1, rim: 0.9 },
  sunset: { hemisphere: 0.45, key: 1.4, fill: 0.55, rim: 1.15 },
  night: { hemisphere: 0.2, key: 0.9, fill: 0.24, rim: 0.48 },
} as const

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function SceneTabContent() {
  const environment = useEditorStore((state) => state.environment)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const removeEnvironment = useEditorStore((state) => state.removeEnvironment)
  const hdriInputRef = useRef<HTMLInputElement | null>(null)
  const panoramaInputRef = useRef<HTMLInputElement | null>(null)
  const [panoramaUrl, setPanoramaUrl] = useState(environment.source ?? '')

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Background</span>
        <label className="left-select">
          <span>Mode</span>
          <select
            value={environment.background}
            onChange={(event) =>
              setEnvironment({
                background: event.currentTarget.value as typeof environment.background,
              })
            }
          >
            <option value="color">Color</option>
            <option value="environment">Environment</option>
            <option value="none">None</option>
            <option value="reflections">Reflections</option>
          </select>
        </label>
        <div className="scene-inline-controls">
          <label className="left-select left-select--inline">
            <span>HDRI</span>
            <select
              value={environment.kind}
              onChange={(event) =>
                setEnvironment({
                  kind: event.currentTarget.value as typeof environment.kind,
                })
              }
            >
              <option value="default">Default</option>
              <option value="hdri">HDRI</option>
              <option value="panorama">Panorama</option>
            </select>
          </label>
          <label className="left-color-field left-color-field--swatch">
            <span className="visually-hidden">Background color</span>
            <input
              type="color"
              value={environment.backgroundColor}
              onChange={(event) => setEnvironment({ backgroundColor: event.currentTarget.value })}
            />
          </label>
        </div>
        <label className="left-slider">
          <span>Background Rotation</span>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={environment.backgroundRotation}
            onInput={(event) => setEnvironment({ backgroundRotation: Number(event.currentTarget.value) })}
          />
          <strong>{environment.backgroundRotation.toFixed(0)} deg</strong>
        </label>
        <label className="left-slider">
          <span>Background Intensity</span>
          <input
            type="range"
            min="0"
            max="4"
            step="0.01"
            value={environment.backgroundIntensity}
            onInput={(event) => setEnvironment({ backgroundIntensity: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(environment.backgroundIntensity)}</strong>
        </label>
        <label className="left-slider">
          <span>Blur</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={environment.backgroundBlur}
            onInput={(event) => setEnvironment({ backgroundBlur: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(environment.backgroundBlur)}</strong>
        </label>
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={environment.backgroundVisible}
            onChange={(event) => setEnvironment({ backgroundVisible: event.currentTarget.checked })}
          />
          <span>Visible</span>
        </label>
        <input
          ref={hdriInputRef}
          className="hidden-input"
          type="file"
          accept=".hdr,.exr"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (!file) return
            const url = createObjectUrl(file)
            setEnvironment({ customHdriUrl: url, kind: 'hdri', isEnvironmentEnabled: true })
            requestEnvironmentLoad({
              url,
              label: file.name,
              kind: 'hdri',
              revokeAfter: true,
              fileSize: file.size,
            })
            event.currentTarget.value = ''
          }}
        />
        <input
          ref={panoramaInputRef}
          className="hidden-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (!file) return
            const url = createObjectUrl(file)
            setPanoramaUrl(url)
            setEnvironment({
              source: url,
              kind: 'panorama',
              background: 'environment',
              backgroundVisible: true,
            })
            requestEnvironmentLoad({
              url,
              label: file.name,
              kind: 'panorama',
              revokeAfter: true,
              fileSize: file.size,
            })
            event.currentTarget.value = ''
          }}
        />
        <div className="outliner-actions outliner-actions--secondary">
          <button type="button" className="tool-button" onClick={() => hdriInputRef.current?.click()}>
            <span className="tool-button__glyph">HDR</span>
            <span className="tool-button__label">Load HDRI</span>
          </button>
          <button type="button" className="tool-button" onClick={() => panoramaInputRef.current?.click()}>
            <span className="tool-button__glyph">360</span>
            <span className="tool-button__label">Load Pano</span>
          </button>
        </div>
        <label className="left-select">
          <span>Panorama URL</span>
          <select
            value=""
            onChange={() => undefined}
            style={{ display: 'none' }}
          />
          <input
            className="search-input"
            type="text"
            placeholder="Paste panorama URL"
            value={panoramaUrl}
            onChange={(event) => setPanoramaUrl(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="tool-button"
          onClick={() => {
            const url = panoramaUrl.trim()
            if (!url) return
            setEnvironment({
              source: url,
              kind: 'panorama',
              background: 'environment',
              backgroundVisible: true,
            })
            requestEnvironmentLoad({
              url,
              label: url,
              kind: 'panorama',
              revokeAfter: false,
              fileSize: null,
            })
          }}
        >
          <span className="tool-button__glyph">360</span>
          <span className="tool-button__label">Apply URL</span>
        </button>
        <button type="button" className="tool-button" onClick={() => removeEnvironment()}>
          <span className="tool-button__glyph">CLR</span>
          <span className="tool-button__label">Reset Environment</span>
        </button>
      </div>
    </div>
  )
}

function CameraTabContent() {
  const hud = useEditorStore((state) => state.hud)
  const viewer = useEditorStore((state) => state.viewer)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <label className="left-slider">
          <span>Exposure</span>
          <input
            type="range"
            min="0"
            max="3"
            step="0.01"
            value={viewer.exposure}
            onInput={(event) => setViewer({ exposure: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(viewer.exposure)}</strong>
        </label>
        <label className="left-slider left-slider--focal">
          <span>Focal Length</span>
          <input
            type="range"
            min="12"
            max="120"
            step="1"
            value={viewer.focalLength}
            onInput={(event) => setViewer({ focalLength: Number(event.currentTarget.value) })}
          />
          <div className="left-slider__ticks">
            {[18, 24, 35, 50, 85].map((tick) => (
              <span
                key={tick}
                className="left-slider__tick"
                style={{ left: `${((tick - 12) / (120 - 12)) * 100}%` }}
              />
            ))}
          </div>
          <strong>{Math.round(viewer.focalLength)} mm</strong>
        </label>
        <div className="scene-tabs">
          <button
            type="button"
            className={viewer.cameraMode === 'orbit' ? 'is-active' : ''}
            onClick={() => {
              setHud({ orbitEnabled: true })
              setViewer({ cameraMode: 'orbit' })
            }}
          >
            Orbit
          </button>
          <button
            type="button"
            className={viewer.cameraMode === 'firstPerson' ? 'is-active' : ''}
            onClick={() => {
              setHud({ orbitEnabled: false })
              setViewer({ cameraMode: 'firstPerson' })
            }}
          >
            Flight
          </button>
        </div>
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={hud.gridVisible}
            onChange={(event) => setHud({ gridVisible: event.currentTarget.checked })}
          />
          <span>Grid</span>
        </label>
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={hud.axesVisible}
            onChange={(event) => setHud({ axesVisible: event.currentTarget.checked })}
          />
          <span>Axes</span>
        </label>
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={viewer.dofEnabled}
            onChange={(event) => setViewer({ dofEnabled: event.currentTarget.checked })}
          />
          <span>Depth Of Field</span>
        </label>
      </div>
    </div>
  )
}

function LightTabContent() {
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const setLights = useEditorStore((state) => state.setLights)
  const addExtraLight = useEditorStore((state) => state.addExtraLight)
  const restoreAmbientLight = useEditorStore((state) => state.restoreAmbientLight)
  const environment = useEditorStore((state) => state.environment)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const [lightPreset, setLightPreset] = useState<keyof typeof LIGHT_PRESETS>('studio')

  const ambientExists = lights.ambient.exists

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Add Light</span>
        <div className="light-type-grid">
          <button
            type="button"
            className={`tool-button${ambientExists ? ' is-occupied' : ''}`}
            onClick={() => restoreAmbientLight()}
            disabled={ambientExists}
          >
            <span className="tool-button__glyph">AMB</span>
            <span className="tool-button__label">Ambient</span>
          </button>
          <button
            type="button"
            className={`tool-button${environment.isEnvironmentEnabled ? ' is-occupied' : ''}`}
            onClick={() => setEnvironment({ isEnvironmentEnabled: !environment.isEnvironmentEnabled })}
          >
            <span className="tool-button__glyph">HDR</span>
            <span className="tool-button__label">Active</span>
          </button>
          <button type="button" className="tool-button" onClick={() => addExtraLight('directional')}>
            <span className="tool-button__glyph">DIR</span>
            <span className="tool-button__label">Directional</span>
          </button>
          <button type="button" className="tool-button" onClick={() => addExtraLight('point')}>
            <span className="tool-button__glyph">PNT</span>
            <span className="tool-button__label">Point</span>
          </button>
          <button type="button" className="tool-button" onClick={() => addExtraLight('spot')}>
            <span className="tool-button__glyph">SPT</span>
            <span className="tool-button__label">Spot</span>
          </button>
        </div>
        <p className="settings-note">{extraLights.length} extra lights active</p>
        <label className="left-select">
          <span>Preset</span>
          <select value={lightPreset} onChange={(event) => setLightPreset(event.currentTarget.value as keyof typeof LIGHT_PRESETS)}>
            <option value="studio">Studio</option>
            <option value="product">Product</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
        </label>
        <button
          type="button"
          className="tool-button"
          onClick={() => setLights({ rig: { ...LIGHT_PRESETS[lightPreset] } })}
        >
          <span className="tool-button__glyph">LGT</span>
          <span className="tool-button__label">Apply Preset</span>
        </button>
        {(['hemisphere', 'key', 'fill', 'rim'] as const).map((key) => (
          <label key={key} className="left-slider">
            <span>{key.toUpperCase()}</span>
            <input
              type="range"
              min="0"
              max="8"
              step="0.01"
              value={lights.rig[key]}
              onInput={(event) => setLights({ rig: { [key]: Number(event.currentTarget.value) } })}
            />
            <strong>{formatNumber(lights.rig[key])}</strong>
          </label>
        ))}
      </div>
    </div>
  )
}

function FxTabContent() {
  const hud = useEditorStore((state) => state.hud)
  const viewer = useEditorStore((state) => state.viewer)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <div className="fx-buttons-row">
          <button
            type="button"
            className={`tool-button${hud.postEffectsEnabled ? ' is-active' : ''}`}
            onClick={() => setHud({ postEffectsEnabled: !hud.postEffectsEnabled })}
          >
            <span className="tool-button__glyph">Bloom</span>
            <span className="tool-button__label">{hud.postEffectsEnabled ? 'Enabled' : 'Create'}</span>
          </button>
        </div>
        <label className="left-slider">
          <span>Intensity</span>
          <input
            type="range"
            min="0"
            max="5"
            step="0.01"
            value={viewer.bloomIntensity}
            onInput={(event) => setViewer({ bloomIntensity: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(viewer.bloomIntensity)}</strong>
        </label>
        <label className="left-slider">
          <span>Radius</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={viewer.bloomRadius}
            onInput={(event) => setViewer({ bloomRadius: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(viewer.bloomRadius)}</strong>
        </label>
        <label className="left-slider">
          <span>Threshold</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={viewer.bloomThreshold}
            onInput={(event) => setViewer({ bloomThreshold: Number(event.currentTarget.value) })}
          />
          <strong>{formatNumber(viewer.bloomThreshold)}</strong>
        </label>
      </div>
    </div>
  )
}

export function Sidebar() {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const materials = useEditorStore((state) => state.materials)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestConfigImport = useEditorStore((state) => state.requestConfigImport)
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setHud = useEditorStore((state) => state.setHud)
  const [activeTab, setActiveTab] = useState<SidebarTab>('scn')

  const objectCount = useMemo(
    () => Object.values(sceneGraph).filter((node) => node.type !== 'material').length,
    [sceneGraph],
  )

  const glbInputRef = useRef<HTMLInputElement | null>(null)
  const configInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <aside className="left-panel">
      <div className="left-panel__body">
        <section className="left-panel__title">
          <div className="panel-header__stack">
            <p className="panel-eyebrow">GLB Viewer</p>
          </div>
          <p className="panel-meta">
            {objectCount} OBJECTS / {Object.keys(materials).length} MATERIALS
          </p>
        </section>
        <section className="project-toolbar">
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
        </section>
        <Outliner />

        <section className="settings-panel">
          <div className="settings-panel__tabs">
            {(Object.keys(TAB_LABELS) as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <div className="settings-panel__content">
            {activeTab === 'scn' ? <SceneTabContent /> : null}
            {activeTab === 'cam' ? <CameraTabContent /> : null}
            {activeTab === 'lgt' ? <LightTabContent /> : null}
            {activeTab === 'fx' ? <FxTabContent /> : null}
          </div>
        </section>
      </div>
      <button type="button" className="ghost small panel-visibility-toggle left-panel__collapse" onClick={() => setHud({ sidebarVisible: false })}>
        Hide panel
      </button>
    </aside>
  )
}
