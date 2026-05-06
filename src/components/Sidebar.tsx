import { useMemo, useRef, useState } from 'react'
import { Outliner } from './Outliner'
import { downloadSceneConfig } from '../features/config/buildSceneConfig'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { useEditorStore, type ExtraLightState } from '../store/editorStore'

type SidebarTab = 'scn' | 'cam' | 'lgt' | 'fx'

const TAB_LABELS: Record<SidebarTab, string> = {
  scn: 'SCN',
  cam: 'CAM',
  lgt: 'LGT',
  fx: 'FX',
}

const ambientSystemLightNodeId = 'light:ambient:system'
const environmentNodeIds = new Set(['environment:system', 'environment:hdri'])

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function LightColorIntensityControl({
  label,
  color,
  intensity,
  max = 20,
  onColorChange,
  onIntensityChange,
}: {
  label: string
  color: string
  intensity: number
  max?: number
  onColorChange: (value: string) => void
  onIntensityChange: (value: number) => void
}) {
  return (
    <label className="light-intensity-row">
      <span className="light-intensity-row__label">{label}</span>
      <span className="light-color-swatch">
        <input
          aria-label={`${label} color`}
          className="light-color-swatch__input"
          type="color"
          value={color}
          onChange={(event) => onColorChange(event.currentTarget.value)}
        />
        <span className="light-color-swatch__chip" style={{ backgroundColor: color }} aria-hidden="true" />
      </span>
      <input
        className="light-intensity-row__slider"
        type="range"
        min="0"
        max={String(max)}
        step="0.01"
        value={intensity}
        onChange={(event) => onIntensityChange(Number(event.currentTarget.value))}
      />
      <strong className="light-intensity-row__value">{formatNumber(intensity)}</strong>
    </label>
  )
}

function ExtraLightSettings({
  light,
  onPatch,
}: {
  light: ExtraLightState
  onPatch: (patch: Partial<ExtraLightState>) => void
}) {
  return (
    <>
      <label className="left-toggle">
        <input
          type="checkbox"
          checked={light.visible}
          onChange={(event) => onPatch({ visible: event.currentTarget.checked })}
        />
        <span>Enabled</span>
      </label>
      <LightColorIntensityControl
        label="Intensity"
        color={light.color}
        intensity={light.intensity}
        onColorChange={(value) => onPatch({ color: value })}
        onIntensityChange={(value) => onPatch({ intensity: value })}
      />
      {light.type === 'point' || light.type === 'spot' ? (
        <>
          <label className="left-slider">
            <span>Distance</span>
            <input
              type="range"
              min="0"
              max="50"
              step="0.1"
              value={light.distance}
              onInput={(event) => onPatch({ distance: Number(event.currentTarget.value) })}
            />
            <strong>{formatNumber(light.distance, 1)}</strong>
          </label>
          <label className="left-slider">
            <span>Decay</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.01"
              value={light.decay}
              onInput={(event) => onPatch({ decay: Number(event.currentTarget.value) })}
            />
            <strong>{formatNumber(light.decay)}</strong>
          </label>
        </>
      ) : null}
      {light.type === 'spot' ? (
        <>
          <label className="left-slider">
            <span>Angle</span>
            <input
              type="range"
              min="1"
              max="90"
              step="1"
              value={light.angle}
              onInput={(event) => onPatch({ angle: Number(event.currentTarget.value) })}
            />
            <strong>{light.angle.toFixed(0)} deg</strong>
          </label>
          <label className="left-slider">
            <span>Penumbra</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={light.penumbra}
              onInput={(event) => onPatch({ penumbra: Number(event.currentTarget.value) })}
            />
            <strong>{formatNumber(light.penumbra)}</strong>
          </label>
        </>
      ) : null}
      {light.type !== 'ambient' ? (
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={light.castShadow}
            onChange={(event) => onPatch({ castShadow: event.currentTarget.checked })}
          />
          <span>Cast Shadow</span>
        </label>
      ) : null}
    </>
  )
}

function SceneTabContent() {
  const backgroundMode = useEditorStore((state) => state.backgroundMode)
  const backgroundColor = useEditorStore((state) => state.backgroundColor)
  const backgroundRotation = useEditorStore((state) => state.backgroundRotation)
  const setBackgroundMode = useEditorStore((state) => state.setBackgroundMode)
  const setBackgroundColor = useEditorStore((state) => state.setBackgroundColor)
  const setBackgroundPanoramaUrl = useEditorStore((state) => state.setBackgroundPanoramaUrl)
  const setBackgroundRotation = useEditorStore((state) => state.setBackgroundRotation)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)

  const handleBackgroundFile = (file: File) => {
    const url = createObjectUrl(file)
    const isHdr = file.name.match(/\.(hdr|exr)$/i)
    setBackgroundPanoramaUrl(url)
    setBackgroundMode('background')
    requestEnvironmentLoad({
      url,
      label: file.name,
      kind: isHdr ? 'background' : 'panorama',
      revokeAfter: true,
      fileSize: file.size,
    })
  }

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Background</span>
        <label className="left-select">
          <span>Mode</span>
          <select value={backgroundMode} onChange={(event) => setBackgroundMode(event.currentTarget.value as typeof backgroundMode)}>
            <option value="none">NONE</option>
            <option value="color">COLOR</option>
            <option value="background">BACKGROUND</option>
            <option value="hdri">HDRI</option>
          </select>
        </label>

        {backgroundMode === 'color' ? (
          <label className="left-color-field left-color-field--swatch">
            <span>Color</span>
            <input
              type="color"
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.currentTarget.value)}
            />
          </label>
        ) : null}

        {backgroundMode === 'background' ? (
          <>
            <input
              ref={backgroundInputRef}
              className="hidden-input"
              type="file"
              accept=".hdr,.exr,.jpg,.jpeg,.png,image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) {
                  return
                }
                handleBackgroundFile(file)
                event.currentTarget.value = ''
              }}
            />
            <button type="button" className="tool-button" onClick={() => backgroundInputRef.current?.click()}>
              <span className="tool-button__glyph">360</span>
              <span className="tool-button__label">Load 360 Panorama</span>
            </button>
            <label className="left-slider">
              <span>Rotation</span>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={backgroundRotation}
                onInput={(event) => setBackgroundRotation(Number(event.currentTarget.value))}
              />
              <strong>{backgroundRotation.toFixed(0)} deg</strong>
            </label>
          </>
        ) : null}

        {backgroundMode === 'hdri' ? (
          <>
            <p className="settings-note">Using Environment map from LGT tab</p>
            <label className="left-slider">
              <span>Rotation</span>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={backgroundRotation}
                onInput={(event) => setBackgroundRotation(Number(event.currentTarget.value))}
              />
              <strong>{backgroundRotation.toFixed(0)} deg</strong>
            </label>
          </>
        ) : null}
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
      </div>
    </div>
  )
}

function LightTabContent() {
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const setLights = useEditorStore((state) => state.setLights)
  const addExtraLight = useEditorStore((state) => state.addExtraLight)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const restoreAmbientLight = useEditorStore((state) => state.restoreAmbientLight)
  const environment = useEditorStore((state) => state.environment)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const selectedExtraLight = extraLights.find((light) => light.id === selectedObjectId) ?? null
  const isAmbientSelected = selectedObjectId === ambientSystemLightNodeId && lights.ambient.exists
  const isEnvironmentSelected =
    Boolean(selectedObjectId && environmentNodeIds.has(selectedObjectId)) && environment.isEnvironmentEnabled

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Add Light</span>
        <div className="light-type-grid">
          <button
            type="button"
            className={`tool-button${lights.ambient.exists ? ' is-occupied' : ''}`}
            onClick={() => {
              if (!lights.ambient.exists) {
                restoreAmbientLight()
                return
              }

              addExtraLight('ambient')
            }}
          >
            <span className="tool-button__glyph">AMB</span>
            <span className="tool-button__label">Ambient</span>
          </button>
          <button
            type="button"
            className={`tool-button${environment.isEnvironmentEnabled ? ' is-occupied' : ''}`}
            disabled={environment.isEnvironmentEnabled}
            onClick={() => {
              if (environment.isEnvironmentEnabled) {
                return
              }

              setEnvironment({ isEnvironmentEnabled: true })
              setSelectedObjectId('environment:system')
            }}
          >
            <span className="tool-button__glyph">HDR</span>
            <span className="tool-button__label">{environment.isEnvironmentEnabled ? 'Active' : 'Environment'}</span>
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
        {isAmbientSelected ? (
          <>
            <p className="settings-note">Ambient Light</p>
            <label className="left-toggle">
              <input
                type="checkbox"
                checked={lights.ambient.visible}
                onChange={(event) => setLights({ ambient: { visible: event.currentTarget.checked } })}
              />
              <span>Enabled</span>
            </label>
            <LightColorIntensityControl
              label="Intensity"
              color={lights.ambient.color}
              intensity={lights.ambient.intensity}
              max={5}
              onColorChange={(value) => setLights({ ambient: { color: value } })}
              onIntensityChange={(value) => setLights({ ambient: { intensity: value } })}
            />
          </>
        ) : null}
        {isEnvironmentSelected ? (
          <>
            <p className="settings-note">Environment (HDRI)</p>
            <label className="left-toggle">
              <input
                type="checkbox"
                checked={environment.isEnvironmentEnabled}
                onChange={(event) => setEnvironment({ isEnvironmentEnabled: event.currentTarget.checked })}
              />
              <span>Enabled</span>
            </label>
            <label className="left-slider">
              <span>Rotation</span>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={environment.rotation}
                onInput={(event) => setEnvironment({ rotation: Number(event.currentTarget.value) })}
                onPointerDown={() => setEnvironment({ previewReflections: true })}
                onPointerUp={() => setEnvironment({ previewReflections: false })}
                onPointerCancel={() => setEnvironment({ previewReflections: false })}
                onBlur={() => setEnvironment({ previewReflections: false })}
              />
              <strong>{environment.rotation.toFixed(0)} deg</strong>
            </label>
            <label className="left-slider">
              <span>Intensity</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={environment.intensity}
                onInput={(event) => setEnvironment({ intensity: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(environment.intensity)}</strong>
            </label>
          </>
        ) : null}
        {selectedExtraLight ? (
          <>
            <p className="settings-note">{selectedExtraLight.label}</p>
            <ExtraLightSettings
              light={selectedExtraLight}
              onPatch={(patch) => updateExtraLight(selectedExtraLight.id, patch)}
            />
          </>
        ) : null}
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
    </aside>
  )
}
