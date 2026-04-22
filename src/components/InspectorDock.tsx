import { useMemo } from 'react'
import { useEditorStore } from '../store/editorStore'
import { InspectorContent } from './Inspector'

function getInspectorTarget() {
  const state = useEditorStore.getState()
  const selectedNode = state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] : null

  if (!selectedNode) {
    return {
      title: 'Inspector',
      subtitle: 'No Selection',
      hasInspector: false,
    }
  }

  if (selectedNode.type === 'light') {
    return {
      title: selectedNode.label,
      subtitle: 'Light',
      hasInspector: true,
    }
  }

  if (selectedNode.type === 'material') {
    return {
      title: selectedNode.label,
      subtitle: 'Material',
      hasInspector: true,
    }
  }

  if (selectedNode.type === 'mesh' || selectedNode.type === 'group') {
    return {
      title: selectedNode.label,
      subtitle: selectedNode.type === 'mesh' ? 'Mesh' : 'Group',
      hasInspector: true,
    }
  }

  return {
    title: selectedNode.label,
    subtitle: selectedNode.type,
    hasInspector: false,
  }
}

export function InspectorDock() {
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] : null,
  )

  const inspectorTarget = useMemo(getInspectorTarget, [selectedNode, selectedObjectId])

  return (
    <aside className={`inspector-dock ${inspectorTarget.hasInspector ? 'is-active' : 'is-empty'}`}>
      <div className="inspector-dock__header">
        <div>
          <p className="panel-eyebrow">Inspector</p>
          <p className="panel-heading">{inspectorTarget.title}</p>
        </div>
        <p className="panel-meta">{inspectorTarget.subtitle}</p>
      </div>
      {inspectorTarget.hasInspector ? (
        <div className="inspector-dock__content">
          <InspectorContent />
        </div>
      ) : (
        <div className="inspector-placeholder">
          <p className="inspector-placeholder__title">Select a mesh or light</p>
          <p className="inspector-placeholder__body">
            Choose an object in the viewport or outliner to edit its properties here.
          </p>
        </div>
      )}
    </aside>
  )
}
