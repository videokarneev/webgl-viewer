import { type ReactNode, useMemo, useState } from 'react'
import { useEditorStore } from '../store/editorStore'

type ViewMode = 'layers' | 'meshes' | 'materials' | 'lights'

type OutlinerEntry =
  | {
      id: string
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

function RowIcon({ kind }: { kind: OutlinerEntry['kind'] | 'root' }) {
  if (kind === 'root') {
    return <FileIcon />
  }
  if (kind === 'material') {
    return <SphereIcon />
  }
  if (kind === 'light' || kind === 'ambient') {
    return <LightIcon />
  }
  if (kind === 'environment') {
    return <SphereIcon />
  }
  return <CubeIcon />
}

export function Outliner() {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const loadedFileName = useEditorStore((state) => state.loadedFileName)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const environment = useEditorStore((state) => state.environment)
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const toggleVisibility = useEditorStore((state) => state.toggleVisibility)
  const deleteObject = useEditorStore((state) => state.deleteObject)
  const resetMaterialToDefault = useEditorStore((state) => state.resetMaterialToDefault)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const removeEnvironment = useEditorStore((state) => state.removeEnvironment)
  const setLights = useEditorStore((state) => state.setLights)
  const removeAmbientLight = useEditorStore((state) => state.removeAmbientLight)
  const removeExtraLight = useEditorStore((state) => state.removeExtraLight)

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('layers')

  const meshIds = useMemo(() => {
    if (!rootNodeId) {
      return []
    }

    const ids: string[] = []
    const walk = (nodeId: string) => {
      const node = sceneGraph[nodeId]
      if (!node || node.type === 'material' || node.type === 'camera' || node.type === 'light') {
        return
      }

      if (node.type === 'mesh') {
        ids.push(node.id)
      }

      node.children.forEach((childId) => {
        if (sceneGraph[childId]?.type !== 'material') {
          walk(childId)
        }
      })
    }

    walk(rootNodeId)
    return ids
  }, [rootNodeId, sceneGraph])

  const orderedMaterialEntries = useMemo(() => {
    const seen = new Set<string>()
    const entries: Extract<OutlinerEntry, { kind: 'material' }>[] = []

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

    Object.values(materials).forEach((material) => {
      if (seen.has(material.id)) {
        return
      }

      seen.add(material.id)
      entries.push({
        id: material.id,
        label: material.name || 'Unnamed Material',
        visible: true,
        removable: false,
        kind: 'material',
        depth: 1,
        selectionId: material.meshIds[0] ?? material.id,
        materialId: material.id,
        parentMeshId: material.meshIds[0] ?? null,
      })
    })

    return entries
  }, [materials, meshIds, sceneGraph])

  const meshEntries = useMemo<OutlinerEntry[]>(() => {
    const entries: OutlinerEntry[] = []

    meshIds.forEach((meshId) => {
      const node = sceneGraph[meshId]
      if (!node) {
        return
      }

      const materialIds = node.children.filter((childId) => sceneGraph[childId]?.type === 'material')
      entries.push({
        id: node.id,
        label: node.label || 'Unnamed Mesh',
        visible: objects[node.id]?.visible ?? node.visible ?? true,
        removable: true,
        kind: 'mesh',
        depth: 1,
        selectionId: node.id,
        materialIds,
      })

      const shouldShowMaterials =
        viewMode === 'layers' || (viewMode === 'meshes' && selectedObjectId === node.id)

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

    return entries
  }, [materials, meshIds, objects, sceneGraph, selectedObjectId, viewMode])

  const materialEntries = useMemo<OutlinerEntry[]>(() => orderedMaterialEntries, [orderedMaterialEntries])

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

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source =
      viewMode === 'materials' ? materialEntries : viewMode === 'lights' ? lightEntries : meshEntries

    if (!query) {
      return source
    }

    return source.filter((entry) => entry.label.toLowerCase().includes(query))
  }, [lightEntries, materialEntries, meshEntries, search, viewMode])

  const fileRootLabel = loadedFileName ?? 'Scene'
  const showFileRoot = viewMode !== 'lights' && (Boolean(rootNodeId) || Boolean(loadedFileName))

  const handleToggleVisibility = (entry: OutlinerEntry) => {
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

  return (
    <section className="outliner-panel">
      <div className="outliner-header">
        <div className="outliner-panel__header">
          <span>Outliner</span>
          <span className="left-accordion__meta">Scene Tree</span>
        </div>
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
            <ModeButton active={viewMode === 'layers'} title="Layers" onClick={() => setViewMode('layers')}>
              <LayersIcon />
            </ModeButton>
            <ModeButton active={viewMode === 'meshes'} title="Geometry" onClick={() => setViewMode('meshes')}>
              <CubeIcon />
            </ModeButton>
            <ModeButton active={viewMode === 'materials'} title="Materials" onClick={() => setViewMode('materials')}>
              <SphereIcon />
            </ModeButton>
            <ModeButton active={viewMode === 'lights'} title="Lights" onClick={() => setViewMode('lights')}>
              <LightIcon />
            </ModeButton>
          </div>
        </div>
      </div>
      <div className="tree-view outliner-list">
        {showFileRoot ? (
          <div className="tree-node tree-node--root" style={{ paddingLeft: '10px' }}>
            <span className="tree-node__icon is-root">
              <RowIcon kind="root" />
            </span>
            <span className="tree-node__label">{fileRootLabel}</span>
          </div>
        ) : null}
        {visibleEntries.map((entry) => {
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
        })}
        {!visibleEntries.length ? <p className="panel-empty">No objects match the current mode.</p> : null}
      </div>
    </section>
  )
}
