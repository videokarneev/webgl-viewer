import { useRef, useState } from 'react'
import { useEditorStore, type SceneGraphNode } from '../store/editorStore'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { copySceneConfigToClipboard, downloadSceneConfig } from '../features/config/buildSceneConfig'
import { useViewportPresentation } from '../features/viewport/ViewportPresentationContext'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function getNodeIcon(type: SceneGraphNode['type']) {
  switch (type) {
    case 'group':
      return 'F'
    case 'mesh':
      return 'M'
    case 'light':
      return 'L'
    case 'material':
      return 'P'
    case 'camera':
      return 'C'
    default:
      return 'N'
  }
}

function Accordion({
  title,
  meta,
  defaultOpen = true,
  className,
  children,
}: {
  title: string
  meta?: string
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <details className={`left-accordion ${className ?? ''}`.trim()} open={defaultOpen}>
      <summary className="left-accordion__summary">
        <span>{title}</span>
        {meta ? <span className="left-accordion__meta">{meta}</span> : null}
      </summary>
      <div className="left-accordion__content">{children}</div>
    </details>
  )
}

function TreeNode({ nodeId, depth = 0 }: { nodeId: string; depth?: number }) {
  const node = useEditorStore((state) => state.sceneGraph[nodeId])
  const objects = useEditorStore((state) => state.objects)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)

  if (!node) return null

  const objectState = objects[nodeId]
  const shouldFlatten =
    node.type === 'group' &&
    node.parentId !== null &&
    node.children.length === 1 &&
    sceneGraph[node.children[0]]?.type !== 'material' &&
    objectState != null &&
    objectState.position.every((value) => Math.abs(value) < 0.0001) &&
    objectState.rotation.every((value) => Math.abs(value) < 0.0001) &&
    objectState.scale.every((value) => Math.abs(value - 1) < 0.0001)

  if (shouldFlatten) {
    return <TreeNode nodeId={node.children[0]} depth={depth} />
  }

  return (
    <>
      <button
        className={`tree-node ${selectedObjectId === nodeId ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        onClick={() => setSelectedObjectId(nodeId)}
        type="button"
      >
        <span className="tree-node__branch" />
        <span className={`tree-node__icon is-${node.type}`}>{getNodeIcon(node.type)}</span>
        <span className="tree-node__type">{node.type}</span>
        <span className="tree-node__label">{node.label}</span>
      </button>
      {node.children.map((childId) => (
        <TreeNode key={childId} nodeId={childId} depth={depth + 1} />
      ))}
    </>
  )
}

export function SceneManager() {
  const [sceneTab, setSceneTab] = useState<'reflections' | 'background'>('reflections')
  const [cameraTabOpen, setCameraTabOpen] = useState(true)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const extraLights = useEditorStore((state) => state.extraLights)
  const materialCount = useEditorStore((state) => Object.keys(state.materials).length)
  const objectCount = useEditorStore((state) => Object.keys(state.objects).length)
  const status = useEditorStore((state) => state.status)
  const assets = useEditorStore((state) => state.assets)
  const environment = useEditorStore((state) => state.environment)
  const viewer = useEditorStore((state) => state.viewer)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const requestConfigImport = useEditorStore((state) => state.requestConfigImport)
  const requestSceneReset = useEditorStore((state) => state.requestSceneReset)
  const addExtraLight = useEditorStore((state) => state.addExtraLight)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setEnvironmentTextures = useEditorStore((state) => state.setEnvironmentTextures)
  const setAssets = useEditorStore((state) => state.setAssets)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setViewer = useEditorStore((state) => state.setViewer)
  const {
    bloomEnabled,
    setBloomEnabled,
    bloomThreshold,
    setBloomThreshold,
    bloomIntensity,
    setBloomIntensity,
    bloomSmoothing,
    setBloomSmoothing,
  } = useViewportPresentation()
  const modelInputRef = useRef<HTMLInputElement | null>(null)
  const reflectionsInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)
  const configInputRef = useRef<HTMLInputElement | null>(null)

  const clearReflections = () => {
    const { runtimeTextures, environment: currentEnvironment } = useEditorStore.getState()
    if (currentEnvironment.customHdriUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(currentEnvironment.customHdriUrl)
    }
    runtimeTextures.environmentMap?.dispose()
    setEnvironmentTextures({ environmentMap: null })
    setAssets({ reflections: null })
    setEnvironment({
      kind: 'default',
      source: null,
      customHdriUrl: null,
      background: environment.background === 'reflections' ? 'none' : environment.background,
    })
    setStatus('Reflections cleared.')
  }

  const clearBackground = () => {
    const runtimeTextures = useEditorStore.getState().runtimeTextures
    if (
      runtimeTextures.environmentBackground &&
      runtimeTextures.environmentBackground !== runtimeTextures.environmentMap
    ) {
      runtimeTextures.environmentBackground.dispose()
    }
    setEnvironmentTextures({ environmentBackground: null })
    setAssets({ background: null })
    setEnvironment({
      background: 'none',
      backgroundVisible: false,
      source: assets.reflections ?? null,
      kind: assets.reflections ? 'hdri' : 'default',
    })
    setStatus('Background cleared.')
  }

  return (
    <aside className="left-panel">
      <div className="left-panel__title">
        <div>
          <p className="panel-eyebrow">GLB Viewer</p>
          <p className="panel-heading">Scene Tool</p>
        </div>
        <p className="panel-meta">
          {objectCount} objects / {materialCount} materials
        </p>
      </div>

      <div className="left-panel__scroll">
        <Accordion title="ASSETS" meta="Scene">
          <div className="inspector-action-row">
            <button type="button" className="tool-button tool-button--secondary" onClick={() => modelInputRef.current?.click()}>
              <span className="tool-button__glyph">GLB</span>
              <span className="tool-button__label">Load GLB</span>
            </button>
            <button type="button" className="tool-button tool-button--secondary" onClick={() => configInputRef.current?.click()}>
              <span className="tool-button__glyph">CFG</span>
              <span className="tool-button__label">Load Config</span>
            </button>
            <button type="button" className="tool-button tool-button--secondary left-full-button" onClick={requestSceneReset}>
              <span className="tool-button__glyph">RST</span>
              <span className="tool-button__label">Reset Scene</span>
            </button>
          </div>
        </Accordion>

        <Accordion title="STRUCTURE" meta="Outliner" className="left-accordion--structure">
          <div className="structure-toolbar">
            <button type="button" className="tool-button tool-button--secondary left-full-button" onClick={addExtraLight}>
              <span className="tool-button__glyph">LGT</span>
              <span className="tool-button__label">Add Light</span>
            </button>
          </div>
          <div className="tree-view tree-view--accordion">
            {rootNodeId ? <TreeNode nodeId={rootNodeId} /> : <p className="panel-empty">Scene is empty.</p>}
            {extraLights.length ? (
              <div className="tree-subgroup">
                <div className="tree-subgroup__title">Extra Lights</div>
                {extraLights.map((light) => (light ? <TreeNode key={light.id} nodeId={light.id} depth={0} /> : null))}
              </div>
            ) : null}
          </div>
        </Accordion>

        <Accordion title="SCENE" meta="Global">
          <div className="left-controls">
            <div className="scene-tabs" role="tablist" aria-label="Scene controls">
              <button
                type="button"
                role="tab"
                aria-selected={sceneTab === 'reflections'}
                className={sceneTab === 'reflections' ? 'is-active' : ''}
                onClick={() => setSceneTab('reflections')}
              >
                REFLECTIONS
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sceneTab === 'background'}
                className={sceneTab === 'background' ? 'is-active' : ''}
                onClick={() => setSceneTab('background')}
              >
                BACKGROUND
              </button>
            </div>

            {sceneTab === 'reflections' ? (
              <div className="left-controls__group">
                <span className="left-controls__label">Reflections</span>
                <div className="left-controls__value">{assets.reflections ?? 'No HDRI loaded'}</div>
                <div className="inspector-action-row">
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => reflectionsInputRef.current?.click()}>
                    <span className="tool-button__glyph">HDR</span>
                    <span className="tool-button__label">{assets.reflections ? 'Replace' : 'Load HDRI'}</span>
                  </button>
                  <button type="button" className="tool-button tool-button--secondary" onClick={clearReflections}>
                    <span className="tool-button__glyph">CLR</span>
                    <span className="tool-button__label">Clear</span>
                  </button>
                </div>
                <label className="left-slider">
                  <span>Rotation</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={environment.rotation}
                    onChange={(event) => setEnvironment({ rotation: Number(event.currentTarget.value) })}
                    onPointerDown={() => setEnvironment({ previewReflections: true })}
                    onPointerUp={() => setEnvironment({ previewReflections: false })}
                    onPointerCancel={() => setEnvironment({ previewReflections: false })}
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
                    onChange={(event) => setEnvironment({ intensity: Number(event.currentTarget.value) })}
                  />
                  <strong>{environment.intensity.toFixed(2)}</strong>
                </label>
              </div>
            ) : null}

            {sceneTab === 'background' ? (
              <div className="left-controls__group">
                <span className="left-controls__label">Background</span>
                <label className="left-select">
                  <span>Mode</span>
                  <select
                    value={environment.background}
                    onChange={(event) =>
                      setEnvironment({
                        background: event.currentTarget.value as typeof environment.background,
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
                  <label className="left-color-field">
                    <span>Background Color</span>
                    <input
                      type="color"
                      value={environment.backgroundColor}
                      onChange={(event) => setEnvironment({ backgroundColor: event.currentTarget.value })}
                    />
                  </label>
                ) : null}
                <div className="left-controls__value">{assets.background ?? 'No background loaded'}</div>
                <div className="inspector-action-row">
                  <button type="button" className="tool-button tool-button--secondary" onClick={() => backgroundInputRef.current?.click()}>
                    <span className="tool-button__glyph">360</span>
                    <span className="tool-button__label">{assets.background ? 'Replace' : 'Load Background'}</span>
                  </button>
                  <button type="button" className="tool-button tool-button--secondary" onClick={clearBackground}>
                    <span className="tool-button__glyph">CLR</span>
                    <span className="tool-button__label">Clear</span>
                  </button>
                </div>
                <label className="left-slider">
                  <span>Background Rotation</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={environment.backgroundRotation}
                    onChange={(event) => setEnvironment({ backgroundRotation: Number(event.currentTarget.value) })}
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
                    onChange={(event) => setEnvironment({ backgroundIntensity: Number(event.currentTarget.value) })}
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
                    onChange={(event) => setEnvironment({ backgroundBlur: Number(event.currentTarget.value) })}
                  />
                  <strong>{environment.backgroundBlur.toFixed(2)}</strong>
                </label>
                <label className="left-toggle">
                  <input
                    type="checkbox"
                    checked={environment.backgroundVisible}
                    onChange={(event) => setEnvironment({ backgroundVisible: event.currentTarget.checked })}
                  />
                  <span>Visible</span>
                </label>
              </div>
            ) : null}
          </div>
        </Accordion>

        <Accordion title="CAMERA" meta="Lens">
          <div className="left-controls">
            <label className="left-slider">
              <span>Exposure</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={viewer.exposure}
                onChange={(event) => setViewer({ exposure: Number(event.currentTarget.value) })}
              />
              <strong>{viewer.exposure.toFixed(2)}</strong>
            </label>
            <div className="lens-preset-row">
              {[8, 12, 17, 35, 50, 85].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={Math.round(viewer.focalLength) === preset ? 'is-active' : ''}
                  onClick={() => setViewer({ focalLength: preset })}
                >
                  {preset}
                </button>
              ))}
            </div>
            <label className="left-slider">
              <span>Focal Length</span>
              <input
                type="range"
                min="8"
                max="200"
                step="1"
                value={viewer.focalLength}
                onChange={(event) => setViewer({ focalLength: Number(event.currentTarget.value) })}
              />
              <strong>{viewer.focalLength.toFixed(0)} mm</strong>
            </label>
            <details className="left-subsection" open={cameraTabOpen} onToggle={(event) => setCameraTabOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary className="left-subsection__summary">Depth of Field</summary>
              <div className="left-subsection__content">
                <div className="left-controls__group">
                  <label className="left-toggle">
                    <input
                      type="checkbox"
                      checked={viewer.dofEnabled}
                      onChange={(event) => setViewer({ dofEnabled: event.currentTarget.checked })}
                    />
                    <span>Enable DoF</span>
                  </label>
                  <label className="left-toggle">
                    <input
                      type="checkbox"
                      checked={viewer.dofVisualizerEnabled}
                      onChange={(event) => setViewer({ dofVisualizerEnabled: event.currentTarget.checked })}
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
                      onChange={(event) => setViewer({ dofFocusDistance: Number(event.currentTarget.value) })}
                    />
                    <strong>{viewer.dofFocusDistance.toFixed(1)} m</strong>
                  </label>
                  <div className="lens-preset-row lens-preset-row--aperture">
                    {[1.0, 1.2, 1.4, 1.8, 2.0, 2.8].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={Math.abs(viewer.dofAperture - preset) < 0.05 ? 'is-active' : ''}
                        onClick={() => setViewer({ dofAperture: preset })}
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
                      onChange={(event) => setViewer({ dofManualBlur: Number(event.currentTarget.value) })}
                    />
                    <strong>{viewer.dofManualBlur.toFixed(2)}</strong>
                  </label>
                </div>
              </div>
            </details>
          </div>
        </Accordion>

        <Accordion title="EFFECTS" meta="Post">
          <div className="left-controls">
            <div className="left-controls__group">
              <span className="left-controls__label">Bloom</span>
              <label className="left-toggle">
                <input
                  type="checkbox"
                  checked={bloomEnabled}
                  onChange={(event) => setBloomEnabled(event.currentTarget.checked)}
                />
                <span>Enabled</span>
              </label>
              <label className="left-slider">
                <span>Threshold</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={bloomThreshold}
                  onChange={(event) => setBloomThreshold(Number(event.currentTarget.value))}
                />
                <strong>{bloomThreshold.toFixed(2)}</strong>
              </label>
              <label className="left-slider">
                <span>Intensity</span>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.01"
                  value={bloomIntensity}
                  onChange={(event) => setBloomIntensity(Number(event.currentTarget.value))}
                />
                <strong>{bloomIntensity.toFixed(2)}</strong>
              </label>
              <label className="left-slider">
                <span>Luma Smooth</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={bloomSmoothing}
                  onChange={(event) => setBloomSmoothing(Number(event.currentTarget.value))}
                />
                <strong>{bloomSmoothing.toFixed(2)}</strong>
              </label>
            </div>

          </div>
        </Accordion>

      </div>

      <div className="import-export-footer">
        <div className="panel-header">
          <div className="panel-header__row">
            <div className="panel-header__stack">
              <p className="panel-eyebrow">EXPORT / CONFIG</p>
              <p className="panel-heading">JSON</p>
            </div>
          </div>
        </div>
        <div className="left-panel__footer-actions">
          <div className="outliner-actions outliner-actions--secondary">
            <button
              type="button"
              className="tool-button tool-button--secondary"
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
              <span className="tool-button__glyph">CPY</span>
              <span className="tool-button__label">Copy JSON</span>
            </button>
            <button
              type="button"
              className="tool-button tool-button--secondary"
              onClick={() => {
                try {
                  downloadSceneConfig()
                  setStatus('Scene config exported.')
                } catch (error) {
                  console.error(error)
                  setStatus('Failed to export config.')
                }
              }}
            >
              <span className="tool-button__glyph">JSON</span>
              <span className="tool-button__label">Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      <div className="panel-footer">{status}</div>

      <input
        ref={modelInputRef}
        hidden
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestModelLoad({ url: createObjectUrl(file), label: file.name, revokeAfter: true })
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={reflectionsInputRef}
        hidden
        type="file"
        accept=".hdr,.png,.jpg,.jpeg,.webp,image/*,image/vnd.radiance"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          const isHdr = /\.hdr$/i.test(file.name)
          const url = createObjectUrl(file)
          if (isHdr) {
            setEnvironment({ customHdriUrl: url })
          }
          requestEnvironmentLoad({
            url,
            label: file.name,
            kind: isHdr ? 'hdri' : 'image',
            revokeAfter: false,
          })
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={backgroundInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestEnvironmentLoad({ url: createObjectUrl(file), label: file.name, kind: 'panorama', revokeAfter: true })
          event.currentTarget.value = ''
        }}
      />
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
    </aside>
  )
}
