import { LevaPanel, useControls, useCreateStore } from 'leva'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { AtlasVisualizer } from './AtlasVisualizer'

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

function MaterialBaseSection({ materialId }: { materialId: string }) {
  const store = useCreateStore()
  const material = useEditorStore((state) => state.materials[materialId])
  const environment = useEditorStore((state) => state.environment)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)

  if (!material) {
    return null
  }

  useControls(
    () => ({
      color: {
        value: material.color ?? '#ffffff',
        onChange: (value: string) => updateMaterial(materialId, { color: value }),
      },
      metalness: {
        value: material.metalness ?? 0,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (value: number) => updateMaterial(materialId, { metalness: value }),
      },
      roughness: {
        value: material.roughness ?? 1,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (value: number) => updateMaterial(materialId, { roughness: value }),
      },
      envMapIntensity: {
        value: material.envMapIntensity ?? environment.intensity,
        min: 0,
        max: 5,
        step: 0.01,
        onChange: (value: number) => updateMaterial(materialId, { envMapIntensity: value }),
      },
    }),
    { store },
    [environment.intensity, material, materialId, updateMaterial],
  )

  return (
    <SectionPanel title="PBR Base">
      <LevaSection store={store} />
    </SectionPanel>
  )
}

function EmissiveSection({ materialId }: { materialId: string }) {
  const store = useCreateStore()
  const material = useEditorStore((state) => state.materials[materialId])
  const updateMaterial = useEditorStore((state) => state.updateMaterial)

  if (!material) {
    return null
  }

  useControls(
    () => ({
      emissive: {
        value: material.emissive ?? '#000000',
        onChange: (value: string) => updateMaterial(materialId, { emissive: value }),
      },
      emissiveIntensity: {
        value: material.emissiveIntensity ?? 1,
        min: 0,
        max: 10,
        step: 0.01,
        onChange: (value: number) => updateMaterial(materialId, { emissiveIntensity: value }),
      },
    }),
    { store },
    [material, materialId, updateMaterial],
  )

  return (
    <SectionPanel title="Emissive">
      <LevaSection store={store} />
    </SectionPanel>
  )
}

function AtlasOverlaySection({ materialId }: { materialId: string }) {
  const store = useCreateStore()
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

  useControls(
    () => ({
      enabled: {
        value: material.effect.enabled,
        label: 'Enable Overlay',
        onChange: (value: boolean) => updateMaterialEffect(materialId, { enabled: value }),
      },
      ...(atlasLoaded
        ? {
            rows: {
              value: material.effect.gridY,
              min: 1,
              max: 32,
              step: 1,
              onChange: (value: number) => updateMaterialEffect(materialId, { gridY: value }),
            },
            columns: {
              value: material.effect.gridX,
              min: 1,
              max: 32,
              step: 1,
              onChange: (value: number) => updateMaterialEffect(materialId, { gridX: value }),
            },
            totalFrames: {
              value: material.effect.frameCount,
              min: 1,
              max: 128,
              step: 1,
              onChange: (value: number) => updateMaterialEffect(materialId, { frameCount: value }),
            },
            fps: {
              value: material.effect.fps,
              min: 1,
              max: 60,
              step: 1,
              onChange: (value: number) => updateMaterialEffect(materialId, { fps: value }),
            },
            loop: {
              value: material.effect.loop,
              onChange: (value: boolean) => updateMaterialEffect(materialId, { loop: value }),
            },
            currentFrame: {
              value: material.effect.currentFrame,
              min: 0,
              max: Math.max(0, material.effect.frameCount - 1),
              step: 1,
              onChange: (value: number) => updateMaterialEffect(materialId, { currentFrame: value, play: false }),
            },
            uvChannel: {
              value: material.effect.uvChannel,
              options: {
                Auto: 'auto',
                Normal: 'normal',
                BaseColor: 'baseColor',
                Emissive: 'emissive',
                UV: 'uv',
                UV2: 'uv2',
              },
              onChange: (value: NonNullable<typeof material.effect.uvChannel>) =>
                updateMaterialEffect(materialId, { uvChannel: value }),
            },
            blend: {
              value: material.effect.frameBlend,
              onChange: (value: boolean) => updateMaterialEffect(materialId, { frameBlend: value }),
            },
            emissiveStrength: {
              value: material.effect.opacity,
              min: 0,
              max: 1,
              step: 0.01,
              onChange: (value: number) => updateMaterialEffect(materialId, { opacity: value }),
            },
          }
        : {}),
    }),
    { store },
    [atlasLoaded, material, materialId, updateMaterialEffect],
  )

  return (
    <SectionPanel title="Animated Overlay">
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
      {atlasLoaded ? <AtlasVisualizer materialId={materialId} embedded /> : null}
      <LevaSection store={store} />
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

export function InspectorContent() {
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const sceneGraph = useEditorStore((state) => state.sceneGraph)

  if (!selectedObjectId) return null

  const selectedNode = sceneGraph[selectedObjectId]
  if (!selectedNode) return null

  if (selectedNode.type === 'light') {
    return (
      <>
        <LightSection objectId={selectedNode.id} />
      </>
    )
  }

  const selectedMaterialId =
    selectedNode.type === 'material'
      ? selectedNode.id
      : selectedNode.type === 'mesh'
        ? selectedNode.children.find((childId) => sceneGraph[childId]?.type === 'material') ?? null
        : null

  return (
    <>
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
