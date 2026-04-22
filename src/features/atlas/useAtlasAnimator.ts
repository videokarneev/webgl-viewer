import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'
import { ensureFrameTextureOptions } from './atlasMaterialPatch'

function getFrameCoordinates(index: number, gridX: number, gridY: number, order: 'row' | 'column') {
  const columns = Math.max(1, gridX)
  const rows = Math.max(1, gridY)

  if (order === 'column') {
    return {
      column: Math.floor(index / rows),
      row: index % rows,
    }
  }

  return {
    column: index % columns,
    row: Math.floor(index / columns),
  }
}

export function useAtlasAnimator(materialId: string | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameTextureRef = useRef<THREE.CanvasTexture | null>(null)
  const lastFrameRef = useRef(-1)
  const playbackFrameRef = useRef(0)
  const accumulatedTimeRef = useRef(0)
  const wasPlayingRef = useRef(false)
  const setAtlasFrameTexture = useEditorStore((state) => state.setAtlasFrameTexture)

  const refresh = useMemo(
    () => (requestedFrame?: number) => {
      const store = useEditorStore.getState()
      if (!materialId) {
        return null
      }

      const materialState = store.materials[materialId]
      const atlasTexture = store.runtimeTextures.atlasTexture

      if (!materialState || !atlasTexture?.image) {
        return atlasTexture ?? null
      }

      const image = atlasTexture.image as CanvasImageSource & { width: number; height: number }
      const effect = materialState.effect
      const columns = Math.max(1, effect.gridX)
      const rows = Math.max(1, effect.gridY)
      const maxFrames = columns * rows
      const sourceFrame = requestedFrame ?? effect.currentFrame
      const clampedFrame = Math.min(Math.max(0, sourceFrame), Math.max(0, maxFrames - 1))
      const baseFrame = Math.floor(clampedFrame)
      const blendWeight =
        effect.frameBlend && maxFrames > 1 ? Math.min(Math.max(0, clampedFrame - baseFrame), 1) : 0
      const nextFrame = effect.loop ? (baseFrame + 1) % maxFrames : Math.min(baseFrame + 1, maxFrames - 1)
      const { column, row } = getFrameCoordinates(baseFrame, columns, rows, effect.frameOrder)
      const { column: nextColumn, row: nextRow } = getFrameCoordinates(nextFrame, columns, rows, effect.frameOrder)
      const frameWidth = Math.max(1, Math.floor(image.width / columns))
      const frameHeight = Math.max(1, Math.floor(image.height / rows))
      const sourceX = column * frameWidth
      const sourceY = row * frameHeight
      const nextSourceX = nextColumn * frameWidth
      const nextSourceY = nextRow * frameHeight

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }

      const canvas = canvasRef.current
      canvas.width = frameWidth
      canvas.height = frameHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return atlasTexture
      }

      ctx.clearRect(0, 0, frameWidth, frameHeight)
      ctx.drawImage(image, sourceX, sourceY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)

      if (blendWeight > 0.001) {
        ctx.save()
        ctx.globalAlpha = blendWeight
        ctx.drawImage(image, nextSourceX, nextSourceY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
        ctx.restore()
      }

      if (!frameTextureRef.current) {
        frameTextureRef.current = new THREE.CanvasTexture(canvas)
      }

      ensureFrameTextureOptions(frameTextureRef.current, effect.wrapMode)
      setAtlasFrameTexture(frameTextureRef.current)
      return frameTextureRef.current
    },
    [materialId, setAtlasFrameTexture],
  )

  useEffect(() => {
    refresh()
    return () => {
      frameTextureRef.current?.dispose()
      frameTextureRef.current = null
      setAtlasFrameTexture(null)
    }
  }, [refresh, setAtlasFrameTexture])

  useFrame((frameState, delta) => {
    if (!materialId) {
      return
    }

    const store = useEditorStore.getState()
    const materialState = store.materials[materialId]
    const atlasTexture = store.runtimeTextures.atlasTexture
    if (!materialState || !atlasTexture || !materialState.effect.enabled) {
      return
    }

    const effect = materialState.effect
    let frame = effect.currentFrame

    if (effect.play) {
      if (!wasPlayingRef.current) {
        playbackFrameRef.current = effect.currentFrame
        accumulatedTimeRef.current = 0
      }

      const frameCount = Math.max(1, effect.frameCount)
      const frameInterval = effect.fps > 0 ? 1 / effect.fps : Number.POSITIVE_INFINITY
      accumulatedTimeRef.current += delta

      while (accumulatedTimeRef.current >= frameInterval) {
        accumulatedTimeRef.current -= frameInterval

        if (effect.loop) {
          playbackFrameRef.current = (playbackFrameRef.current + 1) % frameCount
        } else {
          playbackFrameRef.current = Math.min(playbackFrameRef.current + 1, frameCount - 1)
        }
      }

      const blendAlpha =
        effect.frameBlend && Number.isFinite(frameInterval) && frameInterval > 0
          ? Math.min(accumulatedTimeRef.current / frameInterval, 0.9999)
          : 0

      frame = effect.frameBlend
        ? effect.loop
          ? (playbackFrameRef.current + blendAlpha) % frameCount
          : Math.min(playbackFrameRef.current + blendAlpha, frameCount - 1)
        : playbackFrameRef.current

      const nextDiscreteFrame = Math.floor(playbackFrameRef.current)
      if (nextDiscreteFrame !== lastFrameRef.current) {
        lastFrameRef.current = nextDiscreteFrame
        useEditorStore.getState().updateMaterialEffect(materialId, { currentFrame: nextDiscreteFrame })
      }
    } else {
      playbackFrameRef.current = effect.currentFrame
      accumulatedTimeRef.current = 0
      lastFrameRef.current = effect.currentFrame
    }

    wasPlayingRef.current = effect.play

    refresh(frame)
  })

  return {
    canvas: canvasRef.current,
    frameTexture: frameTextureRef.current,
    refresh,
  }
}
