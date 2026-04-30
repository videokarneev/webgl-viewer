import { type ReactNode, useMemo, useState } from 'react'
import { useEditorStore } from '../store/editorStore'

type ViewMode = 'layers' | 'meshes' | 'materials' | 'lights'

type OutlinerEntry =
  | {
      id: string
      label: string
      visible: boolean
      removable: boolean
      kind: 'mesh' | 'group' | 'scene'
      depth: number
      selectionId: string
      materialId?: string | null
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

function RowIcon({ kind }: { kind: OutlinerEntry['kind'] }) {
  if (kind === 'material') {
    return <SphereIcon />
  }
  if (kind === 'light' || kind === 'ambient') {
    return <LightIcon />
  }
  if (kind === 'environment') {
    return <SphereIcon />
  }
  if (kind === 'mesh') {
    return <CubeIcon />
  }
  return <LayersIcon />
}

export function Outliner() {
  const sceneGraph = useEditorStore((state) => state.sceneGraph)
  const objects = useEditorStore((state) => state.objects)
  const materials = useEditorStore((state) => state.materials)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const environment = useEditorStore((state) => state.environment)
  const lights = useEditorStore((state) => state.lights)
  const extraLights = useEditorStore((state) => state.extraLights)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const toggleObjectVisibility = useEditorStore((state) => state.toggleObjectVisibility)
  const removeSceneNode = useEditorStore((state) => state.removeSceneNode)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const removeEnvironment = useEditorStore((state) => state.removeEnvironment)
  const setLights = useEditorStore((state) => state.setLights)
  const removeAmbientLight = useEditorStore((state) => state.removeAmbientLight)
  const removeExtraLight = useEditorStore((state) => state.removeExtraLight)

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('layers')

  const meshEntries = useMemo(() => {
    const entries: OutlinerEntry[] = []

    const walk = (nodeId: string, depth: number) => {
      const node = sceneGraph[nodeId]
      if (!node || node.type === 'material' || node.type === 'camera' || node.type === 'light') {
        return
      }

      if (node.type === 'mesh' || node.type === 'group' || node.type === 'scene') {
        const directMaterialIds = node.children.filter((childId) => sceneGraph[childId]?.type === 'material')
        entries.push({
          id: node.id,
          label: node.label || (node.type === 'mesh' ? 'Unnamed Mesh' : 'Unnamed Object'),
          visible: objects[node.id]?.visible ?? node.visible ?? true,
          removable: node.type !== 'scene',
          kind: node.type,
          depth,
          selectionId: node.id,
          materialId: directMaterialIds[0] ?? null,
        })

        if (viewMode === 'layers' && node.type === 'mesh') {
          directMaterialIds.forEach((materialId) => {
            const material = materials[materialId]
            if (!material) {
              return
            }
            entries.push({
              id: materialId,
              label: material.name || 'Unnamed Material',
              visible: true,
              removable: false,
              kind: 'material',
              depth: depth + 1,
              selectionId: node.id,
              materialId,
              parentMeshId: node.id,
            })
          })
        }
      }

      node.children.forEach((childId) => {
        const childNode = sceneGraph[childId]
        if (childNode && childNode.type !== 'material') {
          walk(childId, depth + 1)
        }
      })
    }

    if (rootNodeId) {
      walk(rootNodeId, 0)
    }

    return entries
  }, [materials, objects, rootNodeId, sceneGraph, viewMode])

  const materialEntries = useMemo<OutlinerEntry[]>(() => {
    return Object.values(materials).map((material) => ({
      id: material.id,
      label: material.name || 'Unnamed Material',
      visible: true,
      removable: false,
      kind: 'material',
      depth: 0,
      selectionId: material.meshIds[0] ?? material.id,
      materialId: material.id,
      parentMeshId: material.meshIds[0] ?? null,
    }))
  }, [materials])

  const lightEntries = useMemo<OutlinerEntry[]>(() => {
    const entries: OutlinerEntry[] = [
      {
        id: 'environment:system',
        label: environment.customHdriUrl || environment.source ? `Environment (${environment.kind})` : 'Environment (Preset: City)',
        visible: environment.isEnvironmentEnabled,
        removable: true,
        kind: 'environment',
        depth: 0,
        selectionId: 'environment:system',
      },
      {
        id: 'light:ambient:system',
        label: 'Ambient Light',
        visible: lights.ambient.visible,
        removable: true,
        kind: 'ambient',
        depth: 0,
        selectionId: 'light:ambient:system',
      },
    ]

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
  }, [environment.customHdriUrl, environment.isEnvironmentEnabled, environment.kind, environment.source, extraLights, lights.ambient.visible])

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source =
      viewMode === 'materials' ? materialEntries : viewMode === 'lights' ? lightEntries : meshEntries

    return source.filter((entry) => {
      if (!query) {
        return true
      }
      return entry.label.toLowerCase().includes(query)
    })
  }, [lightEntries, materialEntries, meshEntries, search, viewMode])

  const activeSelectionId =
    viewMode === 'materials' ? selectedMaterialId : selectedObjectId

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
        {visibleEntries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`tree-node${activeSelectionId === entry.id || activeSelectionId === entry.selectionId ? ' is-selected' : ''}${!entry.visible ? ' is-dimmed' : ''}`}
            onClick={() => {
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
              <span
                role="button"
                tabIndex={0}
                className="tree-action"
                onClick={(event) => {
                  event.stopPropagation()
                  if (entry.kind === 'environment') {
                    setEnvironment({ isEnvironmentEnabled: !environment.isEnvironmentEnabled })
                    return
                  }
                  if (entry.kind === 'ambient') {
                    setLights({ ambient: { visible: !lights.ambient.visible } })
                    return
                  }
                  if (entry.kind === 'material') {
                    return
                  }
                  toggleObjectVisibility(entry.selectionId)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    ;(event.currentTarget as HTMLElement).click()
                  }
                }}
              >
                {entry.visible ? 'Eye' : 'Off'}
              </span>
              <span
                role="button"
                tabIndex={entry.removable ? 0 : -1}
                className="tree-action"
                onClick={(event) => {
                  event.stopPropagation()
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
                  removeSceneNode(entry.selectionId)
                }}
                onKeyDown={(event) => {
                  if (!entry.removable) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    ;(event.currentTarget as HTMLElement).click()
                  }
                }}
              >
                Del
              </span>
            </span>
          </button>
        ))}
        {!visibleEntries.length ? <p className="panel-empty">No objects match the current mode.</p> : null}
      </div>
    </section>
  )
}
