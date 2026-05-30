import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'
import { ensureFrameTextureOptions } from './atlasTextureOptions'

type RuntimeFlipbookMaterial = THREE.Material & {
  needsUpdate: boolean
  map?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  emissive?: THREE.Color
  userData: THREE.Material['userData'] & {
    flipbookOriginalEmissiveHex?: number
  }
}

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

function getFrameCellSize(imageWidth: number, imageHeight: number, columns: number, rows: number) {
  return {
    width: imageWidth / Math.max(columns, 1),
    height: imageHeight / Math.max(rows, 1),
  }
}

function syncRuntimeFlipbookTexture(materialId: string, targetSlot: 'emissive' | 'baseColor', texture: THREE.Texture) {
  const material = useEditorStore.getState().runtime.materialById[materialId] as RuntimeFlipbookMaterial | undefined
  if (!material) {
    return
  }

  if (targetSlot === 'baseColor') {
    if (material.map !== texture) {
      material.map = texture
      material.needsUpdate = true
    }
    return
  }

  if (material.emissive) {
    if (material.userData.flipbookOriginalEmissiveHex == null) {
      material.userData.flipbookOriginalEmissiveHex = material.emissive.getHex()
    }

    if (material.emissive.getHex() === 0x000000) {
      material.emissive.setHex(0xffffff)
    }
  }

  if (material.emissiveMap !== texture) {
    material.emissiveMap = texture
    material.needsUpdate = true
  }
}

export function useAtlasAnimator(materialId: string | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameTextureRef = useRef<THREE.CanvasTexture | null>(null)
  const lastAtlasTextureRef = useRef<THREE.Texture | null>(null)
  const lastFrameRef = useRef(-1)
  const playbackFrameRef = useRef(0)
  const lastCommittedFrameRef = useRef<number | null>(null)
  const accumulatedTimeRef = useRef(0)
  const wasPlayingRef = useRef(false)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const setAtlasFrameTexture = useEditorStore((state) => state.setAtlasFrameTexture)
  const setMaterialEffectPreviewFrame = useEditorStore((state) => state.setMaterialEffectPreviewFrame)

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
      const maxFrames = Math.max(1, columns * rows)
      const sourceFrame = requestedFrame ?? effect.currentFrame
      const clampedFrame = Math.min(Math.max(0, sourceFrame), Math.max(0, maxFrames - 1))
      const baseFrame = Math.floor(clampedFrame)
      const blendWeight =
        effect.frameBlend && maxFrames > 1 ? Math.min(Math.max(0, clampedFrame - baseFrame), 1) : 0
      const nextFrame = effect.loop ? (baseFrame + 1) % maxFrames : Math.min(baseFrame + 1, maxFrames - 1)
      const { column, row } = getFrameCoordinates(baseFrame, columns, rows, effect.frameOrder)
      const { column: nextColumn, row: nextRow } = getFrameCoordinates(nextFrame, columns, rows, effect.frameOrder)
      const frameSize = getFrameCellSize(image.width, image.height, columns, rows)
      const sourceX = column * frameSize.width
      const sourceY = row * frameSize.height
      const nextSourceX = nextColumn * frameSize.width
      const nextSourceY = nextRow * frameSize.height
      const outputWidth = Math.max(1, Math.round(frameSize.width))
      const outputHeight = Math.max(1, Math.round(frameSize.height))
      const effectOpacity = Math.min(Math.max(effect.opacity, 0), 1)

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }

      const canvas = canvasRef.current
      const frameTextureNeedsRecreate =
        Boolean(frameTextureRef.current) && (canvas.width !== outputWidth || canvas.height !== outputHeight)

      if (frameTextureNeedsRecreate && frameTextureRef.current) {
        if (store.runtimeTextures.atlasFrameTexture === frameTextureRef.current) {
          setAtlasFrameTexture(null)
        }
        frameTextureRef.current.dispose()
        frameTextureRef.current = null
      }

      if (canvas.width !== outputWidth) {
        canvas.width = outputWidth
      }
      if (canvas.height !== outputHeight) {
        canvas.height = outputHeight
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return atlasTexture
      }

      ctx.clearRect(0, 0, outputWidth, outputHeight)
      ctx.drawImage(image, sourceX, sourceY, frameSize.width, frameSize.height, 0, 0, outputWidth, outputHeight)

      if (blendWeight > 0.001) {
        ctx.save()
        ctx.globalAlpha = blendWeight
        ctx.drawImage(
          image,
          nextSourceX,
          nextSourceY,
          frameSize.width,
          frameSize.height,
          0,
          0,
          outputWidth,
          outputHeight,
        )
        ctx.restore()
      }

      if (effectOpacity < 0.999) {
        ctx.save()
        ctx.globalCompositeOperation = 'destination-in'
        ctx.globalAlpha = effectOpacity
        ctx.fillRect(0, 0, outputWidth, outputHeight)
        ctx.restore()
      }

      if (!frameTextureRef.current) {
        frameTextureRef.current = new THREE.CanvasTexture(canvas)
      }

      ensureFrameTextureOptions(frameTextureRef.current, effect.wrapMode)
      frameTextureRef.current.needsUpdate = true
      if (store.runtimeTextures.atlasFrameTexture !== frameTextureRef.current) {
        setAtlasFrameTexture(frameTextureRef.current)
      }
      syncRuntimeFlipbookTexture(materialId, effect.targetSlot, frameTextureRef.current)
      return frameTextureRef.current
    },
    [materialId, setAtlasFrameTexture],
  )

  useEffect(() => {
    if (lastAtlasTextureRef.current !== atlasTexture) {
      frameTextureRef.current = null
      setAtlasFrameTexture(null)
      lastAtlasTextureRef.current = atlasTexture
    }

    refresh()
  }, [atlasTexture, refresh, setAtlasFrameTexture])

  useEffect(() => {
    return () => {
      if (frameTextureRef.current) {
        frameTextureRef.current.dispose()
        frameTextureRef.current = null
      }
      setAtlasFrameTexture(null)
      if (materialId) {
        setMaterialEffectPreviewFrame(materialId, null)
      }
    }
  }, [materialId, refresh, setAtlasFrameTexture, setMaterialEffectPreviewFrame])

  useFrame((_, delta) => {
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

      const frameCount = Math.max(1, effect.gridX * effect.gridY)
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

      const nextPreviewFrame = Math.floor(playbackFrameRef.current)
      lastFrameRef.current = nextPreviewFrame
      setMaterialEffectPreviewFrame(materialId, nextPreviewFrame)
    } else {
      if (wasPlayingRef.current) {
        const committedFrame = Math.floor(playbackFrameRef.current)
        if (committedFrame !== lastCommittedFrameRef.current) {
          lastCommittedFrameRef.current = committedFrame
          useEditorStore.getState().updateMaterialEffect(materialId, { currentFrame: committedFrame })
        }
      }

      playbackFrameRef.current = effect.currentFrame
      accumulatedTimeRef.current = 0
      lastFrameRef.current = effect.currentFrame
      lastCommittedFrameRef.current = effect.currentFrame
      setMaterialEffectPreviewFrame(materialId, effect.currentFrame)
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
