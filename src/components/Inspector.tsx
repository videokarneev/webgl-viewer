import { LevaPanel, useControls, useCreateStore } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'

function createObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

function createInspectorTheme() {
  return {
    colors: {
      elevation1: '#090c10',
      elevation2: '#0e1216',
      elevation3: '#151b21',
      accent1: '#4f88a9',
      accent2: '#65a2c6',
      accent3: '#8fc0dc',
      highlight1: '#1f2931',
      highlight2: '#7d97a7',
      highlight3: '#eef4f7',
      vivid1: '#9fcce3',
    },
    space: {
      sm: '5px',
      md: '8px',
      rowGap: '6px',
      colGap: '6px',
    },
    fontSizes: {
      root: '10px',
    },
    sizes: {
      rootWidth: '100%',
      controlWidth: '132px',
      rowHeight: '23px',
      folderTitleHeight: '18px',
      titleBarHeight: '28px',
    },
    borderWidths: {
      root: '0px',
      input: '1px',
      focus: '1px',
      hover: '1px',
      active: '1px',
      folder: '1px',
    },
    radii: {
      xs: '0px',
      sm: '0px',
      lg: '0px',
    },
    shadows: {
      level1: 'none',
      level2: 'none',
    },
    fontWeights: {
      label: 'normal',
      folder: 'normal',
      button: 'normal',
    },
  }
}

function SectionPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="inspector-section">
      <div className="inspector-section__header">{title}</div>
      <div className="inspector-section__body">{children}</div>
    </section>
  )
}

function LevaSection({ store }: { store: ReturnType<typeof useCreateStore> }) {
  const theme = useMemo(createInspectorTheme, [])

  return (
    <LevaPanel
      store={store}
      theme={theme}
      titleBar={false}
      hideCopyButton
      fill
      flat
      collapsed={false}
      oneLineLabels
    />
  )
}

function formatNumber(value: number, digits = 2) {
  return value.toFixed(digits)
}

function AtlasPreviewCanvas({ materialId }: { materialId: string }) {
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
    const width = 360
    const height = Math.max(220, Math.round(width * (imageHeight / imageWidth)))
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
    <div className="atlas-preview-wrap">
      <canvas ref={canvasRef} id="atlasPreview" width={360} height={220} />
    </div>
  )
}

function MaterialBaseSection({ materialId }: { materialId: string }) {
  const material = useEditorStore((state) => state.materials[materialId])
  const environment = useEditorStore((state) => state.environment)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)

  if (!material) {
    return null
  }

  return (
    <SectionPanel title="PBR Base">
      <div className="grid-two">
        <label className="field">
          <span>Color</span>
          <input
            type="color"
            value={material.color ?? '#ffffff'}
            onChange={(event) => updateMaterial(materialId, { color: event.currentTarget.value })}
          />
        </label>
        <div className="field">
          <span>Material</span>
          <div className="material-meta muted">{material.name || material.type}</div>
        </div>
      </div>
      <div className="grid-two">
        <label className="field">
          <span>
            Metalness <output>{formatNumber(material.metalness ?? 0)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={material.metalness ?? 0}
            onInput={(event) => updateMaterial(materialId, { metalness: Number(event.currentTarget.value) })}
          />
        </label>
        <label className="field">
          <span>
            Roughness <output>{formatNumber(material.roughness ?? 1)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={material.roughness ?? 1}
            onInput={(event) => updateMaterial(materialId, { roughness: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
      <div className="grid-two">
        <label className="field">
          <span>
            Env Map Intensity <output>{formatNumber(material.envMapIntensity ?? environment.intensity)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="5"
            step="0.01"
            value={material.envMapIntensity ?? environment.intensity}
            onInput={(event) => updateMaterial(materialId, { envMapIntensity: Number(event.currentTarget.value) })}
          />
        </label>
        <label className="field">
          <span>
            Clearcoat <output>{formatNumber(material.clearcoat ?? 0)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={material.clearcoat ?? 0}
            onInput={(event) => updateMaterial(materialId, { clearcoat: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
    </SectionPanel>
  )
}

function EmissiveSection({ materialId }: { materialId: string }) {
  const material = useEditorStore((state) => state.materials[materialId])
  const updateMaterial = useEditorStore((state) => state.updateMaterial)

  if (!material) {
    return null
  }

  return (
    <SectionPanel title="Emissive">
      <div className="grid-two">
        <label className="field">
          <span>Emissive Color</span>
          <input
            type="color"
            value={material.emissive ?? '#000000'}
            onChange={(event) => updateMaterial(materialId, { emissive: event.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>
            Emissive Intensity <output>{formatNumber(material.emissiveIntensity ?? 1)}</output>
          </span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.01"
            value={material.emissiveIntensity ?? 1}
            onInput={(event) => updateMaterial(materialId, { emissiveIntensity: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
    </SectionPanel>
  )
}

function AtlasOverlaySection({ materialId }: { materialId: string }) {
  const material = useEditorStore((state) => state.materials[materialId])
  const atlasLoaded = useEditorStore((state) => Boolean(state.assets.atlas && state.runtimeTextures.atlasTexture))
  const updateMaterialEffect = useEditorStore((state) => state.updateMaterialEffect)
  const setAssets = useEditorStore((state) => state.setAssets)
  const setAtlasTexture = useEditorStore((state) => state.setAtlasTexture)
  const setAtlasFrameTexture = useEditorStore((state) => state.setAtlasFrameTexture)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const atlasInputRef = useRef<HTMLInputElement | null>(null)

  if (!material) {
    return null
  }

  return (
    <SectionPanel title="Special Features">
      <div className="section-head">
        <h2>Emissive Atlas</h2>
        <span className="small-muted">{atlasLoaded ? 'Overlay loaded' : 'Awaiting atlas texture'}</span>
      </div>
      <div className="inspector-action-row inspector-action-row--atlas">
        {!atlasLoaded ? (
          <button type="button" className="tool-button tool-button--secondary left-full-button" onClick={() => atlasInputRef.current?.click()}>
            <span className="tool-button__glyph">ATL</span>
            <span className="tool-button__label">Load Atlas Texture</span>
          </button>
        ) : null}
        {atlasLoaded ? (
          <button
            type="button"
            className="tool-button tool-button--secondary"
            onClick={() => updateMaterialEffect(materialId, { play: !material.effect.play })}
          >
            <span className="tool-button__glyph">{material.effect.play ? 'PAUSE' : 'PLAY'}</span>
            <span className="tool-button__label">Playback</span>
          </button>
        ) : null}
        {atlasLoaded ? (
          <button type="button" className="tool-button tool-button--secondary" onClick={() => atlasInputRef.current?.click()}>
            <span className="tool-button__glyph">ATL</span>
            <span className="tool-button__label">Replace Atlas</span>
          </button>
        ) : null}
        {atlasLoaded ? (
          <button
            type="button"
            className="tool-button tool-button--secondary"
            onClick={() => {
              const currentAtlas = useEditorStore.getState().runtimeTextures.atlasTexture
              currentAtlas?.dispose()
              setAtlasTexture(null)
              setAtlasFrameTexture(null)
              setAssets({ atlas: null })
              updateMaterialEffect(materialId, { enabled: false, play: false, currentFrame: 0 })
            }}
          >
            <span className="tool-button__glyph">CLR</span>
            <span className="tool-button__label">Remove Overlay</span>
          </button>
        ) : null}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={material.effect.enabled}
          onChange={(event) => updateMaterialEffect(materialId, { enabled: event.currentTarget.checked })}
        />
        <span>Enable atlas overlay</span>
      </label>
      {atlasLoaded ? <AtlasPreviewCanvas materialId={materialId} /> : null}
      {atlasLoaded ? (
        <>
          <div className="grid-two">
            <label className="field">
              <span>Target Slot</span>
              <select
                value={material.effect.targetSlot}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    targetSlot: event.currentTarget.value as typeof material.effect.targetSlot,
                  })
                }
              >
                <option value="emissive">Emissive</option>
                <option value="baseColor">Base Color</option>
              </select>
            </label>
            <label className="field">
              <span>Frame Order</span>
              <select
                value={material.effect.frameOrder}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    frameOrder: event.currentTarget.value as typeof material.effect.frameOrder,
                  })
                }
              >
                <option value="row">Row</option>
                <option value="column">Column</option>
              </select>
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>
                Grid X <output>{material.effect.gridX}</output>
              </span>
              <input
                type="range"
                min="1"
                max="32"
                step="1"
                value={material.effect.gridX}
                onInput={(event) => updateMaterialEffect(materialId, { gridX: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="field">
              <span>
                Grid Y <output>{material.effect.gridY}</output>
              </span>
              <input
                type="range"
                min="1"
                max="32"
                step="1"
                value={material.effect.gridY}
                onInput={(event) => updateMaterialEffect(materialId, { gridY: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>
                FPS <output>{material.effect.fps}</output>
              </span>
              <input
                type="range"
                min="1"
                max="60"
                step="1"
                value={material.effect.fps}
                onInput={(event) => updateMaterialEffect(materialId, { fps: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="field">
              <span>
                Frame Count <output>{material.effect.frameCount}</output>
              </span>
              <input
                type="range"
                min="1"
                max="128"
                step="1"
                value={material.effect.frameCount}
                onInput={(event) => updateMaterialEffect(materialId, { frameCount: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>
                Current Frame <output>{material.effect.currentFrame}</output>
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(0, material.effect.frameCount - 1)}
                step="1"
                value={material.effect.currentFrame}
                onInput={(event) =>
                  updateMaterialEffect(materialId, {
                    currentFrame: Number(event.currentTarget.value),
                    play: false,
                  })
                }
              />
            </label>
            <label className="field">
              <span>
                Opacity <output>{formatNumber(material.effect.opacity)}</output>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.effect.opacity}
                onInput={(event) => updateMaterialEffect(materialId, { opacity: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>UV Channel</span>
              <select
                value={material.effect.uvChannel}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    uvChannel: event.currentTarget.value as typeof material.effect.uvChannel,
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="normal">Normal</option>
                <option value="baseColor">BaseColor</option>
                <option value="emissive">Emissive</option>
                <option value="uv">UV</option>
                <option value="uv2">UV2</option>
              </select>
            </label>
            <label className="field">
              <span>Wrap Mode</span>
              <select
                value={material.effect.wrapMode}
                onChange={(event) =>
                  updateMaterialEffect(materialId, {
                    wrapMode: event.currentTarget.value as typeof material.effect.wrapMode,
                  })
                }
              >
                <option value="repeat">Repeat</option>
                <option value="clamp">Clamp</option>
              </select>
            </label>
          </div>
          <div className="grid-two">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={material.effect.frameBlend}
                onChange={(event) => updateMaterialEffect(materialId, { frameBlend: event.currentTarget.checked })}
              />
              <span>Frame Blend</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={material.effect.loop}
                onChange={(event) => updateMaterialEffect(materialId, { loop: event.currentTarget.checked })}
              />
              <span>Loop Playback</span>
            </label>
          </div>
          <div className="grid-two">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={material.effect.play}
                onChange={(event) => updateMaterialEffect(materialId, { play: event.currentTarget.checked })}
              />
              <span>Play</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={material.effect.swapXY}
                onChange={(event) => updateMaterialEffect(materialId, { swapXY: event.currentTarget.checked })}
              />
              <span>Swap X / Y</span>
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>
                Offset X <output>{formatNumber(material.effect.offsetX)}</output>
              </span>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.01"
                value={material.effect.offsetX}
                onInput={(event) => updateMaterialEffect(materialId, { offsetX: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="field">
              <span>
                Offset Y <output>{formatNumber(material.effect.offsetY)}</output>
              </span>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.01"
                value={material.effect.offsetY}
                onInput={(event) => updateMaterialEffect(materialId, { offsetY: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>
                Scale X <output>{formatNumber(material.effect.scaleX)}</output>
              </span>
              <input
                type="range"
                min="0.01"
                max="4"
                step="0.01"
                value={material.effect.scaleX}
                onInput={(event) => updateMaterialEffect(materialId, { scaleX: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="field">
              <span>
                Scale Y <output>{formatNumber(material.effect.scaleY)}</output>
              </span>
              <input
                type="range"
                min="0.01"
                max="4"
                step="0.01"
                value={material.effect.scaleY}
                onInput={(event) => updateMaterialEffect(materialId, { scaleY: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
          <label className="field">
            <span>
              Rotation <output>{formatNumber(material.effect.rotation)}</output>
            </span>
            <input
              type="range"
              min="-180"
              max="180"
              step="0.1"
              value={material.effect.rotation}
              onInput={(event) => updateMaterialEffect(materialId, { rotation: Number(event.currentTarget.value) })}
            />
          </label>
        </>
      ) : null}
      <input
        ref={atlasInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          requestAtlasLoad({ url: createObjectUrl(file), label: file.name, revokeAfter: true, fileSize: null })
          event.currentTarget.value = ''
        }}
      />
    </SectionPanel>
  )
}

function LightSection({ objectId }: { objectId: string }) {
  const store = useCreateStore()
  const light = useEditorStore((state) => state.runtime.objectById[objectId] as THREE.Light | undefined)
  const extraLight = useEditorStore((state) => state.extraLights.find((entry) => entry.id === objectId))
  const updateExtraLight = useEditorStore((state) => state.updateExtraLight)

  const lightWithShadows = light as (THREE.Light & { castShadow?: boolean; shadow?: { bias: number } }) | undefined
  const pointLikeLight = light as (THREE.PointLight | THREE.SpotLight | undefined)
  const spotLight = light as (THREE.SpotLight | undefined)

  useControls(
    () => ({
      color: {
        value: light ? `#${light.color.getHexString()}` : '#ffffff',
        onChange: (value: string) => {
          if (light) light.color.set(value)
          updateExtraLight(objectId, { color: value })
        },
      },
      intensity: {
        value: light?.intensity ?? 1,
        min: 0,
        max: 20,
        step: 0.01,
        onChange: (value: number) => {
          if (light) light.intensity = value
          updateExtraLight(objectId, { intensity: value })
        },
      },
      distance: {
        value: extraLight?.distance ?? (pointLikeLight && 'distance' in pointLikeLight ? pointLikeLight.distance : 0),
        min: 0,
        max: 50,
        step: 0.1,
        onChange: (value: number) => {
          if (pointLikeLight && 'distance' in pointLikeLight) pointLikeLight.distance = value
          updateExtraLight(objectId, { distance: value })
        },
      },
      decay: {
        value: extraLight?.decay ?? (pointLikeLight && 'decay' in pointLikeLight ? pointLikeLight.decay : 2),
        min: 0,
        max: 4,
        step: 0.01,
        onChange: (value: number) => {
          if (pointLikeLight && 'decay' in pointLikeLight) pointLikeLight.decay = value
          updateExtraLight(objectId, { decay: value })
        },
      },
      angle: {
        value: spotLight && 'angle' in spotLight ? THREE.MathUtils.radToDeg(spotLight.angle) : 30,
        min: 1,
        max: 90,
        step: 1,
        onChange: (value: number) => {
          if (spotLight && 'angle' in spotLight) spotLight.angle = THREE.MathUtils.degToRad(value)
          updateExtraLight(objectId, { angle: value })
        },
      },
      penumbra: {
        value: spotLight && 'penumbra' in spotLight ? spotLight.penumbra : 0,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (value: number) => {
          if (spotLight && 'penumbra' in spotLight) spotLight.penumbra = value
          updateExtraLight(objectId, { penumbra: value })
        },
      },
      castShadow: {
        value: Boolean(lightWithShadows?.castShadow),
        onChange: (value: boolean) => {
          if (lightWithShadows && 'castShadow' in lightWithShadows) lightWithShadows.castShadow = value
          updateExtraLight(objectId, { castShadow: value })
        },
      },
      shadowBias: {
        value: lightWithShadows?.shadow?.bias ?? 0,
        min: -0.01,
        max: 0.01,
        step: 0.0001,
        onChange: (value: number) => {
          if (lightWithShadows?.shadow) lightWithShadows.shadow.bias = value
          updateExtraLight(objectId, { shadowBias: value })
        },
      },
    }),
    { store },
    [extraLight, light, lightWithShadows?.castShadow, lightWithShadows?.shadow?.bias, objectId, pointLikeLight, spotLight, updateExtraLight],
  )

  return (
    <SectionPanel title="Light Properties">
      <LevaSection store={store} />
    </SectionPanel>
  )
}

function SelectionSummarySection({
  objectId,
  materialId,
}: {
  objectId: string
  materialId: string | null
}) {
  const selectedNode = useEditorStore((state) => state.sceneGraph[objectId] ?? null)
  const runtimeObject = useEditorStore((state) => state.runtime.objectById[objectId] ?? null)
  const material = useEditorStore((state) => (materialId ? state.materials[materialId] ?? null : null))

  if (!selectedNode) {
    return null
  }

  return (
    <SectionPanel title="Selection">
      <div className="field">
        <span>Name</span>
        <div className="material-meta">{selectedNode.label}</div>
      </div>
      <div className="field">
        <span>Type</span>
        <div className="material-meta muted">{runtimeObject?.type ?? selectedNode.type}</div>
      </div>
      <div className="field">
        <span>Object ID</span>
        <div className="material-meta muted">{selectedNode.id}</div>
      </div>
      <div className="field">
        <span>Material</span>
        <div className="material-meta muted">{material?.name ?? materialId ?? 'No material on this selection.'}</div>
      </div>
    </SectionPanel>
  )
}

export function InspectorContent() {
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)

  if (!selectedObjectId) return null

  const selectedNode = sceneGraph[selectedObjectId]
  if (!selectedNode) return null

  if (selectedNode.type === 'light') {
    return (
      <>
        <SelectionSummarySection objectId={selectedNode.id} materialId={null} />
        <LightSection objectId={selectedNode.id} />
      </>
    )
  }

  return (
    <>
      <SelectionSummarySection objectId={selectedNode.id} materialId={selectedMaterialId} />
      {selectedMaterialId ? (
        <>
          <MaterialBaseSection materialId={selectedMaterialId} />
          <EmissiveSection materialId={selectedMaterialId} />
          <AtlasOverlaySection materialId={selectedMaterialId} />
        </>
      ) : null}
    </>
  )
}

export function Inspector() {
  const setHud = useEditorStore((state) => state.setHud)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const selectedNode = useEditorStore((state) =>
    state.selectedObjectId ? state.sceneGraph[state.selectedObjectId] ?? null : null,
  )

  return (
    <aside className="inspector-dock">
      <div className="inspector-dock__header">
        <div className="panel-header__stack">
          <p className="panel-eyebrow">Inspector</p>
          <p className="panel-heading">Inspector</p>
        </div>
        <p className="panel-meta">{selectedNode?.label ?? 'No Selection'}</p>
      </div>
      <div className="inspector-dock__content">
        {!selectedObjectId ? (
          <div className="inspector-placeholder">
            <p className="inspector-placeholder__title">Select a mesh or light</p>
            <p className="inspector-placeholder__body">
              Choose an object in the viewport or outliner to edit its properties here.
            </p>
          </div>
        ) : (
          <InspectorContent />
        )}
      </div>
      <button type="button" className="ghost small panel-visibility-toggle inspector-dock__hide" onClick={() => setHud({ inspectorVisible: false })}>
        Hide panel
      </button>
    </aside>
  )
}
