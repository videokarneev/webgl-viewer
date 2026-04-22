import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'

export function AtlasVisualizer({ materialId, embedded = false }: { materialId: string; embedded?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const effect = useEditorStore((state) => state.materials[materialId]?.effect)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !effect) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const image = atlasTexture?.image as CanvasImageSource & { width?: number; height?: number } | undefined
    const imageWidth = image?.width ?? 512
    const imageHeight = image?.height ?? 512
    const width = 252
    const height = Math.max(144, Math.round(width * (imageHeight / imageWidth)))
    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#06090c'
    ctx.fillRect(0, 0, width, height)

    if (image) {
      ctx.drawImage(image, 0, 0, width, height)
    }

    const columns = Math.max(1, effect.gridX)
    const rows = Math.max(1, effect.gridY)
    const cellWidth = width / columns
    const cellHeight = height / rows
    const activeFrame = Math.min(
      Math.max(0, effect.currentFrame),
      Math.max(0, Math.min(effect.frameCount, columns * rows) - 1),
    )
    const activeColumn =
      effect.frameOrder === 'column' ? Math.floor(activeFrame / rows) : activeFrame % columns
    const activeRow =
      effect.frameOrder === 'column' ? activeFrame % rows : Math.floor(activeFrame / columns)

    ctx.save()
    ctx.strokeStyle = 'rgba(236, 244, 248, 0.18)'
    ctx.lineWidth = 1
    for (let column = 1; column < columns; column += 1) {
      const x = Math.round(column * cellWidth) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let row = 1; row < rows; row += 1) {
      const y = Math.round(row * cellHeight) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()

    ctx.fillStyle = 'rgba(113, 179, 214, 0.18)'
    ctx.fillRect(activeColumn * cellWidth, activeRow * cellHeight, cellWidth, cellHeight)
    ctx.strokeStyle = '#9bd3f0'
    ctx.lineWidth = 2
    ctx.strokeRect(activeColumn * cellWidth + 1, activeRow * cellHeight + 1, cellWidth - 2, cellHeight - 2)
  }, [atlasTexture, effect])

  if (!effect || !atlasTexture) {
    return null
  }

  return (
    <section className={`atlas-visualizer ${embedded ? 'atlas-visualizer--embedded' : ''}`}>
      <div className="atlas-visualizer__header">
        <div>
          {!embedded ? <p className="atlas-visualizer__eyebrow">Animated Overlay</p> : null}
          <p className="atlas-visualizer__meta">
            Frame {effect.currentFrame + 1} / {Math.max(1, effect.frameCount)}
          </p>
        </div>
      </div>
      <canvas ref={canvasRef} className="atlas-visualizer__canvas" />
    </section>
  )
}
