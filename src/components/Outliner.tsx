import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '../store/editorStore'

type ViewMode = 'layers' | 'meshes' | 'materials' | 'lights' | 'effects'

type OutlinerEntry =
  | {
      id: string
      rootId: string
      label: string
      visible: boolean
      removable: boolean
      kind: 'mesh'
      depth: number
      selectionId: string
      materialIds: string[]
    }
  | {
      id: string
      rootId: string
      label: string
      visible: boolean
      removable: boolean
      kind: 'material'
      depth: number
      selectionId: string
      materialId: string
      parentMeshId?: string | null
    }
  | {
      id: string
      label: string
      visible: boolean
      removable: boolean
      kind: 'light' | 'environment' | 'ambient'
      depth: number
      selectionId: string
    }
  | {
      id: string
      label: string
      visible: boolean
      removable: boolean
      kind: 'effect'
      depth: number
      selectionId: string
    }

type RootViewMode = Extract<ViewMode, 'layers' | 'meshes' | 'materials'>

function LayersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <path d="M8 2 2.2 5 8 8l5.8-3L8 2Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.2 7.6 8 10l4.8-2.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.2 10 8 12l3.8-2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <path d="M8 2 3 4.8v6.4L8 14l5-2.8V4.8L8 2Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4.8 8 7.7l5-2.9M8 7.7V14" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function SphereIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.8 6.2h8.4M3.8 9.8h8.4M8 3c1.7 1.4 2.6 3.1 2.6 5S9.7 11.6 8 13M8 3C6.3 4.4 5.4 6.1 5.4 8S6.3 11.6 8 13" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function LightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <path d="M8 2.5a4 4 0 0 0-2.4 7.2c.5.4.8 1 .9 1.6h3c.1-.6.4-1.2.9-1.6A4 4 0 0 0 8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 12.2h2.8M6.9 13.8h2.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function FxIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <path
        d="M8 1.8 9.5 5l3.5.5-2.6 2.5.6 3.5L8 9.8l-3 1.7.6-3.5L3 5.5 6.5 5 8 1.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M11.8 2.5v1.8M12.7 3.4h-1.8M2.5 10.6v1.8M3.4 11.5H1.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="outliner-filter__icon" aria-hidden="true">
      <path d="M4 2.5h5l3 3V13a1 1 0 0 1-1 1H4.9A.9.9 0 0 1 4 13.1V2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 2.5V6h3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 16 16" className="tree-action__icon" aria-hidden="true">
      <path d="M2.4 2.4 13.6 13.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.2 6.4A2.4 2.4 0 0 1 9.7 9.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M1.8 8s2-3.8 6.2-3.8c1.3 0 2.4.4 3.4 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14.2 8s-2 3.8-6.2 3.8c-1.3 0-2.5-.4-3.5-1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="tree-action__icon" aria-hidden="true">
      <path d="M1.8 8s2-3.8 6.2-3.8 6.2 3.8 6.2 3.8-2 3.8-6.2 3.8S1.8 8 1.8 8Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="tree-action__icon" aria-hidden="true">
      <path d="M3.5 4.5h9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.2 2.8h3.6l.6 1.7H5.6l.6-1.7Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5 4.5v7.2c0 .4.3.8.8.8h4.4c.5 0 .8-.4.8-.8V4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.7 6.4v4.1M9.3 6.4v4.1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function ModeButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`outliner-filter${active ? ' is-active' : ''}`} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

function CollapseIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`outliner-collapse__icon${isCollapsed ? ' is-collapsed' : ''}`} aria-hidden="true">
      <path d="M2.5 4.25 6 7.75l3.5-3.5" />
    </svg>
  )
}

function RowIcon({ kind }: { kind: OutlinerEntry['kind'] | 'root' }) {
  if (kind === 'root') {
    return <FileIcon />
  }
  if (kind === 'material') {
    return <SphereIcon />
  }
  if (kind === 'effect') {
    return <FxIcon />
  }
  if (kind === 'light' || kind === 'ambient') {
    return <LightIcon />
  }
  if (kind === 'environment') {
    return <SphereIcon />
  }
  return <CubeIcon />
}

export function Outliner({
  viewMode,
  onViewModeChange,
}: {
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
}) {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const loadedModels = useEditorStore((state) => state.loadedModels)
  const loadedFileName = useEditorStore((state) => state.loadedFileName)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const environment = useEditorStore((state) => state.environment)
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const hud = useEditorStore((state) => state.hud)
  const backgroundAudio = useEditorStore((state) => state.backgroundAudio)
  const godRaysBoxes = useEditorStore((state) => state.godRaysBoxes)
  const stencilVolumes = useEditorStore((state) => state.stencilVolumes)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const toggleVisibility = useEditorStore((state) => state.toggleVisibility)
  const deleteObject = useEditorStore((state) => state.deleteObject)
  const resetMaterialToDefault = useEditorStore((state) => state.resetMaterialToDefault)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const removeEnvironment = useEditorStore((state) => state.removeEnvironment)
  const setLights = useEditorStore((state) => state.setLights)
  const setHud = useEditorStore((state) => state.setHud)
  const setBackgroundAudio = useEditorStore((state) => state.setBackgroundAudio)
  const removeAmbientLight = useEditorStore((state) => state.removeAmbientLight)
  const removeExtraLight = useEditorStore((state) => state.removeExtraLight)
  const removeGodRaysBox = useEditorStore((state) => state.removeGodRaysBox)

  const [search, setSearch] = useState('')
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('layers')
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [collapsedRootsByMode, setCollapsedRootsByMode] = useState<Record<RootViewMode, Record<string, boolean>>>({
    layers: {},
    meshes: {},
    materials: {},
  })

  const resolvedViewMode = viewMode ?? internalViewMode
  const previousViewModeRef = useRef<ViewMode>(resolvedViewMode)

  const setResolvedViewMode = (mode: ViewMode) => {
    if (viewMode == null) {
      setInternalViewMode(mode)
    }
    onViewModeChange?.(mode)
  }

  const rootModels = useMemo(
    () =>
      loadedModels.filter((model) => sceneGraph[model.rootNodeId]).length
        ? loadedModels.filter((model) => sceneGraph[model.rootNodeId])
        : rootNodeId && loadedFileName && sceneGraph[rootNodeId]
          ? [{ rootNodeId, label: loadedFileName }]
          : [],
    [loadedFileName, loadedModels, rootNodeId, sceneGraph],
  )

  const meshIdsByRoot = useMemo(() => {
    const result: Record<string, string[]> = {}

    const collectMeshIds = (nodeId: string, ids: string[]) => {
      const node = sceneGraph[nodeId]
      if (!node || node.type === 'material' || node.type === 'camera' || node.type === 'light') {
        return
      }

      if (node.type === 'mesh') {
        ids.push(node.id)
      }

      node.children.forEach((childId) => {
        if (sceneGraph[childId]?.type !== 'material') {
          collectMeshIds(childId, ids)
        }
      })
    }

    rootModels.forEach((model) => {
      const ids: string[] = []
      collectMeshIds(model.rootNodeId, ids)
      result[model.rootNodeId] = ids
    })

    return result
  }, [rootModels, sceneGraph])

  const lightEntries = useMemo<OutlinerEntry[]>(() => {
    const entries: OutlinerEntry[] = []

    if (environment.isEnvironmentEnabled || environment.customHdriUrl || environment.source) {
      entries.push({
        id: 'environment:system',
        label: environment.customHdriUrl || environment.source ? `Environment (${environment.kind})` : 'Environment (Preset: City)',
        visible: environment.isEnvironmentEnabled,
        removable: true,
        kind: 'environment',
        depth: 0,
        selectionId: 'environment:system',
      })
    }

    if (lights.ambient.exists) {
      entries.push({
        id: 'light:ambient:system',
        label: 'Ambient Light',
        visible: lights.ambient.visible,
        removable: true,
        kind: 'ambient',
        depth: 0,
        selectionId: 'light:ambient:system',
      })
    }

    extraLights.forEach((light) => {
      entries.push({
        id: light.id,
        label: light.label,
        visible: light.visible,
        removable: true,
        kind: 'light',
        depth: 0,
        selectionId: light.id,
      })
    })

    return entries
  }, [
    environment.customHdriUrl,
    environment.isEnvironmentEnabled,
    environment.kind,
    environment.source,
    extraLights,
    lights.ambient.exists,
    lights.ambient.visible,
  ])

  const effectEntries = useMemo<OutlinerEntry[]>(
    () => {
      const entries: OutlinerEntry[] = []

      if (hud.postEffectsEnabled) {
        entries.push({
          id: 'effect:bloom',
          label: 'Bloom',
          visible: hud.postEffectsVisible,
          removable: true,
          kind: 'effect',
          depth: 0,
          selectionId: 'effect:bloom',
        })
      }

      if (backgroundAudio.isAdded) {
        entries.push({
          id: 'effect:scene-audio',
          label: 'Scene Audio',
          visible: backgroundAudio.previewEnabled,
          removable: true,
          kind: 'effect',
          depth: 0,
          selectionId: 'effect:scene-audio',
        })
      }

      godRaysBoxes.forEach((effect, index) => {
        entries.push({
          id: effect.id,
          label: sceneGraph[effect.id]?.label ?? (index === 0 ? 'God Rays' : `God Rays ${index + 1}`),
          visible: objects[effect.id]?.visible ?? sceneGraph[effect.id]?.visible ?? true,
          removable: true,
          kind: 'effect',
          depth: 0,
          selectionId: effect.id,
        })
      })

      stencilVolumes.forEach((effect, index) => {
        entries.push({
          id: effect.id,
          label: sceneGraph[effect.id]?.label ?? (index === 0 ? 'Stencil Volume' : `Stencil Volume ${index + 1}`),
          visible: objects[effect.id]?.visible ?? sceneGraph[effect.id]?.visible ?? true,
          removable: true,
          kind: 'effect',
          depth: 0,
          selectionId: effect.id,
        })
      })

      return entries
    },
    [
      backgroundAudio.isAdded,
      backgroundAudio.previewEnabled,
      godRaysBoxes,
      stencilVolumes,
      hud.postEffectsEnabled,
      hud.postEffectsVisible,
      objects,
      sceneGraph,
    ],
  )

  const rootSections = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (resolvedViewMode === 'lights' || resolvedViewMode === 'effects') {
      return []
    }

    return rootModels
      .map((model) => {
        const rootId = model.rootNodeId
        const meshIds = meshIdsByRoot[rootId] ?? []
        const entries: OutlinerEntry[] = []

        if (resolvedViewMode === 'layers' || resolvedViewMode === 'meshes') {
          meshIds.forEach((meshId) => {
            const node = sceneGraph[meshId]
            if (!node) {
              return
            }

            const materialIds = node.children.filter((childId) => sceneGraph[childId]?.type === 'material')
            entries.push({
              id: node.id,
              rootId,
              label: node.label || 'Unnamed Mesh',
              visible: objects[node.id]?.visible ?? node.visible ?? true,
              removable: true,
              kind: 'mesh',
              depth: 1,
              selectionId: node.id,
              materialIds,
            })

            const shouldShowMaterials = resolvedViewMode === 'layers' || (resolvedViewMode === 'meshes' && selectedObjectId === node.id)
            if (!shouldShowMaterials) {
              return
            }

            materialIds.forEach((materialId) => {
              const material = materials[materialId]
              if (!material) {
                return
              }

              entries.push({
                id: `${node.id}:${materialId}`,
                rootId,
                label: material.name || 'Unnamed Material',
                visible: true,
                removable: false,
                kind: 'material',
                depth: 2,
                selectionId: node.id,
                materialId,
                parentMeshId: node.id,
              })
            })
          })
        } else if (resolvedViewMode === 'materials') {
          const seen = new Set<string>()
          meshIds.forEach((meshId) => {
            const node = sceneGraph[meshId]
            if (!node) {
              return
            }

            node.children.forEach((childId) => {
              const material = materials[childId]
              if (!material || seen.has(childId)) {
                return
              }

              seen.add(childId)
              entries.push({
                id: childId,
                rootId,
                label: material.name || 'Unnamed Material',
                visible: true,
                removable: false,
                kind: 'material',
                depth: 1,
                selectionId: material.meshIds[0] ?? childId,
                materialId: childId,
                parentMeshId: material.meshIds[0] ?? null,
              })
            })
          })
        }

        const rootMatches = model.label.toLowerCase().includes(query)
        const filteredEntries = query
          ? entries.filter((entry) => entry.label.toLowerCase().includes(query))
          : entries
        const shouldRender = !query || rootMatches || filteredEntries.length > 0

        if (!shouldRender) {
          return null
        }

        return {
          model,
          rootId,
          rootVisible: objects[rootId]?.visible ?? sceneGraph[rootId]?.visible ?? true,
          isRootSelected: selectedObjectId === rootId,
          entries,
          filteredEntries,
        }
      })
      .filter((section): section is NonNullable<typeof section> => Boolean(section))
  }, [materials, meshIdsByRoot, objects, resolvedViewMode, rootModels, sceneGraph, search, selectedObjectId])

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = resolvedViewMode === 'lights' ? lightEntries : resolvedViewMode === 'effects' ? effectEntries : []

    if (!query) {
      return source
    }

    return source.filter((entry) => entry.label.toLowerCase().includes(query))
  }, [effectEntries, lightEntries, resolvedViewMode, search])

  useEffect(() => {
    if (resolvedViewMode !== 'lights' && resolvedViewMode !== 'effects') {
      previousViewModeRef.current = resolvedViewMode
      return
    }

    const firstEntry = visibleEntries[0]
    if (!firstEntry) {
      previousViewModeRef.current = resolvedViewMode
      return
    }

    const hasEnteredSpecialMode = previousViewModeRef.current !== resolvedViewMode
    const shouldAutoSelect = hasEnteredSpecialMode

    if (shouldAutoSelect) {
      setSelectedObjectId(firstEntry.selectionId)
    }

    previousViewModeRef.current = resolvedViewMode
  }, [resolvedViewMode, selectedObjectId, setSelectedObjectId, visibleEntries])

  const handleToggleRootCollapsed = (rootId: string) => {
    if (resolvedViewMode !== 'layers' && resolvedViewMode !== 'meshes' && resolvedViewMode !== 'materials') {
      return
    }

    setCollapsedRootsByMode((current) => ({
      ...current,
      [resolvedViewMode]: {
        ...current[resolvedViewMode],
        [rootId]: !current[resolvedViewMode][rootId],
      },
    }))
  }

  const handleToggleVisibility = (entry: OutlinerEntry) => {
    if (entry.kind === 'effect') {
      if (entry.selectionId === 'effect:scene-audio') {
        setBackgroundAudio({ previewEnabled: !backgroundAudio.previewEnabled && Boolean(backgroundAudio.assetUrl) })
        return
      }

      if (entry.selectionId === 'effect:bloom') {
        setHud({ postEffectsVisible: !hud.postEffectsVisible })
        return
      }

      toggleVisibility(entry.selectionId)
      return
    }
    if (entry.kind === 'environment') {
      setEnvironment({ isEnvironmentEnabled: !environment.isEnvironmentEnabled })
      return
    }
    if (entry.kind === 'ambient') {
      setLights({ ambient: { visible: !lights.ambient.visible } })
      return
    }
    if (entry.kind === 'light') {
      toggleVisibility(entry.selectionId)
      return
    }
    if (entry.kind === 'material') {
      toggleVisibility(entry.materialId)
      return
    }
    toggleVisibility(entry.selectionId)
  }

  const handleDeleteObject = (entry: OutlinerEntry) => {
    if (!entry.removable) {
      return
    }
    if (entry.kind === 'effect') {
      if (entry.selectionId === 'effect:scene-audio') {
        if (selectedObjectId === entry.selectionId) {
          setSelectedObjectId(null)
        }
        setBackgroundAudio({
          isAdded: false,
          enabled: false,
          previewEnabled: true,
          previewPlaying: true,
          previewCurrentTime: 0,
          previewDuration: 0,
          assetLabel: null,
          assetUrl: null,
          fileSize: null,
        })
        return
      }

      if (entry.selectionId === 'effect:bloom') {
        if (selectedObjectId === entry.selectionId) {
          setSelectedObjectId(null)
        }
        setHud({ postEffectsEnabled: false, postEffectsVisible: false })
        return
      }

      removeGodRaysBox(entry.selectionId)
      return
    }
    if (entry.kind === 'environment') {
      removeEnvironment()
      return
    }
    if (entry.kind === 'ambient') {
      removeAmbientLight()
      return
    }
    if (entry.kind === 'light') {
      removeExtraLight(entry.id)
      return
    }
    if (entry.kind === 'material') {
      resetMaterialToDefault(entry.materialId)
      return
    }
    deleteObject(entry.selectionId)
  }

  const handleDeleteRoot = (targetRootId: string) => {
    if (!targetRootId) {
      return
    }

    deleteObject(targetRootId)
  }

  return (
    <section className={`outliner-panel${isPanelCollapsed ? ' is-collapsed' : ''}`}>
      <div className="outliner-header">
        <div className="outliner-panel__header">
          <span>Outliner</span>
          <div className="outliner-panel__header-actions">
            <span className="left-accordion__meta">Scene Tree</span>
            <button
              type="button"
              className="outliner-collapse"
              aria-label={isPanelCollapsed ? 'Expand outliner' : 'Collapse outliner'}
              title={isPanelCollapsed ? 'Expand outliner' : 'Collapse outliner'}
              onClick={() => setIsPanelCollapsed((current) => !current)}
            >
              <CollapseIcon isCollapsed={isPanelCollapsed} />
            </button>
          </div>
        </div>
        {!isPanelCollapsed ? (
          <div className="search-container">
            <div className="outliner-search">
              <input
                type="search"
                placeholder="Search objects or materials"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              {search ? (
                <button type="button" className="search-clear" onClick={() => setSearch('')}>
                  <span>x</span>
                </button>
              ) : null}
            </div>
            <div className="outliner-filters" aria-label="Outliner display mode">
              <ModeButton active={resolvedViewMode === 'layers'} title="Layers" onClick={() => setResolvedViewMode('layers')}>
                <LayersIcon />
              </ModeButton>
              <ModeButton active={resolvedViewMode === 'meshes'} title="Geometry" onClick={() => setResolvedViewMode('meshes')}>
                <CubeIcon />
              </ModeButton>
              <ModeButton active={resolvedViewMode === 'materials'} title="Materials" onClick={() => setResolvedViewMode('materials')}>
                <SphereIcon />
              </ModeButton>
              <ModeButton active={resolvedViewMode === 'lights'} title="Lights" onClick={() => setResolvedViewMode('lights')}>
                <LightIcon />
              </ModeButton>
              <ModeButton active={resolvedViewMode === 'effects'} title="Effects" onClick={() => setResolvedViewMode('effects')}>
                <FxIcon />
              </ModeButton>
            </div>
          </div>
        ) : null}
      </div>
      {!isPanelCollapsed ? (
      <div className="tree-view outliner-list">
        {(resolvedViewMode === 'layers' || resolvedViewMode === 'meshes' || resolvedViewMode === 'materials')
          ? rootSections.map((section) => {
              const isCollapsed = !search.trim() && collapsedRootsByMode[resolvedViewMode][section.rootId]
              const entriesToRender = search.trim() ? section.filteredEntries : section.entries
              const hasChildren = section.entries.length > 0

              return (
                <div key={section.rootId}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`tree-node tree-node--root${section.isRootSelected ? ' is-selected' : ''}${!section.rootVisible ? ' is-dimmed' : ''}`}
                    style={{ paddingLeft: '10px' }}
                    onClick={() => {
                      setSelectedObjectId(section.rootId)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return
                      }
                      event.preventDefault()
                      setSelectedObjectId(section.rootId)
                    }}
                  >
                    <button
                      type="button"
                      className={`tree-node__chevron${!isCollapsed ? ' is-expanded' : ''}${!hasChildren ? ' tree-node__chevron--placeholder' : ''}`}
                      aria-label={isCollapsed ? 'Expand model contents' : 'Collapse model contents'}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (hasChildren) {
                          handleToggleRootCollapsed(section.rootId)
                        }
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <span>{'>'}</span>
                    </button>
                    <span className="tree-node__icon is-root">
                      <RowIcon kind="root" />
                    </span>
                    <span className="tree-node__label">{section.model.label}</span>
                    <span className="tree-node__actions">
                      <button
                        type="button"
                        className={`tree-action${!section.rootVisible ? ' is-active' : ''}`}
                        aria-label={!section.rootVisible ? 'Show model' : 'Hide model'}
                        title={!section.rootVisible ? 'Show model' : 'Hide model'}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleVisibility(section.rootId)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <EyeIcon hidden={!section.rootVisible} />
                      </button>
                      <button
                        type="button"
                        className="tree-action"
                        aria-label="Delete entire model"
                        title="Delete entire model"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteRoot(section.rootId)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <DeleteIcon />
                      </button>
                    </span>
                  </div>
                  {!isCollapsed
                    ? entriesToRender.map((entry) => {
                        const materialVisible =
                          entry.kind === 'material'
                            ? (materials[entry.materialId]?.meshIds ?? []).every((meshId) => objects[meshId]?.visible ?? true)
                            : true
                        const isSelected =
                          entry.kind === 'material'
                            ? selectedMaterialId === entry.materialId || selectedObjectId === entry.parentMeshId
                            : selectedObjectId === entry.selectionId
                        const isVisibilityHidden = entry.kind === 'material' ? !materialVisible : !entry.visible

                        return (
                          <div
                            key={entry.id}
                            role="button"
                            tabIndex={0}
                            className={`tree-node${isSelected ? ' is-selected' : ''}${isVisibilityHidden ? ' is-dimmed' : ''}`}
                            onClick={() => {
                              if (entry.kind === 'material') {
                                setSelectedMaterialId(entry.materialId)
                                return
                              }
                              setSelectedObjectId(entry.selectionId)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') {
                                return
                              }
                              event.preventDefault()
                              if (entry.kind === 'material') {
                                setSelectedMaterialId(entry.materialId)
                                return
                              }
                              setSelectedObjectId(entry.selectionId)
                            }}
                            style={{ paddingLeft: `${10 + entry.depth * 16}px` }}
                          >
                            <span className={`tree-node__icon is-${entry.kind === 'environment' ? 'material' : entry.kind}`}>
                              <RowIcon kind={entry.kind} />
                            </span>
                            <span className="tree-node__label">{entry.label}</span>
                            <span className="tree-node__actions">
                              <button
                                type="button"
                                className={`tree-action${isVisibilityHidden ? ' is-active' : ''}`}
                                aria-label={isVisibilityHidden ? 'Show item' : 'Hide item'}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleToggleVisibility(entry)
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <EyeIcon hidden={isVisibilityHidden} />
                              </button>
                              <button
                                type="button"
                                disabled={!entry.removable && entry.kind !== 'material'}
                                className="tree-action"
                                aria-label="Delete item"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleDeleteObject(entry)
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <DeleteIcon />
                              </button>
                            </span>
                          </div>
                        )
                      })
                    : null}
                </div>
              )
            })
          : visibleEntries.map((entry) => {
          const materialVisible =
            entry.kind === 'material'
              ? (materials[entry.materialId]?.meshIds ?? []).every((meshId) => objects[meshId]?.visible ?? true)
              : true
          const isSelected =
            entry.kind === 'effect'
              ? selectedObjectId === entry.selectionId
              : entry.kind === 'material'
              ? selectedMaterialId === entry.materialId || selectedObjectId === entry.parentMeshId
              : selectedObjectId === entry.selectionId

          const isVisibilityHidden =
            entry.kind === 'material' ? !materialVisible : !entry.visible

          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={`tree-node${isSelected ? ' is-selected' : ''}${isVisibilityHidden ? ' is-dimmed' : ''}`}
              onClick={() => {
                if (entry.kind === 'effect') {
                  setSelectedObjectId(entry.selectionId)
                  return
                }
                if (entry.kind === 'material') {
                  setSelectedMaterialId(entry.materialId)
                  return
                }
                setSelectedObjectId(entry.selectionId)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return
                }
                event.preventDefault()
                if (entry.kind === 'effect') {
                  setSelectedObjectId(entry.selectionId)
                  return
                }
                if (entry.kind === 'material') {
                  setSelectedMaterialId(entry.materialId)
                  return
                }
                setSelectedObjectId(entry.selectionId)
              }}
              style={{ paddingLeft: `${10 + entry.depth * 16}px` }}
            >
              <span className={`tree-node__icon is-${entry.kind === 'environment' ? 'material' : entry.kind}`}>
                <RowIcon kind={entry.kind} />
              </span>
              <span className="tree-node__label">{entry.label}</span>
              <span className="tree-node__actions">
                <button
                  type="button"
                  className={`tree-action${isVisibilityHidden ? ' is-active' : ''}`}
                  aria-label={isVisibilityHidden ? 'Show item' : 'Hide item'}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleToggleVisibility(entry)
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <EyeIcon hidden={isVisibilityHidden} />
                </button>
                <button
                  type="button"
                  disabled={!entry.removable && entry.kind !== 'material'}
                  className="tree-action"
                  aria-label="Delete item"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDeleteObject(entry)
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <DeleteIcon />
                </button>
              </span>
            </div>
          )
        })}
        {(resolvedViewMode === 'layers' || resolvedViewMode === 'meshes' || resolvedViewMode === 'materials')
          ? !rootSections.length
            ? <p className="panel-empty">No objects match the current mode.</p>
            : null
          : !visibleEntries.length
            ? <p className="panel-empty">No objects match the current mode.</p>
            : null}
      </div>
      ) : null}
    </section>
  )
}
