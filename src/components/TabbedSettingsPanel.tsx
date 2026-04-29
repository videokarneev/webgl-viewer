import { useState, type ReactNode } from 'react'
import {
  useEditorStore,
  type AmbientLightState,
  type ExtraLightState,
  type ExtraLightType,
  type EnvironmentState,
  type ViewerState,
} from '../store/editorStore'

export type SettingsTab = 'scene' | 'camera' | 'lights' | 'effects'

const focalPresets = [8, 12, 17, 35, 50, 85]
const ambientSystemLightNodeId = 'light:ambient:system'
const hdriEnvironmentNodeId = 'environment:hdri'

interface TabbedSettingsPanelProps {
  assets: {
    reflections: string | null
    background: string | null
  }
  environment: EnvironmentState
  viewer: ViewerState
  onLoadReflections: () => void
  onResetReflections: () => void
  onRemoveEnvironment: () => void
  onRestoreEnvironmentPreset: () => void
  onLoadBackground: () => void
  onClearBackground: () => void
  onSetEnvironment: (patch: Partial<EnvironmentState>) => void
  onSetViewer: (patch: Partial<ViewerState>) => void
  onHandleFocalLengthChange: (value: number) => void
  snappedFocalLength: number | null
  bloomEnabled: boolean
  onSetBloomEnabled: (value: boolean) => void
  bloomThreshold: number
  onSetBloomThreshold: (value: number) => void
  bloomIntensity: number
  onSetBloomIntensity: (value: number) => void
  bloomSmoothing: number
  onSetBloomSmoothing: (value: number) => void
  onAddLight: (type: ExtraLightType) => void
  onSelectEnvironment: () => void
  onDeleteSelectedObject: () => void
  activeTab: SettingsTab
  onActiveTabChange: (tab: SettingsTab) => void
  ambientLight: AmbientLightState
  onSetAmbientLight: (patch: Partial<AmbientLightState>) => void
  onRemoveAmbientLight: () => void
}

function SettingsBlock({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="left-controls__group settings-block">
      <div className="settings-block__header">
        <span className="left-controls__label">{title}</span>
        {action ? <span className="settings-block__action">{action}</span> : null}
      </div>
      {children}
    </div>
  )
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="inline-clear-button settings-remove-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span aria-hidden="true">x</span>
    </button>
  )
}

function LightIntensityControl({
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
      <strong className="light-intensity-row__value">{intensity.toFixed(2)}</strong>
    </label>
  )
}

function LightSettingsFields({
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
      <LightIntensityControl
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
              onChange={(event) => onPatch({ distance: Number(event.currentTarget.value) })}
            />
            <strong>{light.distance.toFixed(1)}</strong>
          </label>
          <label className="left-slider">
            <span>Decay</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.01"
              value={light.decay}
              onChange={(event) => onPatch({ decay: Number(event.currentTarget.value) })}
            />
            <strong>{light.decay.toFixed(2)}</strong>
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
              onChange={(event) => onPatch({ angle: Number(event.currentTarget.value) })}
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
              onChange={(event) => onPatch({ penumbra: Number(event.currentTarget.value) })}
            />
            <strong>{light.penumbra.toFixed(2)}</strong>
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

export function TabbedSettingsPanel({
  assets,
  environment,
  viewer,
  onLoadReflections,
  onResetReflections,
  onRemoveEnvironment,
  onRestoreEnvironmentPreset,
  onLoadBackground,
  onClearBackground,
  onSetEnvironment,
  onSetViewer,
  onHandleFocalLengthChange,
  snappedFocalLength,
  bloomEnabled,
  onSetBloomEnabled,
  bloomThreshold,
  onSetBloomThreshold,
  bloomIntensity,
  onSetBloomIntensity,
  bloomSmoothing,
  onSetBloomSmoothing,
  onAddLight,
  onSelectEnvironment,
  onDeleteSelectedObject,
  activeTab,
  onActiveTabChange,
  ambientLight,
  onSetAmbientLight,
  onRemoveAmbientLight,
}: TabbedSettingsPanelProps) {
  const [cameraTabOpen, setCameraTabOpen] = useState(false)
  const [activeFx, setActiveFx] = useState<'bloom' | null>(null)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const environmentMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const extraLights = useEditorStore((state) => state.extraLights)
  const selectedRuntimeObject = useEditorStore((state) =>
    state.selectedObjectId ? state.runtime.objectById[state.selectedObjectId] ?? null : null,
  )
  const selectedSceneNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )
  const selectedLight = useEditorStore((state) =>
    state.extraLights.find((entry) => entry.id === state.selectedObjectId),
  )
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const isReflectionsSelected = selectedObjectId === hdriEnvironmentNodeId
  const isAmbientSelected = selectedObjectId === ambientSystemLightNodeId
  const isHdrButtonDisabled = environment.isEnvironmentEnabled
  const hdrButtonTitle = isHdrButtonDisabled
    ? 'Environment already exists.'
    : 'Create environment and open reflections settings'
  const latestExtraLight = extraLights[extraLights.length - 1] ?? null
  const activeLightSettingsTarget =
    selectedObjectId === hdriEnvironmentNodeId && environment.isEnvironmentEnabled
      ? 'environment'
      : selectedObjectId === ambientSystemLightNodeId && ambientLight.exists
        ? 'ambient'
        : selectedObjectId && selectedRuntimeObject && selectedLight
          ? 'light'
            : null
  const activeLgtObject =
    activeLightSettingsTarget === 'environment' && environment.isEnvironmentEnabled
      ? { id: hdriEnvironmentNodeId }
      : activeLightSettingsTarget === 'ambient' && selectedObjectId === ambientSystemLightNodeId && ambientLight.exists
        ? { id: ambientSystemLightNodeId }
        : activeLightSettingsTarget === 'light' && selectedObjectId && selectedRuntimeObject && selectedLight
          ? selectedLight
          : null
  const activeFxObject = selectedObjectId ? { id: selectedObjectId } : null

  return (
    <section className="settings-panel" aria-label="Scene settings">
      <div className="settings-panel__tabs" role="tablist" aria-label="Editor settings">
        {([
          ['scene', 'SCN'],
          ['camera', 'CAM'],
          ['lights', 'LGT'],
          ['effects', 'FX'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'is-active' : ''}
            onClick={() => {
              onActiveTabChange(tab)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-panel__content">
        {activeTab === 'scene' ? (
          <div className="settings-tab">
            <div className="left-controls">
              <SettingsBlock title="BACKGROUND">
                <div className="scene-inline-controls">
                  <label className="left-select left-select--inline">
                    <span>Mode</span>
                    <select
                      value={environment.background}
                      onChange={(event) =>
                        onSetEnvironment({
                          background: event.currentTarget.value as EnvironmentState['background'],
                          backgroundVisible: event.currentTarget.value !== 'none',
                        })
                      }
                    >
                      <option value="none">None / Transparent</option>
                      <option value="color">Color</option>
                      <option value="environment">360 Image</option>
                      <option value="reflections">Same as Reflections</option>
                    </select>
                  </label>
                  {environment.background === 'color' ? (
                    <label className="left-color-field left-color-field--swatch" aria-label="Background color">
                      <span className="visually-hidden">Background Color</span>
                      <input
                        aria-label="Background color"
                        type="color"
                        value={environment.backgroundColor}
                        onChange={(event) => onSetEnvironment({ backgroundColor: event.currentTarget.value })}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="scene-asset-row">
                  <button type="button" className="tool-button tool-button--secondary scene-asset-row__trigger" onClick={onLoadBackground}>
                    <span className="tool-button__glyph">360</span>
                    <span className="tool-button__label">{assets.background ? 'Load' : '360'}</span>
                  </button>
                  <div className="left-controls__value left-controls__value--with-action">
                    <span>{assets.background ?? 'No background loaded'}</span>
                    {assets.background ? (
                      <button
                        type="button"
                        className="inline-clear-button"
                        aria-label="Clear background"
                        title="Clear background"
                        onClick={onClearBackground}
                      >
                        <span aria-hidden="true">x</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="left-slider">
                  <span>Background Rotation</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={environment.backgroundRotation}
                    onChange={(event) => onSetEnvironment({ backgroundRotation: Number(event.currentTarget.value) })}
                  />
                  <strong>{environment.backgroundRotation.toFixed(0)} deg</strong>
                </label>
                <label className="left-slider">
                  <span>Background Intensity</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.01"
                    value={environment.backgroundIntensity}
                    onChange={(event) => onSetEnvironment({ backgroundIntensity: Number(event.currentTarget.value) })}
                  />
                  <strong>{environment.backgroundIntensity.toFixed(2)}</strong>
                </label>
                <label className="left-slider">
                  <span>Blur</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={environment.backgroundBlur}
                    onChange={(event) => onSetEnvironment({ backgroundBlur: Number(event.currentTarget.value) })}
                  />
                  <strong>{environment.backgroundBlur.toFixed(2)}</strong>
                </label>
                <label className="left-toggle">
                  <input
                    type="checkbox"
                    checked={environment.backgroundVisible}
                    onChange={(event) => onSetEnvironment({ backgroundVisible: event.currentTarget.checked })}
                  />
                  <span>Visible</span>
                </label>
              </SettingsBlock>
            </div>
          </div>
        ) : null}

        {activeTab === 'camera' ? (
          <div className="settings-tab">
            <div className="left-controls">
              <label className="left-slider">
                <span>Exposure</span>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={viewer.exposure}
                  onChange={(event) => onSetViewer({ exposure: Number(event.currentTarget.value) })}
                />
                <strong>{viewer.exposure.toFixed(2)}</strong>
              </label>
              <label className="left-slider left-slider--focal">
                <span>Focal Length</span>
                <input
                  type="range"
                  min="1"
                  max="150"
                  step="1"
                  value={viewer.focalLength}
                  onChange={(event) => onHandleFocalLengthChange(Number(event.currentTarget.value))}
                />
                <div className="left-slider__ticks" aria-hidden="true">
                  {focalPresets.map((preset) => (
                    <span
                      key={preset}
                      className="left-slider__tick"
                      style={{ left: `${((preset - 1) / (150 - 1)) * 100}%` }}
                    />
                  ))}
                </div>
                <strong className={snappedFocalLength != null ? 'is-snapped' : ''}>{viewer.focalLength.toFixed(0)} mm</strong>
              </label>
              <details className="left-subsection" open={cameraTabOpen} onToggle={(event) => setCameraTabOpen((event.currentTarget as HTMLDetailsElement).open)}>
                <summary className="left-subsection__summary">Depth of Field</summary>
                <div className="left-subsection__content">
                  <div className="left-controls__group">
                    <label className="left-toggle">
                      <input
                        type="checkbox"
                        checked={viewer.dofEnabled}
                        onChange={(event) => onSetViewer({ dofEnabled: event.currentTarget.checked })}
                      />
                      <span>Enable DoF</span>
                    </label>
                    <label className="left-toggle">
                      <input
                        type="checkbox"
                        checked={viewer.dofVisualizerEnabled}
                        onChange={(event) => onSetViewer({ dofVisualizerEnabled: event.currentTarget.checked })}
                      />
                      <span>Show Focus Area</span>
                    </label>
                    <label className="left-slider">
                      <span>Focus Distance</span>
                      <input
                        type="range"
                        min="0.5"
                        max="25"
                        step="0.1"
                        value={viewer.dofFocusDistance}
                        onChange={(event) => onSetViewer({ dofFocusDistance: Number(event.currentTarget.value) })}
                      />
                      <strong>{viewer.dofFocusDistance.toFixed(1)} m</strong>
                    </label>
                    <div className="lens-preset-row lens-preset-row--aperture">
                      {[1.0, 1.2, 1.4, 1.8, 2.0, 2.8].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={Math.abs(viewer.dofAperture - preset) < 0.05 ? 'is-active' : ''}
                          onClick={() => onSetViewer({ dofAperture: preset })}
                        >
                          {preset.toFixed(1)}
                        </button>
                      ))}
                    </div>
                    <label className="left-slider">
                      <span>Manual Blur</span>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.05"
                        value={viewer.dofManualBlur}
                        onChange={(event) => onSetViewer({ dofManualBlur: Number(event.currentTarget.value) })}
                      />
                      <strong>{viewer.dofManualBlur.toFixed(2)}</strong>
                    </label>
                  </div>
                </div>
              </details>
            </div>
          </div>
        ) : null}

        {activeTab === 'lights' ? (
          <div className="settings-tab">
            <div className="left-controls">
              <SettingsBlock title="ADD LIGHT">
                <div className="light-type-grid">
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => onAddLight('ambient')}>
                    <span className="tool-button__glyph">AMB</span>
                    <span className="tool-button__label">Ambient</span>
                  </button>
                  <button
                    type="button"
                    className={`tool-button tool-button--secondary ${isHdrButtonDisabled ? 'is-occupied' : ''}`}
                    disabled={isHdrButtonDisabled}
                    title={hdrButtonTitle}
                    aria-label={hdrButtonTitle}
                    onClick={onSelectEnvironment}
                  >
                    <span className="tool-button__glyph">HDR</span>
                    <span className="tool-button__label">{isHdrButtonDisabled ? 'Active' : 'Environment'}</span>
                  </button>
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => onAddLight('directional')}>
                    <span className="tool-button__glyph">DIR</span>
                    <span className="tool-button__label">Directional</span>
                  </button>
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => onAddLight('point')}>
                    <span className="tool-button__glyph">PNT</span>
                    <span className="tool-button__label">Point</span>
                  </button>
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => onAddLight('spot')}>
                    <span className="tool-button__glyph">SPT</span>
                    <span className="tool-button__label">Spot</span>
                  </button>
                </div>
              </SettingsBlock>

              {selectedObjectId && activeLgtObject && activeLightSettingsTarget === 'ambient' ? (
                <SettingsBlock
                  title={isAmbientSelected ? 'AMBIENT LIGHT SELECTED' : 'AMBIENT LIGHT'}
                  action={<RemoveButton label="Delete ambient light" onClick={onDeleteSelectedObject} />}
                >
                  {ambientLight.exists ? (
                    <>
                      <label className="left-toggle">
                        <input
                          type="checkbox"
                          checked={ambientLight.visible}
                          onChange={(event) => onSetAmbientLight({ visible: event.currentTarget.checked })}
                        />
                        <span>Enabled</span>
                      </label>
                      <LightIntensityControl
                        label="Intensity"
                        color={ambientLight.color}
                        intensity={ambientLight.intensity}
                        max={5}
                        onColorChange={(value) => onSetAmbientLight({ color: value })}
                        onIntensityChange={(value) => onSetAmbientLight({ intensity: value })}
                      />
                    </>
                  ) : null}
                </SettingsBlock>
              ) : null}

              {selectedObjectId && activeLgtObject && activeLightSettingsTarget === 'environment' ? (
                <SettingsBlock
                  title={isReflectionsSelected ? 'REFLECTIONS SELECTED' : 'REFLECTIONS'}
                  action={<RemoveButton label="Delete environment" onClick={onDeleteSelectedObject} />}
                >
                  <div className="scene-asset-row">
                    <button type="button" className="tool-button tool-button--secondary scene-asset-row__trigger scene-asset-row__map" onClick={onLoadReflections}>
                      <span className="tool-button__glyph">MAP</span>
                      <span className="tool-button__label">Load</span>
                    </button>
                    <div className="left-controls__value left-controls__value--with-action">
                      <span>{assets.reflections ?? 'No map loaded'}</span>
                      {assets.reflections ? (
                        <button
                          type="button"
                          className="inline-clear-button"
                          aria-label="Reset reflections"
                          title="Reset reflections"
                          onClick={() => {
                            onResetReflections()
                            if (selectedObjectId === hdriEnvironmentNodeId) {
                              setSelectedObjectId(null)
                            }
                          }}
                        >
                          <span aria-hidden="true">x</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <label className="left-slider">
                    <span>Rotation</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={environment.rotation}
                      onChange={(event) => onSetEnvironment({ rotation: Number(event.currentTarget.value) })}
                      onPointerDown={() => onSetEnvironment({ previewReflections: true })}
                      onPointerUp={() => onSetEnvironment({ previewReflections: false })}
                      onPointerCancel={() => onSetEnvironment({ previewReflections: false })}
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
                      onChange={(event) => onSetEnvironment({ intensity: Number(event.currentTarget.value) })}
                    />
                    <strong>{environment.intensity.toFixed(2)}</strong>
                  </label>
                </SettingsBlock>
              ) : null}

              {selectedObjectId && activeLgtObject && activeLightSettingsTarget === 'light' && selectedLight ? (
                <SettingsBlock
                  title={selectedLight.label.toUpperCase()}
                  action={<RemoveButton label={`Delete ${selectedLight.label}`} onClick={onDeleteSelectedObject} />}
                >
                  <LightSettingsFields light={selectedLight} onPatch={(patch) => updateExtraLight(selectedLight.id, patch)} />
                </SettingsBlock>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'effects' ? (
          <div className="settings-tab">
            <div className="left-controls">
              <div className="fx-buttons-row">
                {[
                  {
                    id: 'bloom' as const,
                    label: 'BLOOM',
                    isAdded: bloomEnabled,
                    onSelect: () => {
                      if (!bloomEnabled) {
                        onSetBloomEnabled(true)
                      }
                      setActiveFx('bloom')
                    },
                  },
                ].map((effect) => (
                  <button
                    key={effect.id}
                    type="button"
                    className={`tool-button tool-button--secondary ${activeFx === effect.id ? 'is-active' : ''}`}
                    onClick={effect.onSelect}
                  >
                    <span className="tool-button__glyph">{effect.label}</span>
                    <span className="tool-button__label">{effect.isAdded ? 'Added' : 'Create'}</span>
                  </button>
                ))}
              </div>

              {selectedObjectId && activeFxObject && activeFx === 'bloom' && bloomEnabled ? (
                <SettingsBlock
                  title="BLOOM SETTINGS"
                  action={
                    <RemoveButton
                      label="Remove bloom"
                      onClick={() => {
                        onSetBloomEnabled(false)
                        setActiveFx(null)
                      }}
                    />
                  }
                >
                  <label className="left-slider">
                    <span>Intensity</span>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.01"
                      value={bloomIntensity}
                      onChange={(event) => onSetBloomIntensity(Number(event.currentTarget.value))}
                    />
                    <strong>{bloomIntensity.toFixed(2)}</strong>
                  </label>
                  <label className="left-slider">
                    <span>Radius</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={bloomSmoothing}
                      onChange={(event) => onSetBloomSmoothing(Number(event.currentTarget.value))}
                    />
                    <strong>{bloomSmoothing.toFixed(2)}</strong>
                  </label>
                  <label className="left-slider">
                    <span>Threshold</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={bloomThreshold}
                      onChange={(event) => onSetBloomThreshold(Number(event.currentTarget.value))}
                    />
                    <strong>{bloomThreshold.toFixed(2)}</strong>
                  </label>
                </SettingsBlock>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
