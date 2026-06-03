import { useEffect, useMemo, useRef, useState } from 'react'
import { Outliner } from './Outliner'
import { openPublishedScenePreview } from '../features/publish/buildPublishedScene'
import {
  exportWebPackage,
  WEB_PUBLISH_STATUS_EVENT,
  type WebPublishDeploymentStatus,
} from '../features/publish/exportWebPackage'
import { STANDARD_ENVIRONMENT_PRESETS } from '../features/environment/standardEnvironmentPresets'
import {
  DEFAULT_STENCIL_VOLUME,
  getGodRaysDustSpeedFromSliderValue,
  getGodRaysDustSpeedSliderValue,
  getGodRaysDefaultDirection,
  normalizeGodRaysDirection,
  useEditorStore,
  type ExtraLightState,
  type FrameAspectPreset,
  type ResponsiveFramePresetKind,
  type RotateAnimationAxis,
  type RotateAnimationPivot,
  type SceneGraphNode,
} from '../store/editorStore'

type SidebarTab = 'scn' | 'cam' | 'lgt' | 'fx' | 'anim'
type OutlinerViewMode = 'layers' | 'meshes' | 'materials' | 'lights' | 'effects'
type GodRaysDirectionPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

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
  { value: 'auto', label: 'Auto Container' },
  { value: '1:1', label: '1:1 Square' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '21:9', label: '21:9 Cinema' },
  { value: '9:16', label: '9:16 Portrait' },
]
const LANDSCAPE_FRAME_ASPECTS: FrameAspectPreset[] = ['3:2', '16:9', '21:9']
const PORTRAIT_FRAME_ASPECTS: FrameAspectPreset[] = ['2:3', '9:16']
const FOCAL_LENGTH_PRESETS = [10, 16, 20, 28, 35, 50, 85, 105]
const GOD_RAYS_DIRECTION_PRESETS: Array<{ id: GodRaysDirectionPreset; label: string; direction: [number, number, number] }> = [
  { id: 'front', label: 'FRONT', direction: [0, 0, 1] },
  { id: 'back', label: 'BACK', direction: [0, 0, -1] },
  { id: 'left', label: 'LEFT', direction: [-1, 0, 0] },
  { id: 'right', label: 'RIGHT', direction: [1, 0, 0] },
  { id: 'top', label: 'TOP', direction: [0, 1, 0] },
  { id: 'bottom', label: 'BOTTOM', direction: [0, -1, 0] },
]

function broadcastWebPublishStatus(status: WebPublishDeploymentStatus | null) {
  window.dispatchEvent(new CustomEvent<WebPublishDeploymentStatus | null>(WEB_PUBLISH_STATUS_EVENT, { detail: status }))
}

function FrameAspectIcon({ preset }: { preset: FrameAspectPreset }) {
  const dimensions =
    preset === 'auto'
      ? { width: 18, height: 13 }
      : preset === '1:1'
      ? { width: 16, height: 16 }
      : preset === '3:2'
        ? { width: 18, height: 12 }
        : preset === '2:3'
          ? { width: 12, height: 18 }
        : preset === '16:9'
          ? { width: 18, height: 10 }
          : preset === '21:9'
            ? { width: 18, height: 8 }
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

function areNumbersClose(left: number, right: number, epsilon = 0.0001) {
  return Math.abs(left - right) <= epsilon
}

function areVector3Close(left: [number, number, number], right: [number, number, number], epsilon = 0.0001) {
  return (
    areNumbersClose(left[0], right[0], epsilon) &&
    areNumbersClose(left[1], right[1], epsilon) &&
    areNumbersClose(left[2], right[2], epsilon)
  )
}

function getResponsiveFrameGroupKind(frameAspectPreset: FrameAspectPreset): ResponsiveFramePresetKind {
  if (frameAspectPreset === '1:1') {
    return 'square'
  }

  return LANDSCAPE_FRAME_ASPECTS.includes(frameAspectPreset) ? 'landscape' : 'portrait'
}

function getResponsiveFrameGroupLabel(kind: ResponsiveFramePresetKind) {
  return kind === 'landscape' ? 'L' : kind === 'portrait' ? 'P' : 'S'
}

function getResponsiveFrameGroupTitle(kind: ResponsiveFramePresetKind) {
  return kind === 'landscape' ? 'Landscape' : kind === 'portrait' ? 'Portrait' : 'Square'
}

function parseNumberInput(value: string) {
  return Number(value.replace(',', '.'))
}

function toDisplayStencilDimension(value: number, unit: 'cm' | 'm') {
  return unit === 'm' ? value : value * 100
}

function toInternalStencilDimension(value: number, unit: 'cm' | 'm') {
  return unit === 'm' ? value : value / 100
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
  const addPhoneScreenBox = useEditorStore((state) => state.addPhoneScreenBox)
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
        <span className="left-controls__label">Primitives</span>
        <button type="button" className="tool-button" onClick={() => addPhoneScreenBox()}>
          <span className="tool-button__glyph">BOX</span>
          <span className="tool-button__label">Add Phone Showcase</span>
        </button>
        <p className="settings-note">Responsive portrait showcase box with open top and screen-bound sizing.</p>
      </div>

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
  const responsiveFrame = useEditorStore((state) => state.responsiveFrame)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setResponsiveFramePreset = useEditorStore((state) => state.setResponsiveFramePreset)
  const saveCurrentCameraToResponsivePreset = useEditorStore((state) => state.saveCurrentCameraToResponsivePreset)
  const getAssignedResponsivePresetKind = (frameAspectPreset: FrameAspectPreset) =>
    frameAspectPreset === '1:1'
      ? 'square'
      : responsiveFrame.landscape.frameAspectPreset === frameAspectPreset
        ? 'landscape'
        : responsiveFrame.portrait.frameAspectPreset === frameAspectPreset
          ? 'portrait'
          : null
  const assignedResponsivePresetKind = getAssignedResponsivePresetKind(viewer.frameAspectPreset)
  const handleFrameAspectSelect = (frameAspectPreset: FrameAspectPreset) => {
    if (viewer.frameAspectPreset === frameAspectPreset) {
      return
    }

    if (assignedResponsivePresetKind) {
      saveCurrentCameraToResponsivePreset(assignedResponsivePresetKind)
    }

    const nextAssignedResponsivePresetKind = getAssignedResponsivePresetKind(frameAspectPreset)
    const nextAssignedResponsivePreset = nextAssignedResponsivePresetKind ? responsiveFrame[nextAssignedResponsivePresetKind] : null

    if (nextAssignedResponsivePreset) {
      setViewer({
        frameAspectPreset,
        cameraPosition: [...nextAssignedResponsivePreset.cameraPosition],
        orbitTarget: [...nextAssignedResponsivePreset.orbitTarget],
        resetCameraPosition: [...nextAssignedResponsivePreset.cameraPosition],
        resetOrbitTarget: [...nextAssignedResponsivePreset.orbitTarget],
        focalLength: nextAssignedResponsivePreset.focalLength,
      })
      return
    }

    setViewer({ frameAspectPreset })
  }

  const handleResponsiveAssignmentChange = (kind: ResponsiveFramePresetKind, frameAspectPreset: FrameAspectPreset) => {
    const patch: Partial<{
      frameAspectPreset: FrameAspectPreset
      cameraPosition: [number, number, number]
      orbitTarget: [number, number, number]
      focalLength: number
    }> = {
      frameAspectPreset,
    }

    if (viewer.frameAspectPreset === frameAspectPreset || assignedResponsivePresetKind === kind) {
      patch.cameraPosition = [...viewer.cameraPosition]
      patch.orbitTarget = [...viewer.orbitTarget]
      patch.focalLength = viewer.focalLength
    }

    setResponsiveFramePreset(kind, patch)
  }

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
              <div key={option.value} className="frame-aspect-choice">
                {(() => {
                  if (option.value === 'auto') {
                    const isCurrent = viewer.frameAspectPreset === option.value

                    return (
                      <>
                        <button
                          type="button"
                          className={`tool-button mode-button frame-aspect-button${isCurrent ? ' is-active' : ''}`}
                          aria-pressed={isCurrent}
                          title={option.label}
                          onClick={() => handleFrameAspectSelect(option.value)}
                        >
                          <FrameAspectIcon preset={option.value} />
                          <span className="frame-aspect-button__label">AUTO</span>
                        </button>
                        <div className="frame-aspect-choice__assignment">
                          <span className="frame-aspect-assignment frame-aspect-assignment--locked">IFR</span>
                        </div>
                      </>
                    )
                  }

                  const kind = getResponsiveFrameGroupKind(option.value)
                  const preset = responsiveFrame[kind]
                  const isLocked = kind === 'square'
                  const isAssigned = isLocked || preset.frameAspectPreset === option.value
                  const isCurrent = viewer.frameAspectPreset === option.value
                  const isSaved =
                    isAssigned &&
                    (!isCurrent ||
                      (areNumbersClose(viewer.focalLength, preset.focalLength) &&
                        areVector3Close(viewer.cameraPosition, preset.cameraPosition) &&
                        areVector3Close(viewer.orbitTarget, preset.orbitTarget)))

                  return (
                    <>
                      <button
                        type="button"
                        className={`tool-button mode-button frame-aspect-button${isCurrent ? ' is-active' : ''}${isSaved ? ' is-saved' : ''}`}
                        aria-pressed={isCurrent}
                        title={option.label}
                        onClick={() => handleFrameAspectSelect(option.value)}
                      >
                        <FrameAspectIcon preset={option.value} />
                        <span className="frame-aspect-button__label">{option.value}</span>
                      </button>
                      <div className="frame-aspect-choice__assignment">
                        <label
                          className={`frame-aspect-assignment${isAssigned ? ' is-active' : ''}${isLocked ? ' frame-aspect-assignment--locked' : ''}`}
                          title={`${getResponsiveFrameGroupTitle(kind)} responsive format`}
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            disabled={isLocked}
                            onChange={(event) => {
                              if (!event.currentTarget.checked || isLocked) {
                                return
                              }

                              handleResponsiveAssignmentChange(kind, option.value)
                            }}
                          />
                          <span>{getResponsiveFrameGroupLabel(kind)}</span>
                        </label>
                      </div>
                    </>
                  )
                })()}
              </div>
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
        <p className="settings-note">Checked L / P / S formats auto-save their camera when you switch to another format.</p>
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
  const godRaysBoxes = useEditorStore((state) => state.godRaysBoxes)
  const stencilVolumes = useEditorStore((state) => state.stencilVolumes)
  const objects = useEditorStore((state) => state.objects)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const transformSettings = useEditorStore((state) => state.transformSettings)
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const activeStencilVolumeEndHandleId = useEditorStore((state) => state.hud.activeStencilVolumeEndHandleId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setBackgroundAudio = useEditorStore((state) => state.setBackgroundAudio)
  const addGodRaysBox = useEditorStore((state) => state.addGodRaysBox)
  const addStencilVolume = useEditorStore((state) => state.addStencilVolume)
  const updateGodRaysBox = useEditorStore((state) => state.updateGodRaysBox)
  const updateStencilVolume = useEditorStore((state) => state.updateStencilVolume)
  const setGodRaysGlobalNoise = useEditorStore((state) => state.setGodRaysGlobalNoise)
  const godRaysGlobalNoise = useEditorStore((state) => state.godRaysGlobalNoise)
  const setGodRaysGlobalDirection = useEditorStore((state) => state.setGodRaysGlobalDirection)
  const godRaysGlobalDirection = useEditorStore((state) => state.godRaysGlobalDirection)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const isBloomSelected = selectedObjectId === 'effect:bloom'
  const isSceneAudioSelected = selectedObjectId === 'effect:scene-audio'
  const selectedStencilVolume = stencilVolumes.find((entry) => entry.id === selectedObjectId) ?? null
  const isEditingStencilVolumeEnd = Boolean(
    selectedStencilVolume && activeStencilVolumeEndHandleId === selectedStencilVolume.id,
  )
  const selectedGodRaysBox =
    godRaysBoxes.find((entry) => entry.id === selectedObjectId) ??
    godRaysBoxes.find((entry) => entry.id === activeGodRaysDirectionBoxId) ??
    null
  const isEditingGodRaysDirection = Boolean(
    selectedGodRaysBox && activeGodRaysDirectionBoxId === selectedGodRaysBox.id,
  )
  const selectedGodRaysTransform = selectedGodRaysBox ? objects[selectedGodRaysBox.id] ?? null : null
  const [isGodRaysNoiseOpen, setIsGodRaysNoiseOpen] = useState(false)
  const [isGodRaysDustDirectionOpen, setIsGodRaysDustDirectionOpen] = useState(false)
  const [isStencilRaysOpen, setIsStencilRaysOpen] = useState(true)
  const [isStencilNoiseOpen, setIsStencilNoiseOpen] = useState(false)
  const [isStencilDustOpen, setIsStencilDustOpen] = useState(false)
  const [isStencilDustDirectionOpen, setIsStencilDustDirectionOpen] = useState(false)
  const godRaysNoiseMotionModes = ['off', 'soft'] as const
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const stencilMaskInputRef = useRef<HTMLInputElement | null>(null)
  const currentAudioLabel = getEnvironmentDisplayName(backgroundAudio.assetLabel, 'No audio loaded')
  const hasSceneAudio = backgroundAudio.isAdded
  const activeGodRaysNoiseSettings = selectedGodRaysBox?.rayUseGlobalNoiseSettings
    ? godRaysGlobalNoise
    : selectedGodRaysBox
      ? {
          rayNoiseAmount: selectedGodRaysBox.rayNoiseAmount,
          rayNoiseScale: selectedGodRaysBox.rayNoiseScale,
          rayGrain: selectedGodRaysBox.rayGrain,
          rayNoiseMotionMode: selectedGodRaysBox.rayNoiseMotionMode,
          rayNoiseMotionSpeed: selectedGodRaysBox.rayNoiseMotionSpeed,
          rayQuality: selectedGodRaysBox.rayQuality,
        }
      : null
  const activeGodRaysDirection = selectedGodRaysBox
    ? normalizeGodRaysDirection(
        selectedGodRaysBox.dustDirectionMode === 'global'
          ? godRaysGlobalDirection
          : selectedGodRaysBox.dustDirectionLocal,
      )
    : null
  const activeStencilNoiseSettings = selectedStencilVolume?.rayUseGlobalNoiseSettings !== false
    ? godRaysGlobalNoise
    : selectedStencilVolume
      ? {
          rayNoiseAmount: selectedStencilVolume.rayNoiseAmount ?? godRaysGlobalNoise.rayNoiseAmount,
          rayNoiseScale: selectedStencilVolume.rayNoiseScale ?? godRaysGlobalNoise.rayNoiseScale,
          rayGrain: selectedStencilVolume.rayGrain ?? godRaysGlobalNoise.rayGrain,
          rayNoiseMotionMode: selectedStencilVolume.rayNoiseMotionMode ?? godRaysGlobalNoise.rayNoiseMotionMode,
          rayNoiseMotionSpeed: selectedStencilVolume.rayNoiseMotionSpeed ?? godRaysGlobalNoise.rayNoiseMotionSpeed,
          rayQuality: selectedStencilVolume.rayQuality ?? godRaysGlobalNoise.rayQuality,
        }
      : null
  const activeStencilDirection = selectedStencilVolume
    ? normalizeGodRaysDirection(
        (selectedStencilVolume.dustDirectionMode ?? 'global') === 'global'
          ? godRaysGlobalDirection
          : selectedStencilVolume.dustDirectionLocal ?? godRaysGlobalDirection,
      )
    : null
  const updateGodRaysNoiseSettings = (
    patch: Partial<{
      rayNoiseAmount: number
      rayNoiseScale: number
      rayGrain: number
      rayNoiseMotionMode: (typeof godRaysNoiseMotionModes)[number]
      rayNoiseMotionSpeed: number
      rayQuality: 'low' | 'medium' | 'high'
    }>,
  ) => {
    if (!selectedGodRaysBox) {
      return
    }

    if (selectedGodRaysBox.rayUseGlobalNoiseSettings) {
      setGodRaysGlobalNoise(patch)
      return
    }

    updateGodRaysBox(selectedGodRaysBox.id, patch)
  }

  const updateActiveGodRaysDirection = (direction: [number, number, number]) => {
    if (!selectedGodRaysBox) {
      return
    }

    if (selectedGodRaysBox.dustDirectionMode === 'local') {
      updateGodRaysBox(selectedGodRaysBox.id, {
        dustDirectionLocal: direction,
      })
      return
    }

    setGodRaysGlobalDirection(direction)
  }

  const resetActiveGodRaysDirection = () => {
    updateActiveGodRaysDirection(getGodRaysDefaultDirection())
  }

  const updateStencilNoiseSettings = (
    patch: Partial<{
      rayNoiseAmount: number
      rayNoiseScale: number
      rayGrain: number
      rayNoiseMotionMode: (typeof godRaysNoiseMotionModes)[number]
      rayNoiseMotionSpeed: number
      rayQuality: 'low' | 'medium' | 'high'
    }>,
  ) => {
    if (!selectedStencilVolume) {
      return
    }

    if (selectedStencilVolume.rayUseGlobalNoiseSettings !== false) {
      setGodRaysGlobalNoise(patch)
      return
    }

    updateStencilVolume(selectedStencilVolume.id, patch)
  }

  const updateActiveStencilDirection = (direction: [number, number, number]) => {
    if (!selectedStencilVolume) {
      return
    }

    if ((selectedStencilVolume.dustDirectionMode ?? 'global') === 'local') {
      updateStencilVolume(selectedStencilVolume.id, {
        dustDirectionLocal: direction,
      })
      return
    }

    setGodRaysGlobalDirection(direction)
  }

  const resetActiveStencilDirection = () => {
    updateActiveStencilDirection(getGodRaysDefaultDirection())
  }

  const isGodRaysDirectionPresetActive = (direction: [number, number, number]) => {
    if (!activeGodRaysDirection) {
      return false
    }

    const [ax, ay, az] = activeGodRaysDirection
    const [bx, by, bz] = normalizeGodRaysDirection(direction)
    const dot = ax * bx + ay * by + az * bz
    return dot >= 0.999
  }

  const isStencilDirectionPresetActive = (direction: [number, number, number]) => {
    if (!activeStencilDirection) {
      return false
    }

    const [ax, ay, az] = activeStencilDirection
    const [bx, by, bz] = normalizeGodRaysDirection(direction)
    const dot = ax * bx + ay * by + az * bz
    return dot >= 0.999
  }

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
          <button
            type="button"
            className={`tool-button effect-create-button${selectedGodRaysBox ? ' is-active' : ''}`}
            onClick={() => {
              addGodRaysBox()
            }}
          >
            <span className="tool-button__glyph">RAYS</span>
            <span className="tool-button__label">Create</span>
          </button>
          <button
            type="button"
            className={`tool-button effect-create-button${selectedStencilVolume ? ' is-active' : ''}`}
            onClick={() => {
              addStencilVolume()
            }}
          >
            <span className="tool-button__glyph">STENCIL</span>
            <span className="tool-button__label">Create</span>
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
        {selectedGodRaysBox ? (
          <>
            <p className="left-controls__label material-effect-active-title">
              {sceneGraph[selectedGodRaysBox.id]?.label ?? 'God Rays'}
            </p>
            <div className="god-rays-toggle-row">
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedGodRaysBox.raysEnabled}
                  onChange={(event) => updateGodRaysBox(selectedGodRaysBox.id, { raysEnabled: event.currentTarget.checked })}
                />
                <span>Rays Enabled</span>
              </label>
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedGodRaysBox.helperVisible}
                  onChange={(event) =>
                    updateGodRaysBox(selectedGodRaysBox.id, {
                      helperVisible: event.currentTarget.checked,
                    })
                  }
                />
                <span>Show Helper</span>
              </label>
            </div>
            <div className="god-rays-top-row">
              <label className="left-color-field left-color-field--swatch">
                <span>Ray Color</span>
                <input
                  type="color"
                  value={selectedGodRaysBox.rayColor}
                  onChange={(event) => updateGodRaysBox(selectedGodRaysBox.id, { rayColor: event.currentTarget.value })}
                />
              </label>
              <label className="left-slider">
                <span>Side Count</span>
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="1"
                  value={selectedGodRaysBox.sideCount}
                  onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { sideCount: Number(event.currentTarget.value) })}
                />
                <strong>{selectedGodRaysBox.sideCount}</strong>
              </label>
            </div>
            <label className="left-slider">
              <span>Height</span>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.01"
                value={selectedGodRaysTransform?.scale[1] ?? 1}
                onInput={(event) => {
                  const nextHeight = Number(event.currentTarget.value)
                  const currentScale = selectedGodRaysTransform?.scale ?? [1, 1, 1]
                  updateObjectTransform(selectedGodRaysBox.id, {
                    scale: [currentScale[0], nextHeight, currentScale[2]],
                  })
                }}
              />
              <strong>{formatNumber(selectedGodRaysTransform?.scale[1] ?? 1)}</strong>
            </label>
            <label className="left-slider">
              <span>Bottom Radius</span>
              <input
                type="range"
                min="0.05"
                max="2"
                step="0.01"
                value={selectedGodRaysBox.bottomRadius}
                onInput={(event) =>
                  updateGodRaysBox(selectedGodRaysBox.id, {
                    bottomRadius: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{formatNumber(selectedGodRaysBox.bottomRadius)}</strong>
            </label>
            <label className="left-toggle">
              <input
                type="checkbox"
                checked={selectedGodRaysBox.linkTopRadius}
                onChange={(event) =>
                  updateGodRaysBox(selectedGodRaysBox.id, {
                    linkTopRadius: event.currentTarget.checked,
                  })
                }
              />
              <span>Link Top Radius</span>
            </label>
            <label className="left-slider">
              <span>Top Radius</span>
              <input
                type="range"
                min="0.05"
                max="2"
                step="0.01"
                value={selectedGodRaysBox.topRadius}
                disabled={selectedGodRaysBox.linkTopRadius}
                onInput={(event) =>
                  updateGodRaysBox(selectedGodRaysBox.id, {
                    topRadius: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{formatNumber(selectedGodRaysBox.topRadius)}</strong>
            </label>
            <label className="left-slider">
              <span>Rounded Top</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={selectedGodRaysBox.topDome}
                onInput={(event) =>
                  updateGodRaysBox(selectedGodRaysBox.id, {
                    topDome: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{formatNumber(selectedGodRaysBox.topDome)}</strong>
            </label>
            <label className="left-slider">
              <span>Ray Intensity</span>
              <input
                type="range"
                min="0"
                max="5"
                step="0.01"
                value={selectedGodRaysBox.rayIntensity}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { rayIntensity: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.rayIntensity)}</strong>
            </label>
            <label className="left-slider">
              <span>Ray Falloff</span>
              <input
                type="range"
                min="0"
                max="4"
                step="0.01"
                value={selectedGodRaysBox.rayFalloff}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { rayFalloff: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.rayFalloff)}</strong>
            </label>
            <label className="left-slider">
              <span>Ray Edge Fade</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedGodRaysBox.rayEdgeFade}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { rayEdgeFade: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.rayEdgeFade)}</strong>
            </label>
            <details className="left-accordion" open={isGodRaysNoiseOpen} onToggle={(event) => setIsGodRaysNoiseOpen(event.currentTarget.open)}>
              <summary className="left-accordion__summary">
                <span>Noise</span>
                <span className="left-accordion__meta">{isGodRaysNoiseOpen ? 'Open' : 'Closed'}</span>
              </summary>
              <div className="left-accordion__content">
                <div className="left-controls__stack">
                  <span className="left-controls__label">Noise Motion</span>
                  <div className="segmented">
                    {godRaysNoiseMotionModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`tool-button mode-button${activeGodRaysNoiseSettings?.rayNoiseMotionMode === mode ? ' is-active' : ''}`}
                        onClick={() =>
                          updateGodRaysNoiseSettings({
                            rayNoiseMotionMode: mode,
                          })
                        }
                      >
                        {mode === 'soft' ? 'ANIM' : mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="left-toggle">
                  <input
                    type="checkbox"
                    checked={selectedGodRaysBox.rayUseGlobalNoiseSettings}
                    onChange={(event) =>
                      updateGodRaysBox(selectedGodRaysBox.id, {
                        rayUseGlobalNoiseSettings: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Global Noise Settings</span>
                </label>
                <label className="left-slider">
                  <span>Noise Amount</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={activeGodRaysNoiseSettings?.rayNoiseAmount ?? 0}
                    onInput={(event) => updateGodRaysNoiseSettings({ rayNoiseAmount: Number(event.currentTarget.value) })}
                  />
                  <strong>{formatNumber(activeGodRaysNoiseSettings?.rayNoiseAmount ?? 0)}</strong>
                </label>
                <label className="left-slider">
                  <span>Noise Scale</span>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.01"
                    value={activeGodRaysNoiseSettings?.rayNoiseScale ?? 0.1}
                    onInput={(event) => updateGodRaysNoiseSettings({ rayNoiseScale: Number(event.currentTarget.value) })}
                  />
                  <strong>{formatNumber(activeGodRaysNoiseSettings?.rayNoiseScale ?? 0.1)}</strong>
                </label>
                <label className="left-slider">
                  <span>Grain</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={activeGodRaysNoiseSettings?.rayGrain ?? 0}
                    onInput={(event) => updateGodRaysNoiseSettings({ rayGrain: Number(event.currentTarget.value) })}
                  />
                  <strong>{formatNumber(activeGodRaysNoiseSettings?.rayGrain ?? 0)}</strong>
                </label>
                <label className="left-select">
                  <span>Quality</span>
                  <select
                    value={activeGodRaysNoiseSettings?.rayQuality ?? 'low'}
                    onChange={(event) =>
                      updateGodRaysNoiseSettings({
                        rayQuality: event.currentTarget.value as 'low' | 'medium' | 'high',
                      })
                    }
                  >
                    <option value="low">LOW</option>
                    <option value="medium">MEDIUM</option>
                    <option value="high">HIGH</option>
                  </select>
                </label>
                {activeGodRaysNoiseSettings?.rayNoiseMotionMode === 'soft' ? (
                  <label className="left-slider">
                    <span>Noise Motion Speed</span>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.01"
                      value={activeGodRaysNoiseSettings?.rayNoiseMotionSpeed ?? 0}
                      onInput={(event) =>
                        updateGodRaysNoiseSettings({
                          rayNoiseMotionSpeed: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <strong>{formatNumber(activeGodRaysNoiseSettings?.rayNoiseMotionSpeed ?? 0)}</strong>
                  </label>
                ) : null}
              </div>
            </details>
            <span className="left-controls__label">Dust</span>
            <div className="god-rays-dust-toggles">
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedGodRaysBox.dustEnabled}
                  onChange={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustEnabled: event.currentTarget.checked })}
                />
                <span>Dust Enabled</span>
              </label>
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedGodRaysBox.dustColorLinked}
                  onChange={(event) =>
                    updateGodRaysBox(selectedGodRaysBox.id, {
                      dustColorLinked: event.currentTarget.checked,
                      dustColor: event.currentTarget.checked ? selectedGodRaysBox.rayColor : selectedGodRaysBox.dustColor,
                    })
                  }
                />
                <span>Link Dust Color To Rays</span>
              </label>
            </div>
            <div className="god-rays-top-row">
              <label className="left-color-field left-color-field--swatch">
                <span>Dust Color</span>
                <input
                  type="color"
                  value={selectedGodRaysBox.dustColorLinked ? selectedGodRaysBox.rayColor : selectedGodRaysBox.dustColor}
                  disabled={selectedGodRaysBox.dustColorLinked}
                  onChange={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustColor: event.currentTarget.value })}
                />
              </label>
              <label className="left-slider">
                <span>Dust Count</span>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="1"
                  value={selectedGodRaysBox.dustCount}
                  onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustCount: Number(event.currentTarget.value) })}
                />
                <strong>{selectedGodRaysBox.dustCount}</strong>
              </label>
            </div>
            <label className="left-slider">
              <span>Dust Size Min</span>
              <input
                type="range"
                min="0.005"
                max="0.1"
                step="0.001"
                value={selectedGodRaysBox.dustSizeMin}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustSizeMin: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.dustSizeMin, 3)}</strong>
            </label>
            <label className="left-slider">
              <span>Dust Size Max</span>
              <input
                type="range"
                min="0.005"
                max="0.2"
                step="0.001"
                value={selectedGodRaysBox.dustSizeMax}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustSizeMax: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.dustSizeMax, 3)}</strong>
            </label>
            <label className="left-slider">
              <span>Dust Speed</span>
              <input
                type="range"
                min="0"
                max="100"
                step="0.01"
                value={getGodRaysDustSpeedSliderValue(selectedGodRaysBox.dustSpeed)}
                onInput={(event) =>
                  updateGodRaysBox(selectedGodRaysBox.id, {
                    dustSpeed: getGodRaysDustSpeedFromSliderValue(Number(event.currentTarget.value)),
                  })
                }
              />
              <strong>{formatNumber(getGodRaysDustSpeedSliderValue(selectedGodRaysBox.dustSpeed))}</strong>
            </label>
            <label className="left-slider">
              <span>Dust Strength</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedGodRaysBox.dustStrength}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustStrength: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.dustStrength)}</strong>
            </label>
            <label className="left-slider">
              <span>Dust Drift</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={selectedGodRaysBox.dustDrift}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustDrift: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.dustDrift)}</strong>
            </label>
            <label className="left-slider">
              <span>Dust Edge Fade</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedGodRaysBox.dustEdgeFade}
                onInput={(event) => updateGodRaysBox(selectedGodRaysBox.id, { dustEdgeFade: Number(event.currentTarget.value) })}
              />
              <strong>{formatNumber(selectedGodRaysBox.dustEdgeFade)}</strong>
            </label>
            <details
              className="left-accordion"
              open={isGodRaysDustDirectionOpen}
              onToggle={(event) => setIsGodRaysDustDirectionOpen(event.currentTarget.open)}
            >
              <summary className="left-accordion__summary">
                <span>Dust Direction Mode</span>
                <span className="left-accordion__meta">{isGodRaysDustDirectionOpen ? 'Open' : 'Closed'}</span>
              </summary>
              <div className="left-accordion__content">
                <div className="god-rays-direction-grid" role="group" aria-label="Dust direction presets">
                  {GOD_RAYS_DIRECTION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`tool-button mode-button god-rays-direction-grid__button${isGodRaysDirectionPresetActive(preset.direction) ? ' is-active' : ''}`}
                      aria-pressed={isGodRaysDirectionPresetActive(preset.direction)}
                      onClick={() => updateActiveGodRaysDirection(preset.direction)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className="left-toggle">
                  <input
                    type="checkbox"
                    checked={selectedGodRaysBox.dustDirectionMode === 'global'}
                    onChange={(event) =>
                      updateGodRaysBox(selectedGodRaysBox.id, {
                        dustDirectionMode: event.currentTarget.checked ? 'global' : 'local',
                      })
                    }
                  />
                  <span>Global Direction Settings</span>
                </label>
                <div className="god-rays-direction-actions">
                  <button
                    type="button"
                    className={`tool-button god-rays-direction-actions__button${isEditingGodRaysDirection ? ' is-active' : ''}`}
                    onClick={() => {
                      if (isEditingGodRaysDirection) {
                        setSelectedObjectId(selectedGodRaysBox.id)
                        setHud({
                          transformMode: 'none',
                          activeGodRaysDirectionBoxId: null,
                          activeStencilVolumeEndHandleId: null,
                        })
                        return
                      }

                      setSelectedObjectId(selectedGodRaysBox.id)
                      setHud({
                        anchorModeEnabled: false,
                        transformMode: 'rotate',
                        activeGodRaysDirectionBoxId: selectedGodRaysBox.id,
                        activeStencilVolumeEndHandleId: null,
                      })
                    }}
                  >
                    <span className="tool-button__glyph">DIR</span>
                    <span className="tool-button__label">{isEditingGodRaysDirection ? 'Done' : 'Edit Direction'}</span>
                  </button>
                  <button
                    type="button"
                    className="tool-button god-rays-direction-actions__button god-rays-direction-actions__button--reset"
                    onClick={resetActiveGodRaysDirection}
                  >
                    <span className="tool-button__glyph">RST</span>
                    <span className="tool-button__label">Reset Active</span>
                  </button>
                </div>
              </div>
            </details>
          </>
        ) : null}
        {selectedStencilVolume ? (
          <>
            <p className="left-controls__label material-effect-active-title">
              {sceneGraph[selectedStencilVolume.id]?.label ?? 'Stencil Volume'}
            </p>
            <div className="material-asset-control material-asset-control--upload">
              <button
                type="button"
                className="material-asset-control__button material-asset-control__button--compact"
                onClick={() => stencilMaskInputRef.current?.click()}
              >
                <span className="tool-button__label">Load MASK</span>
              </button>
              <div
                className="material-asset-control__value"
                title={selectedStencilVolume.maskAssetLabel ?? 'No mask loaded'}
              >
                {selectedStencilVolume.maskAssetLabel ?? 'No mask loaded'}
              </div>
            </div>
            <input
              ref={stencilMaskInputRef}
              className="hidden-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.bmp,image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) {
                  return
                }

                updateStencilVolume(selectedStencilVolume.id, {
                  maskAssetLabel: file.name,
                  maskAssetUrl: createObjectUrl(file),
                })
                event.currentTarget.value = ''
              }}
            />
            <div className="stencil-mask-preview" aria-label="Stencil mask preview">
              {selectedStencilVolume.maskAssetUrl ? (
                <img
                  className="stencil-mask-preview__image"
                  src={selectedStencilVolume.maskAssetUrl}
                  alt={selectedStencilVolume.maskAssetLabel ?? 'Stencil mask'}
                />
              ) : (
                <div className="stencil-mask-preview__placeholder">
                  <span>MASK</span>
                  <em>Preview</em>
                </div>
              )}
            </div>
            <span className="left-controls__label">Extrude</span>
            <div className="god-rays-direction-actions">
              <button
                type="button"
                className={`tool-button god-rays-direction-actions__button${isEditingStencilVolumeEnd ? ' is-active' : ''}`}
                onClick={() => {
                  if (isEditingStencilVolumeEnd) {
                    setSelectedObjectId(selectedStencilVolume.id)
                    setHud({
                      transformMode: 'none',
                      activeStencilVolumeEndHandleId: null,
                    })
                    return
                  }

                  setSelectedObjectId(selectedStencilVolume.id)
                  setHud({
                    anchorModeEnabled: false,
                    transformMode: 'translate',
                    activeGodRaysDirectionBoxId: null,
                    activeStencilVolumeEndHandleId: selectedStencilVolume.id,
                  })
                }}
              >
                <span className="tool-button__glyph">END</span>
                <span className="tool-button__label">{isEditingStencilVolumeEnd ? 'Done' : 'Edit End'}</span>
              </button>
              <button
                type="button"
                className="tool-button god-rays-direction-actions__button god-rays-direction-actions__button--reset"
                onClick={() =>
                  updateStencilVolume(selectedStencilVolume.id, {
                    extrudeEnd: [...DEFAULT_STENCIL_VOLUME.extrudeEnd],
                    endRotationX: DEFAULT_STENCIL_VOLUME.endRotationX,
                    endRotationY: DEFAULT_STENCIL_VOLUME.endRotationY,
                    endScaleX: DEFAULT_STENCIL_VOLUME.endScaleX,
                    endScaleY: DEFAULT_STENCIL_VOLUME.endScaleY,
                  })
                }
              >
                <span className="tool-button__glyph">RST</span>
                <span className="tool-button__label">Reset End</span>
              </button>
            </div>
            <p className="sidebar-field-title">Mask</p>
            <div className="stencil-volume-toggle-grid">
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedStencilVolume.helperVisible}
                  onChange={(event) =>
                    updateStencilVolume(selectedStencilVolume.id, {
                      helperVisible: event.currentTarget.checked,
                    })
                  }
                />
                <span>Show Helper</span>
              </label>
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedStencilVolume.contourDebugVisible ?? DEFAULT_STENCIL_VOLUME.contourDebugVisible}
                  onChange={(event) =>
                    updateStencilVolume(selectedStencilVolume.id, {
                      contourDebugVisible: event.currentTarget.checked,
                    })
                  }
                />
                <span>Contour Debug</span>
              </label>
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={selectedStencilVolume.projectionVisible}
                  onChange={(event) =>
                    updateStencilVolume(selectedStencilVolume.id, {
                      projectionVisible: event.currentTarget.checked,
                    })
                  }
                />
                <span>Projection Planes</span>
              </label>
            </div>
            <label className="left-slider">
              <span>Contour Detail</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedStencilVolume.contourDetail}
                onInput={(event) =>
                  updateStencilVolume(selectedStencilVolume.id, {
                    contourDetail: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{Math.round(selectedStencilVolume.contourDetail * 100)}</strong>
            </label>
            <label className="left-slider">
              <span>Simplify</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedStencilVolume.contourSimplify}
                onInput={(event) =>
                  updateStencilVolume(selectedStencilVolume.id, {
                    contourSimplify: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{Math.round(selectedStencilVolume.contourSimplify * 100)}</strong>
            </label>
            <label className="left-slider">
              <span>Smooth</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedStencilVolume.contourSmooth}
                onInput={(event) =>
                  updateStencilVolume(selectedStencilVolume.id, {
                    contourSmooth: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{Math.round(selectedStencilVolume.contourSmooth * 100)}</strong>
            </label>
            <label className="left-slider">
              <span>Min Contour Area</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedStencilVolume.contourMinArea ?? DEFAULT_STENCIL_VOLUME.contourMinArea}
                onInput={(event) =>
                  updateStencilVolume(selectedStencilVolume.id, {
                    contourMinArea: Number(event.currentTarget.value),
                  })
                }
              />
              <strong>{Math.round((selectedStencilVolume.contourMinArea ?? DEFAULT_STENCIL_VOLUME.contourMinArea) * 100)}</strong>
            </label>
            <div className="stencil-volume-dimensions">
              <label className="field field--compact-number stencil-volume-dimensions__field">
                <span>Width</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={transformSettings.measurementUnit === 'cm' ? 5 : 0.05}
                  max={transformSettings.measurementUnit === 'cm' ? 2000 : 20}
                  step={transformSettings.measurementUnit === 'cm' ? 1 : 0.01}
                  value={Number(formatNumber(toDisplayStencilDimension(selectedStencilVolume.sourceWidth, transformSettings.measurementUnit)))}
                  onChange={(event) => {
                    const nextValue = Number(event.currentTarget.value)
                    if (!Number.isFinite(nextValue)) {
                      return
                    }

                    updateStencilVolume(selectedStencilVolume.id, {
                      sourceWidth: toInternalStencilDimension(nextValue, transformSettings.measurementUnit),
                    })
                  }}
                />
              </label>
              <label className="field field--compact-number stencil-volume-dimensions__field">
                <span>Height</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={transformSettings.measurementUnit === 'cm' ? 5 : 0.05}
                  max={transformSettings.measurementUnit === 'cm' ? 2000 : 20}
                  step={transformSettings.measurementUnit === 'cm' ? 1 : 0.01}
                  value={Number(formatNumber(toDisplayStencilDimension(selectedStencilVolume.sourceHeight, transformSettings.measurementUnit)))}
                  onChange={(event) => {
                    const nextValue = Number(event.currentTarget.value)
                    if (!Number.isFinite(nextValue)) {
                      return
                    }

                    updateStencilVolume(selectedStencilVolume.id, {
                      sourceHeight: toInternalStencilDimension(nextValue, transformSettings.measurementUnit),
                    })
                  }}
                />
              </label>
              <span className="stencil-volume-dimensions__unit">{transformSettings.measurementUnit}</span>
            </div>
            <details className="left-accordion" open={isStencilRaysOpen} onToggle={(event) => setIsStencilRaysOpen(event.currentTarget.open)}>
              <summary className="left-accordion__summary">
                <span>Rays</span>
                <span className="left-accordion__meta">{isStencilRaysOpen ? 'Open' : 'Closed'}</span>
              </summary>
              <div className="left-accordion__content">
                <label className="left-color-field left-color-field--swatch">
                  <span>Volume Color</span>
                  <input
                    type="color"
                    value={selectedStencilVolume.volumeColor}
                    onChange={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        volumeColor: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label className="left-slider">
                  <span>Volume Intensity</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.01"
                    value={selectedStencilVolume.volumeIntensity}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        volumeIntensity: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.volumeIntensity)}</strong>
                </label>
                <label className="left-slider">
                  <span>Volume Falloff</span>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="0.01"
                    value={selectedStencilVolume.volumeFalloff}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        volumeFalloff: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.volumeFalloff)}</strong>
                </label>
                <label className="left-slider">
                  <span>Edge Fade</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={selectedStencilVolume.rayEdgeFade ?? DEFAULT_STENCIL_VOLUME.rayEdgeFade}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        rayEdgeFade: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.rayEdgeFade ?? DEFAULT_STENCIL_VOLUME.rayEdgeFade)}</strong>
                </label>
                <label className="left-slider">
                  <span>Ray Fill Quality</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedStencilVolume.rayFillQuality ?? DEFAULT_STENCIL_VOLUME.rayFillQuality}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        rayFillQuality: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{Math.round((selectedStencilVolume.rayFillQuality ?? DEFAULT_STENCIL_VOLUME.rayFillQuality) * 100)}</strong>
                </label>
                <details className="left-accordion" open={isStencilNoiseOpen} onToggle={(event) => setIsStencilNoiseOpen(event.currentTarget.open)}>
                  <summary className="left-accordion__summary">
                    <span>Noise</span>
                    <span className="left-accordion__meta">{isStencilNoiseOpen ? 'Open' : 'Closed'}</span>
                  </summary>
                  <div className="left-accordion__content">
                    <div className="left-controls__stack">
                      <span className="left-controls__label">Noise Motion</span>
                      <div className="segmented">
                        {godRaysNoiseMotionModes.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`tool-button mode-button${activeStencilNoiseSettings?.rayNoiseMotionMode === mode ? ' is-active' : ''}`}
                            onClick={() =>
                              updateStencilNoiseSettings({
                                rayNoiseMotionMode: mode,
                              })
                            }
                          >
                            {mode === 'soft' ? 'ANIM' : mode.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="left-toggle">
                      <input
                        type="checkbox"
                        checked={selectedStencilVolume.rayUseGlobalNoiseSettings !== false}
                        onChange={(event) =>
                          updateStencilVolume(selectedStencilVolume.id, {
                            rayUseGlobalNoiseSettings: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Global Noise Settings</span>
                    </label>
                    <label className="left-slider">
                      <span>Noise Amount</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={activeStencilNoiseSettings?.rayNoiseAmount ?? 0}
                        onInput={(event) => updateStencilNoiseSettings({ rayNoiseAmount: Number(event.currentTarget.value) })}
                      />
                      <strong>{formatNumber(activeStencilNoiseSettings?.rayNoiseAmount ?? 0)}</strong>
                    </label>
                    <label className="left-slider">
                      <span>Noise Scale</span>
                      <input
                        type="range"
                        min="0.1"
                        max="10"
                        step="0.01"
                        value={activeStencilNoiseSettings?.rayNoiseScale ?? 0.1}
                        onInput={(event) => updateStencilNoiseSettings({ rayNoiseScale: Number(event.currentTarget.value) })}
                      />
                      <strong>{formatNumber(activeStencilNoiseSettings?.rayNoiseScale ?? 0.1)}</strong>
                    </label>
                    <label className="left-slider">
                      <span>Grain</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={activeStencilNoiseSettings?.rayGrain ?? 0}
                        onInput={(event) => updateStencilNoiseSettings({ rayGrain: Number(event.currentTarget.value) })}
                      />
                      <strong>{formatNumber(activeStencilNoiseSettings?.rayGrain ?? 0)}</strong>
                    </label>
                    <label className="left-select">
                      <span>Quality</span>
                      <select
                        value={activeStencilNoiseSettings?.rayQuality ?? 'low'}
                        onChange={(event) =>
                          updateStencilNoiseSettings({
                            rayQuality: event.currentTarget.value as 'low' | 'medium' | 'high',
                          })
                        }
                      >
                        <option value="low">LOW</option>
                        <option value="medium">MEDIUM</option>
                        <option value="high">HIGH</option>
                      </select>
                    </label>
                    {activeStencilNoiseSettings?.rayNoiseMotionMode === 'soft' ? (
                      <label className="left-slider">
                        <span>Noise Motion Speed</span>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.01"
                          value={activeStencilNoiseSettings?.rayNoiseMotionSpeed ?? 0}
                          onInput={(event) =>
                            updateStencilNoiseSettings({
                              rayNoiseMotionSpeed: Number(event.currentTarget.value),
                            })
                          }
                        />
                        <strong>{formatNumber(activeStencilNoiseSettings?.rayNoiseMotionSpeed ?? 0)}</strong>
                      </label>
                    ) : null}
                  </div>
                </details>
              </div>
            </details>
            <details className="left-accordion" open={isStencilDustOpen} onToggle={(event) => setIsStencilDustOpen(event.currentTarget.open)}>
              <summary className="left-accordion__summary">
                <span>Dust</span>
                <span className="left-accordion__meta">{isStencilDustOpen ? 'Open' : 'Closed'}</span>
              </summary>
              <div className="left-accordion__content">
                <div className="god-rays-dust-toggles">
                  <label className="left-toggle">
                    <input
                      type="checkbox"
                      checked={selectedStencilVolume.dustEnabled}
                      onChange={(event) =>
                        updateStencilVolume(selectedStencilVolume.id, {
                          dustEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Dust Enabled</span>
                  </label>
                  <label className="left-toggle">
                    <input
                      type="checkbox"
                      checked={selectedStencilVolume.dustColorLinked ?? DEFAULT_STENCIL_VOLUME.dustColorLinked}
                      onChange={(event) =>
                        updateStencilVolume(selectedStencilVolume.id, {
                          dustColorLinked: event.currentTarget.checked,
                          dustColor: event.currentTarget.checked
                            ? selectedStencilVolume.volumeColor
                            : selectedStencilVolume.dustColor ?? selectedStencilVolume.volumeColor,
                        })
                      }
                    />
                    <span>Link Dust Color To Volume</span>
                  </label>
                </div>
                <div className="god-rays-top-row">
                  <label className="left-color-field left-color-field--swatch">
                    <span>Dust Color</span>
                    <input
                      type="color"
                      value={
                        (selectedStencilVolume.dustColorLinked ?? DEFAULT_STENCIL_VOLUME.dustColorLinked)
                          ? selectedStencilVolume.volumeColor
                          : selectedStencilVolume.dustColor ?? selectedStencilVolume.volumeColor
                      }
                      disabled={selectedStencilVolume.dustColorLinked ?? DEFAULT_STENCIL_VOLUME.dustColorLinked}
                      onChange={(event) =>
                        updateStencilVolume(selectedStencilVolume.id, {
                          dustColor: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <label className="left-slider">
                    <span>Dust Count</span>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="1"
                      value={selectedStencilVolume.dustCount}
                      onInput={(event) =>
                        updateStencilVolume(selectedStencilVolume.id, {
                          dustCount: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <strong>{selectedStencilVolume.dustCount}</strong>
                  </label>
                </div>
                <label className="left-slider">
                  <span>Dust Size Min</span>
                  <input
                    type="range"
                    min="0.005"
                    max="0.1"
                    step="0.001"
                    value={selectedStencilVolume.dustSizeMin}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustSizeMin: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.dustSizeMin, 3)}</strong>
                </label>
                <label className="left-slider">
                  <span>Dust Size Max</span>
                  <input
                    type="range"
                    min="0.005"
                    max="0.2"
                    step="0.001"
                    value={selectedStencilVolume.dustSizeMax}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustSizeMax: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.dustSizeMax, 3)}</strong>
                </label>
                <label className="left-slider">
                  <span>Dust Speed</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.01"
                    value={getGodRaysDustSpeedSliderValue(selectedStencilVolume.dustSpeed)}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustSpeed: getGodRaysDustSpeedFromSliderValue(Number(event.currentTarget.value)),
                      })
                    }
                  />
                  <strong>{formatNumber(getGodRaysDustSpeedSliderValue(selectedStencilVolume.dustSpeed))}</strong>
                </label>
                <label className="left-slider">
                  <span>Dust Strength</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedStencilVolume.dustStrength}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustStrength: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.dustStrength)}</strong>
                </label>
                <label className="left-slider">
                  <span>Dust Drift</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={selectedStencilVolume.dustDrift}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustDrift: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.dustDrift)}</strong>
                </label>
                <label className="left-slider">
                  <span>Dust Edge Fade</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedStencilVolume.dustEdgeFade ?? DEFAULT_STENCIL_VOLUME.dustEdgeFade}
                    onInput={(event) =>
                      updateStencilVolume(selectedStencilVolume.id, {
                        dustEdgeFade: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <strong>{formatNumber(selectedStencilVolume.dustEdgeFade ?? DEFAULT_STENCIL_VOLUME.dustEdgeFade)}</strong>
                </label>
                <details
                  className="left-accordion"
                  open={isStencilDustDirectionOpen}
                  onToggle={(event) => setIsStencilDustDirectionOpen(event.currentTarget.open)}
                >
                  <summary className="left-accordion__summary">
                    <span>Dust Direction Mode</span>
                    <span className="left-accordion__meta">{isStencilDustDirectionOpen ? 'Open' : 'Closed'}</span>
                  </summary>
                  <div className="left-accordion__content">
                    <div className="god-rays-direction-grid" role="group" aria-label="Stencil dust direction presets">
                      {GOD_RAYS_DIRECTION_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`tool-button mode-button god-rays-direction-grid__button${isStencilDirectionPresetActive(preset.direction) ? ' is-active' : ''}`}
                          aria-pressed={isStencilDirectionPresetActive(preset.direction)}
                          onClick={() => updateActiveStencilDirection(preset.direction)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <label className="left-toggle">
                      <input
                        type="checkbox"
                        checked={(selectedStencilVolume.dustDirectionMode ?? DEFAULT_STENCIL_VOLUME.dustDirectionMode) === 'global'}
                        onChange={(event) =>
                          updateStencilVolume(selectedStencilVolume.id, {
                            dustDirectionMode: event.currentTarget.checked ? 'global' : 'local',
                          })
                        }
                      />
                      <span>Global Direction Settings</span>
                    </label>
                    <div className="god-rays-direction-actions">
                      <button
                        type="button"
                        className="tool-button god-rays-direction-actions__button god-rays-direction-actions__button--reset"
                        onClick={resetActiveStencilDirection}
                      >
                        <span className="tool-button__glyph">RST</span>
                        <span className="tool-button__label">Reset Active</span>
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </details>
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
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setHud = useEditorStore((state) => state.setHud)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const [activeTab, setActiveTab] = useState<SidebarTab>('scn')
  const [outlinerViewMode, setOutlinerViewMode] = useState<OutlinerViewMode>('layers')
  const [isWebPublishSubmitting, setIsWebPublishSubmitting] = useState(false)
  const webPublishAbortRef = useRef<AbortController | null>(null)

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

  useEffect(() => {
    return () => {
      webPublishAbortRef.current?.abort()
    }
  }, [])

  const objectCount = useMemo(
    () => Object.values(sceneGraph).filter((node) => node.type !== 'material').length,
    [sceneGraph],
  )

  const glbInputRef = useRef<HTMLInputElement | null>(null)

  const handleRunPublishedScene = async () => {
    try {
      setSelectedObjectId(null)
      setSelectedMaterialId(null)
      setHud({ transformMode: 'none' })
      const warnings = await openPublishedScenePreview()
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

  const handleExportWebPackage = async () => {
    webPublishAbortRef.current?.abort()
    const abortController = new AbortController()
    webPublishAbortRef.current = abortController
    setIsWebPublishSubmitting(true)
    broadcastWebPublishStatus({
      phase: 'preparing',
      message: 'Packaging scene for web publish...',
      sceneSlug: null,
      prettySceneUrl: null,
      publicSceneUrl: null,
      deployOrigin: null,
      gitCommitSha: null,
    })
    setStatus('Packaging scene for web publish...')

    try {
      const result = await exportWebPackage('scene-web-package.zip', {
        signal: abortController.signal,
        onDeploymentStatusChange: (nextStatus) => {
          broadcastWebPublishStatus(nextStatus)
          setStatus(nextStatus.message)
        },
      })
      if (result.destination === 'cancelled') {
        broadcastWebPublishStatus(null)
        setStatus('Web publish cancelled.')
        return
      }

      const { warnings } = result
      if (warnings.length) {
        const warningLabel =
          result.sceneSlug
            ? `Scene published to web as ${result.sceneSlug} with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Waiting for Vercel...`
            : `Scene published to web with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Waiting for Vercel...`
        setStatus(warningLabel)
        return
      }

      const successLabel =
        result.sceneSlug
          ? `Scene published to GitHub as ${result.sceneSlug}. Waiting for Vercel...`
          : 'Scene published to GitHub. Waiting for Vercel...'
      setStatus(successLabel)
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return
      }

      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to export web package.'
      broadcastWebPublishStatus({
        phase: 'error',
        message,
        sceneSlug: null,
        prettySceneUrl: null,
        publicSceneUrl: null,
        deployOrigin: null,
        gitCommitSha: null,
      })
      setStatus(message)
    } finally {
      setIsWebPublishSubmitting(false)
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
          <button type="button" className="tool-button" onClick={() => glbInputRef.current?.click()}>
            <span className="tool-button__glyph">GLB</span>
            <span className="tool-button__label">load GLB</span>
          </button>
          <button type="button" className="tool-button" onClick={handleRunPublishedScene}>
            <span className="tool-button__glyph">RUN</span>
            <span className="tool-button__label">Local</span>
          </button>
          <button
            type="button"
            className="tool-button"
            onClick={() => void handleExportWebPackage()}
            disabled={isWebPublishSubmitting}
          >
            <span className="tool-button__glyph">WEB</span>
            <span className="tool-button__label">{isWebPublishSubmitting ? 'Publishing...' : 'Package'}</span>
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
