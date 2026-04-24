import { useRef, useState } from 'react'
import { useEditorStore, type SceneGraphNode } from '../store/editorStore'
import { readSceneConfigFile } from '../features/config/readSceneConfigFile'
import { copySceneConfigToClipboard, downloadSceneConfig } from '../features/config/buildSceneConfig'
import { useViewportPresentation } from '../features/viewport/ViewportPresentationContext'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function getNodeIcon(type: SceneGraphNode['type']) {
  const baseProps = {
    className: `tree-node__icon is-${type}`,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
  }

  switch (type) {
    case 'group':
      return (
        <svg {...baseProps}>
          <path
            d="M3.5 4.5h4l1 1h4v6h-9z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'mesh':
      return (
        <svg {...baseProps}>
          <path
            d="M8 2.5 12.5 5v6L8 13.5 3.5 11V5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M8 2.5v11M3.5 5 8 7.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'light':
      return (
        <svg {...baseProps}>
          <path
            d="M8 3.25a3 3 0 0 1 1.88 5.34c-.51.42-.8 1.01-.8 1.66H6.92c0-.65-.29-1.24-.8-1.66A3 3 0 0 1 8 3.25Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M6.5 11.25h3M6.9 13h2.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'material':
      return (
        <svg {...baseProps}>
          <circle cx="8" cy="8" r="3.25" fill="currentColor" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...baseProps}>
          <path
            d="M3.5 5.25h5.5l3.5-1.75v9L9 10.75H3.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )
    default:
      return (
        <svg {...baseProps}>
          <circle cx="8" cy="8" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
  }
}

function getActionIcon(kind: 'eye' | 'eyeOff' | 'trash') {
  const baseProps = {
    className: `tree-action__icon is-${kind}`,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
  }

  switch (kind) {
    case 'eyeOff':
      return (
        <svg {...baseProps}>
          <path
            d="M2.25 8s1.9-3 5.75-3 5.75 3 5.75 3-1.9 3-5.75 3-5.75-3-5.75-3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 13 13 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...baseProps}>
          <path d="M5.5 4.25h5M6.25 2.75h3.5M4.5 4.25l.5 8h6l.5-8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.75 6.25v4.25M9.25 6.25v4.25" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg {...baseProps}>
          <path
            d="M2.25 8s1.9-3 5.75-3 5.75 3 5.75 3-1.9 3-5.75 3-5.75-3-5.75-3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
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

function isIdentityWrapper(nodeId: string, sceneGraph: Record<string, SceneGraphNode>, objects: ReturnType<typeof useEditorStore.getState>['objects']) {
  const node = sceneGraph[nodeId]
  const objectState = objects[nodeId]

  if (!node || node.type !== 'group' || !objectState) {
    return false
  }

  const visibleChildren = node.children.filter((childId) => sceneGraph[childId]?.type !== 'material')
  if (visibleChildren.length !== 1) {
    return false
  }

  return (
    objectState.position.every((value) => Math.abs(value) < 0.0001) &&
    objectState.rotation.every((value) => Math.abs(value) < 0.0001) &&
    objectState.scale.every((value) => Math.abs(value - 1) < 0.0001)
  )
}

function getOutlinerEntryIds({
  nodeId,
  sceneGraph,
  objects,
  promoteChildren = false,
}: {
  nodeId: string
  sceneGraph: Record<string, SceneGraphNode>
  objects: ReturnType<typeof useEditorStore.getState>['objects']
  promoteChildren?: boolean
}): string[] {
  const node = sceneGraph[nodeId]
  if (!node) {
    return []
  }

  const visibleChildren = node.children.filter((childId) => sceneGraph[childId]?.type !== 'material')

  if (promoteChildren && (node.type === 'group' || node.type === 'scene')) {
    return visibleChildren.flatMap((childId) =>
      getOutlinerEntryIds({ nodeId: childId, sceneGraph, objects }),
    )
  }

  if (isIdentityWrapper(nodeId, sceneGraph, objects)) {
    return visibleChildren.flatMap((childId) =>
      getOutlinerEntryIds({ nodeId: childId, sceneGraph, objects }),
    )
  }

  return [nodeId]
}

function TreeNode({ nodeId, depth = 0 }: { nodeId: string; depth?: number }) {
  const node = useEditorStore((state) => state.sceneGraph[nodeId])
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const toggleObjectVisibility = useEditorStore((state) => state.toggleObjectVisibility)
  const removeSceneNode = useEditorStore((state) => state.removeSceneNode)
  const toggleMaterialSystemState = useEditorStore((state) => state.toggleMaterialSystemState)
  const resetMaterial = useEditorStore((state) => state.resetMaterial)

  if (!node) return null

  const visibleChildren = node.children.filter((childId) => sceneGraph[childId]?.type !== 'material')
  const isMesh = node.type === 'mesh'
  const isMaterial = node.type === 'material'
  const meshVisible = isMesh ? (objects[nodeId]?.visible ?? node.visible ?? true) : true
  const materialUsesSystem = isMaterial ? Boolean(materials[nodeId]?.useSystemMaterial) : false

  if (isIdentityWrapper(nodeId, sceneGraph, objects)) {
    return (
      <>
        {visibleChildren.map((childId) => (
          <TreeNode key={childId} nodeId={childId} depth={depth} />
        ))}
      </>
    )
  }

  return (
    <>
      <button
        className={`tree-node ${selectedObjectId === nodeId ? 'is-selected' : ''} ${!meshVisible ? 'is-dimmed' : ''} ${materialUsesSystem ? 'is-dimmed' : ''}`}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        onClick={() => setSelectedObjectId(nodeId)}
        type="button"
      >
        {getNodeIcon(node.type)}
        <span className="tree-node__label">{node.label}</span>
        {(isMesh || isMaterial) ? (
          <span className="tree-node__actions">
            <button
              type="button"
              className="tree-action"
              aria-label={isMesh ? (meshVisible ? 'Hide mesh' : 'Show mesh') : (materialUsesSystem ? 'Restore material' : 'Use system material')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (isMesh) {
                  toggleObjectVisibility(nodeId)
                } else if (isMaterial) {
                  toggleMaterialSystemState(nodeId)
                }
              }}
            >
              {getActionIcon(isMesh ? (meshVisible ? 'eye' : 'eyeOff') : (materialUsesSystem ? 'eyeOff' : 'eye'))}
            </button>
            <button
              type="button"
              className="tree-action"
              aria-label={isMesh ? 'Delete mesh' : 'Reset material'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (isMesh) {
                  removeSceneNode(nodeId)
                } else if (isMaterial) {
                  resetMaterial(nodeId)
                }
              }}
            >
              {getActionIcon('trash')}
            </button>
          </span>
        ) : null}
      </button>
      {node.children.map((childId) => (
        <TreeNode key={childId} nodeId={childId} depth={depth + 1} />
      ))}
    </>
  )
}

export function SceneManager() {
  const [sceneTab, setSceneTab] = useState<'reflections' | 'background'>('reflections')
  const [cameraTabOpen, setCameraTabOpen] = useState(false)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const extraLights = useEditorStore((state) => state.extraLights)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const objects = useEditorStore((state) => state.objects)
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
  const outlinerRootIds = rootNodeId
    ? getOutlinerEntryIds({ nodeId: rootNodeId, sceneGraph, objects, promoteChildren: true })
    : []

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

      <div className="left-panel__body">
        <section className="outliner-panel">
          <div className="outliner-panel__header">
            <span>OUTLINER</span>
            <span className="left-accordion__meta">Scene Tree</span>
          </div>
          <div className="outliner-panel__content">
            <div className="structure-toolbar">
              <button type="button" className="tool-button tool-button--secondary left-full-button" onClick={addExtraLight}>
                <span className="tool-button__glyph">LGT</span>
                <span className="tool-button__label">Add Light</span>
              </button>
            </div>
            <div className="tree-view tree-view--accordion">
              {outlinerRootIds.length ? (
                outlinerRootIds.map((nodeId: string) => <TreeNode key={nodeId} nodeId={nodeId} />)
              ) : (
                <p className="panel-empty">Scene is empty.</p>
              )}
              {extraLights.length ? (
                <div className="tree-subgroup">
                  <div className="tree-subgroup__title">Extra Lights</div>
                  {extraLights.map((light) => (light ? <TreeNode key={light.id} nodeId={light.id} depth={0} /> : null))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

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
                <div className="scene-inline-controls">
                  <label className="left-select left-select--inline">
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
                  <label className="left-color-field left-color-field--swatch" aria-label="Background color">
                    <span className="visually-hidden">Background Color</span>
                    <input
                      aria-label="Background color"
                      type="color"
                      value={environment.backgroundColor}
                      onChange={(event) => setEnvironment({ backgroundColor: event.currentTarget.value })}
                    />
                  </label>
                ) : null}
                </div>
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

        <Accordion title="EFFECTS" meta="Post" defaultOpen={false}>
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
