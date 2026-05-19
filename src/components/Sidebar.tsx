import { useEffect, useMemo, useRef, useState } from 'react'
import { Outliner } from './Outliner'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { downloadPublishedScene, openPublishedScenePreview } from '../features/publish/buildPublishedScene'
import { STANDARD_ENVIRONMENT_PRESETS } from '../features/environment/standardEnvironmentPresets'
import {
  useEditorStore,
  type ExtraLightState,
  type FrameAspectPreset,
  type RotateAnimationAxis,
  type RotateAnimationPivot,
  type SceneGraphNode,
} from '../store/editorStore'

type SidebarTab = 'scn' | 'cam' | 'lgt' | 'fx' | 'anim'
type OutlinerViewMode = 'layers' | 'meshes' | 'materials' | 'lights' | 'effects'

const TAB_LABELS: Record<SidebarTab, string> = {
  scn: 'SCN',
  cam: 'CAM',
  lgt: 'LGT',
  fx: 'FX',
  anim: 'ANIM',
}

const TAB_TITLES: Record<SidebarTab, string> = {
  scn: 'Scene Settings',
  cam: 'Camera Settings',
  lgt: 'Lighting Settings',
  fx: 'Effects Settings',
  anim: 'Animation Settings',
}

const ambientSystemLightNodeId = 'light:ambient:system'
const environmentNodeIds = new Set(['environment:system', 'environment:hdri'])
const FRAME_ASPECT_OPTIONS: Array<{ value: FrameAspectPreset; label: string }> = [
  { value: '1:1', label: '1:1 Square' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '9:16', label: '9:16 Portrait' },
]
const FOCAL_LENGTH_PRESETS = [10, 16, 20, 28, 35, 50, 85, 105]

function FrameAspectIcon({ preset }: { preset: FrameAspectPreset }) {
  const dimensions =
    preset === '1:1'
      ? { width: 16, height: 16 }
      : preset === '3:2'
        ? { width: 18, height: 12 }
        : preset === '2:3'
          ? { width: 12, height: 18 }
        : preset === '16:9'
          ? { width: 18, height: 10 }
          : { width: 10, height: 18 }

  const offsetX = (18 - dimensions.width) / 2
  const offsetY = (18 - dimensions.height) / 2

  return (
    <svg className="frame-aspect-button__icon" viewBox="0 0 18 18" aria-hidden="true">
      <rect
        x={offsetX}
        y={offsetY}
        width={dimensions.width}
        height={dimensions.height}
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function getAssetName(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback
  }

  const sanitized = value.split('#')[0]?.split('?')[0] ?? value
  const pieces = sanitized.split(/[\\/]/)
  const fileName = pieces[pieces.length - 1]
  return fileName ? decodeURIComponent(fileName) : fallback
}

function getEnvironmentDisplayName(value: string | null | undefined, fallback: string) {
  return getAssetName(value, fallback).replace(/\.(hdr|exr|jpg|jpeg|png|mp3|wav|ogg|m4a|aac)$/i, '')
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDegrees(value: number) {
  return `${value.toFixed(0)}°`
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

function EyeIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      <path
        d="M1.25 8s2.35-3.75 6.75-3.75S14.75 8 14.75 8s-2.35 3.75-6.75 3.75S1.25 8 1.25 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2.05" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {!isOpen ? <path d="M2.2 13.3 13.8 2.7" fill="none" stroke="currentColor" strokeWidth="1.2" /> : null}
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      <path d="M5.25 2.75h5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4.5h10" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 4.5v8h6v-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 6.4v4.2M9.4 6.4v4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function PlayIcon({ isPlaying }: { isPlaying: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="effect-row__icon" aria-hidden="true">
      {isPlaying ? (
        <>
          <path d="M4.5 3.25h2.25v9.5H4.5z" fill="currentColor" />
          <path d="M9.25 3.25h2.25v9.5H9.25z" fill="currentColor" />
        </>
      ) : (
        <path d="M4.75 3.25 12 8l-7.25 4.75V3.25Z" fill="currentColor" />
      )}
    </svg>
  )
}

function isAnimatableNode(node: SceneGraphNode | null | undefined) {
  return Boolean(node && (node.type === 'scene' || node.type === 'group' || node.type === 'mesh'))
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
            <strong>{formatDegrees(light.angle)}</strong>
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
              <strong>{formatDegrees(backgroundRotation)}</strong>
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
              <strong>{formatDegrees(backgroundRotation)}</strong>
            </label>
          </>
        ) : null}
      </div>
    </div>
  )
}

function CameraTabContent() {
  const viewer = useEditorStore((state) => state.viewer)
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
        <div className="left-controls__group">
          <span className="left-controls__label">Lens Presets</span>
          <div className="frame-aspect-grid frame-aspect-grid--lens">
            {FOCAL_LENGTH_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`tool-button mode-button frame-aspect-button frame-aspect-button--lens${Math.round(viewer.focalLength) === preset ? ' is-active' : ''}`}
                aria-pressed={Math.round(viewer.focalLength) === preset}
                onClick={() => setViewer({ focalLength: preset })}
              >
                <span className="frame-aspect-button__label">{preset}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="left-slider left-slider--focal">
          <span>Focal Length</span>
          <input
            type="range"
            min="8"
            max="120"
            step="1"
            value={viewer.focalLength}
            onInput={(event) => setViewer({ focalLength: Number(event.currentTarget.value) })}
          />
          <div className="left-slider__ticks">
            {[10, 16, 20, 28, 35, 50, 85, 105].map((tick) => (
              <span
                key={tick}
                className="left-slider__tick"
                style={{ left: `${((tick - 8) / (120 - 8)) * 100}%` }}
              />
            ))}
          </div>
          <strong>{Math.round(viewer.focalLength)} mm</strong>
        </label>
        <div className="left-controls__group">
          <span className="left-controls__label">Frame Format</span>
          <div className="frame-aspect-grid" role="group" aria-label="Frame format presets">
            {FRAME_ASPECT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`tool-button mode-button frame-aspect-button${viewer.frameAspectPreset === option.value ? ' is-active' : ''}`}
                aria-pressed={viewer.frameAspectPreset === option.value}
                title={option.label}
                onClick={() => setViewer({ frameAspectPreset: option.value })}
              >
                <FrameAspectIcon preset={option.value} />
                <span className="frame-aspect-button__label">{option.value}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="left-toggle">
          <input
            type="checkbox"
            checked={viewer.frameGuidesEnabled}
            onChange={(event) => setViewer({ frameGuidesEnabled: event.currentTarget.checked })}
          />
          <span>Show Frame Guides</span>
        </label>
      </div>
    </div>
  )
}

function LightTabContent() {
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const defaultEnvUrl = useEditorStore((state) => state.defaultEnvUrl)
  const setLights = useEditorStore((state) => state.setLights)
  const addExtraLight = useEditorStore((state) => state.addExtraLight)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)
  const restoreAmbientLight = useEditorStore((state) => state.restoreAmbientLight)
  const environment = useEditorStore((state) => state.environment)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const selectedExtraLight = extraLights.find((light) => light.id === selectedObjectId) ?? null
  const isAmbientSelected = selectedObjectId === ambientSystemLightNodeId && lights.ambient.exists
  const isEnvironmentSelected =
    Boolean(selectedObjectId && environmentNodeIds.has(selectedObjectId)) && environment.isEnvironmentEnabled
  const hdriInputRef = useRef<HTMLInputElement | null>(null)

  const defaultEnvironmentLabel = getEnvironmentDisplayName(defaultEnvUrl, 'Studio')
  const currentEnvironmentLabel = environment.source
    ? getEnvironmentDisplayName(environment.source, environment.source)
    : defaultEnvironmentLabel

  const applyStandardEnvironmentPreset = (preset: (typeof STANDARD_ENVIRONMENT_PRESETS)[number]) => {
    requestEnvironmentLoad({
      url: preset.url,
      label: preset.label,
      kind: preset.kind,
      revokeAfter: false,
      fileSize: null,
    })
  }

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
            <div className="material-environment-control">
              <div className="material-environment-control__field">
                <div className="material-asset-control__value" title={currentEnvironmentLabel}>
                  {currentEnvironmentLabel}
                </div>
              </div>
              <button
                type="button"
                className="material-asset-control__button material-asset-control__button--compact"
                onClick={() => hdriInputRef.current?.click()}
              >
                Load HDRI
              </button>
            </div>
            <div className="frame-aspect-grid frame-aspect-grid--environment">
              {STANDARD_ENVIRONMENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`tool-button mode-button frame-aspect-button frame-aspect-button--environment${environment.customHdriUrl === preset.url ? ' is-active' : ''}`}
                  onClick={() => applyStandardEnvironmentPreset(preset)}
                >
                  <span className="frame-aspect-button__label">{preset.label}</span>
                </button>
              ))}
            </div>
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
              <strong>{formatDegrees(environment.rotation)}</strong>
            </label>
            <input
              ref={hdriInputRef}
              hidden
              type="file"
              accept=".hdr,.exr,.jpg,.jpeg,.png,image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) {
                  return
                }

                requestEnvironmentLoad({
                  url: createObjectUrl(file),
                  label: file.name,
                  kind: /\.(hdr|exr)$/i.test(file.name) ? 'hdri' : 'image',
                  revokeAfter: true,
                  fileSize: file.size,
                })
                event.currentTarget.value = ''
              }}
            />
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
  const backgroundAudio = useEditorStore((state) => state.backgroundAudio)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setBackgroundAudio = useEditorStore((state) => state.setBackgroundAudio)
  const isBloomSelected = selectedObjectId === 'effect:bloom'
  const isSceneAudioSelected = selectedObjectId === 'effect:scene-audio'
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const currentAudioLabel = getEnvironmentDisplayName(backgroundAudio.assetLabel, 'No audio loaded')
  const hasSceneAudio = backgroundAudio.isAdded

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Add Effect</span>
        <div className="fx-buttons-row">
          <button
            type="button"
            className={`tool-button effect-create-button${hud.postEffectsEnabled ? ' is-active' : ''}`}
            onClick={() => {
              if (!hud.postEffectsEnabled) {
                setHud({ postEffectsEnabled: true, postEffectsVisible: true })
              }
              setSelectedObjectId('effect:bloom')
            }}
          >
            <span className="tool-button__glyph">Bloom</span>
            <span className="tool-button__label">{!hud.postEffectsEnabled ? 'Create' : 'Select'}</span>
          </button>
          <button
            type="button"
            className={`tool-button effect-create-button${hasSceneAudio ? ' is-active' : ''}`}
            onClick={() => {
              if (!hasSceneAudio) {
                setBackgroundAudio({ isAdded: true })
                setSelectedObjectId('effect:scene-audio')
                return
              }
              setSelectedObjectId('effect:scene-audio')
            }}
          >
            <span className="tool-button__glyph">AUDIO</span>
            <span className="tool-button__label">Scene</span>
          </button>
        </div>
        <input
          ref={audioInputRef}
          className="hidden-input"
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.aac,audio/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (!file) {
                return
              }

              setBackgroundAudio({
                isAdded: true,
                enabled: true,
                previewEnabled: true,
                previewPlaying: false,
                previewCurrentTime: 0,
                previewDuration: 0,
                assetLabel: file.name,
                assetUrl: createObjectUrl(file),
                fileSize: file.size,
                loop: true,
              })
              setSelectedObjectId('effect:scene-audio')
              event.currentTarget.value = ''
            }}
        />
        {hud.postEffectsEnabled && isBloomSelected ? (
          <>
            <p className="left-controls__label material-effect-active-title">Bloom</p>
            <div className="readout-row">
              <span>Status</span>
              <strong>{hud.postEffectsVisible ? 'Enabled' : 'Hidden'}</strong>
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
          </>
        ) : null}
        {hasSceneAudio && isSceneAudioSelected ? (
          <>
            <p className="left-controls__label material-effect-active-title">Scene Audio</p>
            <div className="material-asset-control scene-audio-asset-control">
              <button
                type="button"
                className="material-asset-control__button material-asset-control__button--compact"
                onClick={() => audioInputRef.current?.click()}
              >
                <span className="tool-button__label">Load AUDIO</span>
              </button>
              <div className="material-asset-control__value" title={currentAudioLabel}>
                {currentAudioLabel}
              </div>
            </div>
            <div className="material-effect-playback-row">
              <button
                type="button"
                className={`tool-button material-effect-play-button${backgroundAudio.previewPlaying ? ' is-active' : ''}`}
                aria-label={backgroundAudio.previewPlaying ? 'Pause scene audio preview' : 'Play scene audio preview'}
                title={backgroundAudio.previewPlaying ? 'Pause scene audio preview' : 'Play scene audio preview'}
                disabled={!backgroundAudio.assetUrl || !backgroundAudio.previewEnabled}
                onClick={() =>
                  setBackgroundAudio({
                    previewPlaying: !backgroundAudio.previewPlaying,
                  })
                }
              >
                <PlayIcon isPlaying={backgroundAudio.previewPlaying} />
              </button>
              <label className="field field--inline-range material-effect-current-frame material-effect-current-frame--full">
                <span>
                  Track <output>{formatDuration(backgroundAudio.previewCurrentTime)} / {formatDuration(backgroundAudio.previewDuration)}</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max={String(Math.max(backgroundAudio.previewDuration, 0.01))}
                  step="0.01"
                  value={Math.min(backgroundAudio.previewCurrentTime, Math.max(backgroundAudio.previewDuration, 0.01))}
                  onInput={(event) =>
                    setBackgroundAudio({
                      previewCurrentTime: Number(event.currentTarget.value),
                    })
                  }
                  disabled={!backgroundAudio.assetUrl}
                />
              </label>
            </div>
            <label className="left-toggle">
              <input
                type="checkbox"
                checked={backgroundAudio.enabled && Boolean(backgroundAudio.assetUrl)}
                onChange={(event) =>
                  setBackgroundAudio({
                    enabled: event.currentTarget.checked && Boolean(backgroundAudio.assetUrl),
                  })
                }
                disabled={!backgroundAudio.assetUrl}
              />
              <span>Play On Load</span>
            </label>
            <label className="left-slider">
              <span>Volume</span>
              <input
                type="range"
                min="0"
                max="0.4"
                step="0.01"
                value={backgroundAudio.volume}
                onInput={(event) => setBackgroundAudio({ volume: Number(event.currentTarget.value) })}
              />
              <strong>{Math.round(backgroundAudio.volume * 100)}%</strong>
            </label>
            <label className="left-toggle">
              <input
                type="checkbox"
                checked={backgroundAudio.loop}
                onChange={(event) => setBackgroundAudio({ loop: event.currentTarget.checked })}
                disabled={!backgroundAudio.assetUrl}
              />
              <span>Loop</span>
            </label>
            <p className="settings-note">Scene audio starts quietly and repeats while the scene is open.</p>
          </>
        ) : null}
      </div>
    </div>
  )
}

function AnimTabContent() {
  const rotateAnimation = useEditorStore((state) => state.rotateAnimation)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const addRotateAnimation = useEditorStore((state) => state.addRotateAnimation)
  const updateRotateAnimation = useEditorStore((state) => state.updateRotateAnimation)
  const removeRotateAnimation = useEditorStore((state) => state.removeRotateAnimation)
  const selectedNode = selectedObjectId ? sceneGraph[selectedObjectId] ?? null : null
  const selectedNodeIsAnimatable = isAnimatableNode(selectedNode)
  const rotateTargetNode = rotateAnimation.targetObjectId ? sceneGraph[rotateAnimation.targetObjectId] ?? null : null
  const rotateTargetLabel = rotateTargetNode?.label || rotateAnimation.targetObjectId || 'No target'
  const axisOptions: RotateAnimationAxis[] = ['x', 'y', 'z']

  const handleCreateRotate = () => {
    if (!selectedObjectId || !selectedNodeIsAnimatable) {
      return
    }

    addRotateAnimation(selectedObjectId)
  }

  const animationButtons = [
    {
      id: 'rotate',
      label: 'ROTATE',
      status: rotateAnimation.isAdded ? 'Added' : 'Create',
      disabled: !selectedNodeIsAnimatable,
      active: rotateAnimation.isAdded,
      onClick: handleCreateRotate,
      title: selectedNodeIsAnimatable ? 'Add rotate animation to selected object' : 'Select a model object first',
    },
    {
      id: 'float',
      label: 'FLOAT',
      status: 'Soon',
      disabled: true,
      active: false,
      onClick: () => {},
      title: 'Float animation will be added later',
    },
    {
      id: 'pulse',
      label: 'PULSE',
      status: 'Soon',
      disabled: true,
      active: false,
      onClick: () => {},
      title: 'Pulse animation will be added later',
    },
  ]

  return (
    <div className="settings-tab">
      <div className="left-controls__group">
        <span className="left-controls__label">Add Animation</span>
        <div className="fx-buttons-row sidebar-anim-buttons-row">
          {animationButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              className={`tool-button effect-create-button${button.active ? ' is-active' : ''}`}
              disabled={button.disabled}
              title={button.title}
              onClick={button.onClick}
            >
              <span className="tool-button__glyph">{button.label}</span>
              <span className="tool-button__label">{button.status}</span>
            </button>
          ))}
        </div>
        {!selectedNodeIsAnimatable ? <p className="left-note">Select a mesh, group, or scene object to add rotation.</p> : null}

        <div className="material-effects-list" aria-label="Animation list">
          {rotateAnimation.isAdded ? (
            <div className="material-effects-list__row is-selected" role="button" tabIndex={0}>
              <span className="material-effects-list__label">Rotate Animation</span>
              <div className="material-effects-list__actions">
                <button
                  type="button"
                  className={`material-effects-list__icon-button${rotateAnimation.enabled ? ' is-active' : ''}`}
                  aria-label={rotateAnimation.enabled ? 'Hide Rotate Animation' : 'Show Rotate Animation'}
                  onClick={(event) => {
                    event.stopPropagation()
                    updateRotateAnimation({
                      enabled: !rotateAnimation.enabled,
                      play: rotateAnimation.enabled ? false : rotateAnimation.play,
                    })
                  }}
                >
                  <EyeIcon isOpen={rotateAnimation.enabled} />
                </button>
                <button
                  type="button"
                  className="material-effects-list__icon-button"
                  aria-label="Remove Rotate Animation"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeRotateAnimation()
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ) : (
            <div className="material-effects-list__row material-effects-list__row--empty" aria-hidden="true" />
          )}
        </div>

        {rotateAnimation.isAdded ? (
          <>
            <p className="left-controls__label material-effect-active-title">Rotate Animation</p>
            <div className="readout-row">
              <span>Target</span>
              <strong>{rotateTargetLabel}</strong>
            </div>
            <label className="left-select">
              <span>Rotation Point</span>
              <select
                value={rotateAnimation.pivot}
                onChange={(event) =>
                  updateRotateAnimation({
                    pivot: event.currentTarget.value as RotateAnimationPivot,
                    play: false,
                  })
                }
              >
                <option value="pivot">PIVOT</option>
                <option value="gizmo">GIZMO</option>
              </select>
            </label>
            <div className="left-controls__stack">
              <span className="left-controls__label">Axis</span>
              <div className="segmented sidebar-anim-axis-row">
                {axisOptions.map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    className={`tool-button mode-button${rotateAnimation.axis === axis ? ' is-active' : ''}`}
                    onClick={() =>
                      updateRotateAnimation({
                        axis,
                        play: false,
                      })
                    }
                  >
                    {axis.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <label className="left-slider">
              <span>Speed</span>
              <input
                type="range"
                min="5"
                max="360"
                step="1"
                value={rotateAnimation.speed}
                onInput={(event) => updateRotateAnimation({ speed: Number(event.currentTarget.value) })}
              />
              <strong>{formatDegrees(rotateAnimation.speed)}/s</strong>
            </label>
            <label className="field field--inline-range material-effect-current-frame">
              <span>
                Cycle <output>{Math.round(rotateAnimation.progress)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={rotateAnimation.progress}
                onInput={(event) =>
                  updateRotateAnimation({
                    progress: Number(event.currentTarget.value),
                    play: false,
                  })
                }
              />
            </label>
            <div className="material-effect-playback-row">
              <button
                type="button"
                className={`tool-button material-effect-play-button${rotateAnimation.play ? ' is-active' : ''}`}
                aria-label={rotateAnimation.play ? 'Pause rotation' : 'Play rotation'}
                title={rotateAnimation.play ? 'Pause rotation' : 'Play rotation'}
                disabled={!rotateAnimation.enabled || !rotateAnimation.targetObjectId}
                onClick={() =>
                  updateRotateAnimation({
                    play: !rotateAnimation.play,
                    progress:
                      !rotateAnimation.play && !rotateAnimation.loop && rotateAnimation.progress >= 100
                        ? 0
                        : rotateAnimation.progress,
                  })
                }
              >
                <PlayIcon isPlaying={rotateAnimation.play} />
              </button>
              <label className="checkbox checkbox--bare material-effect-toggle material-effect-loop">
                <input
                  type="checkbox"
                  checked={rotateAnimation.loop}
                  onChange={(event) => updateRotateAnimation({ loop: event.currentTarget.checked })}
                />
                <span>Loop</span>
              </label>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function Sidebar() {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const materials = useEditorStore((state) => state.materials)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestConfigImport = useEditorStore((state) => state.requestConfigImport)
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const setStatus = useEditorStore((state) => state.setStatus)
  const [activeTab, setActiveTab] = useState<SidebarTab>('scn')
  const [outlinerViewMode, setOutlinerViewMode] = useState<OutlinerViewMode>('layers')

  const handleSidebarTabChange = (tab: SidebarTab) => {
    setActiveTab(tab)
    if (tab === 'lgt') {
      setOutlinerViewMode('lights')
      return
    }
    if (tab === 'fx') {
      setOutlinerViewMode('effects')
      return
    }
  }

  const handleOutlinerViewModeChange = (mode: OutlinerViewMode) => {
    setOutlinerViewMode(mode)
    if (mode === 'lights') {
      setActiveTab('lgt')
      return
    }
    if (mode === 'effects') {
      setActiveTab('fx')
    }
  }

  useEffect(() => {
    if (!selectedObjectId) {
      return
    }

    if (environmentNodeIds.has(selectedObjectId) || selectedObjectId === ambientSystemLightNodeId) {
      setActiveTab('lgt')
      return
    }

    const selectedNode = sceneGraph[selectedObjectId]
    if (!selectedNode) {
      return
    }

    if (selectedNode.type === 'light') {
      setActiveTab('lgt')
      return
    }

    if (selectedNode.type === 'camera') {
      setActiveTab('cam')
      return
    }

    if (selectedObjectId.startsWith('effect:')) {
      setActiveTab('fx')
    }
  }, [sceneGraph, selectedObjectId])

  const objectCount = useMemo(
    () => Object.values(sceneGraph).filter((node) => node.type !== 'material').length,
    [sceneGraph],
  )

  const glbInputRef = useRef<HTMLInputElement | null>(null)
  const configInputRef = useRef<HTMLInputElement | null>(null)

  const handlePublishScene = () => {
    try {
      const warnings = downloadPublishedScene()
      if (warnings.length) {
        setStatus(`Scene published with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`)
        return
      }

      setStatus('Scene JSON published.')
    } catch (error) {
      console.error(error)
      setStatus('Failed to publish scene JSON.')
    }
  }

  const handleRunPublishedScene = () => {
    try {
      const warnings = openPublishedScenePreview()
      if (warnings.length) {
        setStatus(`Published preview opened with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`)
        return
      }

      setStatus('Published preview opened.')
    } catch (error) {
      console.error(error)
      setStatus('Failed to open published preview.')
    }
  }

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
          <button type="button" className="tool-button" onClick={handlePublishScene}>
            <span className="tool-button__glyph">PUB</span>
            <span className="tool-button__label">Publish</span>
          </button>
          <button type="button" className="tool-button" onClick={handleRunPublishedScene}>
            <span className="tool-button__glyph">RUN</span>
            <span className="tool-button__label">Local</span>
          </button>
          <button type="button" className="tool-button project-toolbar__reset" onClick={() => requestSceneReset()}>
            <span className="tool-button__glyph">RST</span>
            <span className="tool-button__label">Reset Scene</span>
          </button>
        </section>
        <Outliner viewMode={outlinerViewMode} onViewModeChange={handleOutlinerViewModeChange} />

        <section className="settings-panel">
          <div className="settings-panel__header">
            <span>Settings</span>
            <span className="left-accordion__meta">{TAB_TITLES[activeTab]}</span>
          </div>
          <div className="settings-panel__tabs">
            {(Object.keys(TAB_LABELS) as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => handleSidebarTabChange(tab)}
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
            {activeTab === 'anim' ? <AnimTabContent /> : null}
          </div>
        </section>
      </div>
    </aside>
  )
}
