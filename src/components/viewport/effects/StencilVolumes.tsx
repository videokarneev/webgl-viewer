import { useEditorStore } from '../../../store/editorStore'
import { StencilVolume } from './StencilVolume'

export function StencilVolumes() {
  const entries = useEditorStore((state) => state.stencilVolumes)

  return (
    <>
      {entries.map((entry) => (
        <StencilVolume key={entry.id} entry={entry} />
      ))}
    </>
  )
}
