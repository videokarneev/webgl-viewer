import { TransformControls } from '@react-three/drei'
import { useEditorStore } from '../../../store/editorStore'

export function TransformGizmo() {
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) => (selectedObjectId ? state.sceneGraph[selectedObjectId] : null))
  const object = useEditorStore((state) =>
    selectedNode && selectedNode.type !== 'material' ? state.runtime.objectById[selectedNode.id] : null,
  )
  const hud = useEditorStore((state) => state.hud)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)

  if (!object || !selectedNode || selectedNode.type === 'material') {
    return null
  }

  return (
    <TransformControls
      object={object}
      mode={hud.transformMode}
      onObjectChange={() => {
        const position: [number, number, number] = [object.position.x, object.position.y, object.position.z]
        updateObjectTransform(selectedNode.id, {
          position,
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
          visible: object.visible,
        })
        if (selectedNode.type === 'light') {
          updateExtraLight(selectedNode.id, { position })
        }
      }}
      onMouseUp={() => {
        const position: [number, number, number] = [object.position.x, object.position.y, object.position.z]
        updateObjectTransform(selectedNode.id, {
          position,
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
          visible: object.visible,
        })
        if (selectedNode.type === 'light') {
          updateExtraLight(selectedNode.id, { position })
        }

        const lightWithTarget = object as typeof object & { target?: { updateMatrixWorld: () => void } }
        if (lightWithTarget.target) {
          lightWithTarget.target.updateMatrixWorld()
        }
      }}
    />
  )
}
