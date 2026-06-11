import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  MATERIAL_TEXTURE_SLOTS,
  type AtlasEffectState,
  type MaterialTextureSlot,
  useEditorStore,
} from '../store/editorStore'
import { useAtlasAnimator } from '../features/atlas/useAtlasAnimator'

type RuntimeMaterial = THREE.Material & {
  needsUpdate: boolean
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  aoMap?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  alphaMap?: THREE.Texture | null
  bumpMap?: THREE.Texture | null
  displacementMap?: THREE.Texture | null
  specularMap?: THREE.Texture | null
  emissive?: THREE.Color
  defines?: Record<string, unknown>
  onBeforeCompile: THREE.Material['onBeforeCompile']
  customProgramCacheKey: THREE.Material['customProgramCacheKey']
  userData: THREE.Material['userData'] & {
    originalTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    customTextureSlots?: Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
    flipbookOriginalEmissiveHex?: number
    rainImpactOriginalOnBeforeCompile?: THREE.Material['onBeforeCompile']
    rainImpactOriginalCustomProgramCacheKey?: THREE.Material['customProgramCacheKey']
    rainImpactOriginalDefines?: Record<string, unknown> | null
    rainImpactUniforms?: RainImpactUniforms
    rainImpactSignature?: string
    rainImpactPatched?: boolean
    rainImpactCanvas?: HTMLCanvasElement
    rainImpactContext?: CanvasRenderingContext2D | null
    rainImpactTexture?: THREE.CanvasTexture
    rainImpactSourceTexture?: THREE.Texture | null
    rainImpactCanvasSize?: [number, number]
  }
}

type RainImpactUniforms = {
  uRainTime: { value: number }
  uRainImpactCount: { value: number }
  uRainImpactSize: { value: number }
  uRainImpactStrength: { value: number }
  uRainImpactSeed: { value: number }
}

type RainImpactMaterialState = {
  id: string
  meshIds: string[]
  textureSlots: Record<
    MaterialTextureSlot,
    {
      selectedSource: 'original' | 'custom' | null
      originalLabel: string | null
      originalUrl?: string | null
    }
  >
  effect: Pick<
    AtlasEffectState,
    | 'rainImpactsAdded'
    | 'rainImpactsEnabled'
    | 'rainImpactRate'
    | 'rainImpactSize'
    | 'rainImpactStrength'
    | 'rainImpactLifetime'
    | 'rainImpactCount'
  >
}

const RAIN_IMPACT_SHADER_VERSION = 'rain-impacts-v2'

function getTextureSourceUrl(texture: THREE.Texture) {
  const imageSource = texture.source?.data as { currentSrc?: string; src?: string } | undefined
  const sourceUrl = imageSource?.currentSrc || imageSource?.src
  return typeof sourceUrl === 'string' && sourceUrl ? sourceUrl : null
}

function getTextureDisplayName(texture: THREE.Texture, fallback: string) {
  const explicitName = texture.name?.trim()
  if (explicitName) {
    return explicitName
  }

  const sourceUrl = getTextureSourceUrl(texture)
  if (sourceUrl) {
    const sanitized = sourceUrl.split('#')[0]?.split('?')[0] ?? sourceUrl
    const pieces = sanitized.split(/[\\/]/)
    const fileName = pieces[pieces.length - 1]
    if (fileName) {
      return decodeURIComponent(fileName)
    }
  }

  return fallback
}

function textureMatchesOriginalSlot(
  texture: THREE.Texture | null | undefined,
  textureState: RainImpactMaterialState['textureSlots'][MaterialTextureSlot],
  slot: MaterialTextureSlot,
) {
  if (!texture) {
    return false
  }

  const sourceUrl = getTextureSourceUrl(texture)
  if (textureState.originalUrl && sourceUrl === textureState.originalUrl) {
    return true
  }

  if (!textureState.originalLabel) {
    return false
  }

  return getTextureDisplayName(texture, `${slot} Texture`) === textureState.originalLabel
}

const RAIN_IMPACT_SHADER_HEADER = `
uniform float uRainTime;
uniform float uRainImpactCount;
uniform float uRainImpactSize;
uniform float uRainImpactStrength;
uniform float uRainImpactSeed;

float rainImpactHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 rainImpactHash2(vec2 p) {
  return vec2(
    rainImpactHash(p + uRainImpactSeed),
    rainImpactHash(p + uRainImpactSeed + 19.19)
  );
}

vec3 rainImpactSample(vec2 uv) {
  vec2 rainImpactSlope = vec2(0.0);
  float rainImpactMask = 0.0;
  for (int rainImpactIndex = 0; rainImpactIndex < 32; rainImpactIndex++) {
    float rainImpactSlot = float(rainImpactIndex);
    float rainImpactEnabled = step(rainImpactSlot + 0.5, uRainImpactCount);
    float rainImpactTime = uRainTime + rainImpactSlot * 0.417;
    float rainImpactAge = fract(rainImpactTime);
    float rainImpactCycle = floor(rainImpactTime);
    vec2 rainImpactCenter = rainImpactHash2(vec2(rainImpactSlot, rainImpactCycle));
    vec2 rainImpactDelta = uv - rainImpactCenter;
    float rainImpactDistance = length(rainImpactDelta);
    float rainImpactRadius = uRainImpactSize * mix(0.16, 1.42, rainImpactAge);
    float rainImpactWidth = max(uRainImpactSize * 0.16, 0.006);
    float rainImpactRing = 1.0 - smoothstep(
      rainImpactWidth * 0.35,
      rainImpactWidth,
      abs(rainImpactDistance - rainImpactRadius)
    );
    float rainImpactFade = pow(1.0 - rainImpactAge, 1.45) * rainImpactEnabled;
    float rainImpactWave = 0.65 + 0.35 * sin((rainImpactDistance - rainImpactRadius) * 120.0);
    vec2 rainImpactDirection = rainImpactDistance > 0.0001 ? rainImpactDelta / rainImpactDistance : vec2(0.0);
    float rainImpactContribution = rainImpactRing * rainImpactFade;
    rainImpactSlope += rainImpactDirection * rainImpactContribution * rainImpactWave;
    rainImpactMask = max(rainImpactMask, rainImpactContribution);
  }
  return vec3(rainImpactSlope, rainImpactMask);
}
`

const RAIN_IMPACT_VERTEX_PARS_CHUNK = `
varying vec2 vRainImpactUv;
`

const RAIN_IMPACT_VERTEX_CHUNK = `
vRainImpactUv = uv;
`

const RAIN_IMPACT_FRAGMENT_PARS_CHUNK = `
varying vec2 vRainImpactUv;
`

const RAIN_IMPACT_NORMAL_CHUNK = `
vec3 rainImpactNormalSample = rainImpactSample(vRainImpactUv);
normal = normalize(normal + vec3(rainImpactNormalSample.xy * uRainImpactStrength, 0.0));
`

const RAIN_IMPACT_COLOR_CHUNK = `
vec3 rainImpactColorSample = rainImpactSample(vRainImpactUv);
float rainImpactWetMask = clamp(rainImpactColorSample.z * uRainImpactStrength, 0.0, 1.0);
vec3 rainImpactWetColor = diffuseColor.rgb * 0.72 + vec3(0.055, 0.075, 0.085);
vec3 rainImpactEdgeColor = mix(diffuseColor.rgb, vec3(1.0), 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, rainImpactWetColor, rainImpactWetMask * 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, rainImpactEdgeColor, rainImpactWetMask * 0.28);
`

function getRainImpactActiveCount(effect: RainImpactMaterialState['effect']) {
  if (!effect.rainImpactsAdded || !effect.rainImpactsEnabled || effect.rainImpactRate <= 0 || effect.rainImpactStrength <= 0) {
    return 0
  }

  return Math.min(
    Math.max(1, Math.ceil(effect.rainImpactRate * effect.rainImpactLifetime)),
    Math.min(Math.max(1, effect.rainImpactCount), 32),
  )
}

function getRainImpactSignature(effect: RainImpactMaterialState['effect']) {
  const activeCount = getRainImpactActiveCount(effect)
  return [
    RAIN_IMPACT_SHADER_VERSION,
    activeCount,
    effect.rainImpactSize.toFixed(4),
    effect.rainImpactStrength.toFixed(4),
  ].join(':')
}

function createRainImpactUniforms(materialId: string, effect: RainImpactMaterialState['effect']): RainImpactUniforms {
  const activeCount = getRainImpactActiveCount(effect)
  let seed = 0
  for (let index = 0; index < materialId.length; index += 1) {
    seed = (seed * 31 + materialId.charCodeAt(index)) % 9973
  }

  return {
    uRainTime: { value: 0 },
    uRainImpactCount: { value: activeCount },
    uRainImpactSize: { value: effect.rainImpactSize },
    uRainImpactStrength: { value: effect.rainImpactStrength },
    uRainImpactSeed: { value: seed / 9973 },
  }
}

function hasRainImpactUvTarget(materialState: RainImpactMaterialState) {
  const store = useEditorStore.getState()
  return materialState.meshIds.some((meshId) => {
    const object = store.runtime.objectById[meshId]
    if (!object || !(object as THREE.Mesh).isMesh) {
      return false
    }

    const geometry = (object as THREE.Mesh).geometry
    return Boolean(geometry?.getAttribute('uv'))
  })
}

function updateRainImpactUniforms(material: RuntimeMaterial, effect: RainImpactMaterialState['effect'], elapsed: number) {
  const uniforms = material.userData.rainImpactUniforms
  if (!uniforms) {
    return
  }

  const cycleDuration = Math.max(effect.rainImpactLifetime, 0.001)
  uniforms.uRainTime.value = elapsed / cycleDuration
  uniforms.uRainImpactCount.value = getRainImpactActiveCount(effect)
  uniforms.uRainImpactSize.value = effect.rainImpactSize
  uniforms.uRainImpactStrength.value = effect.rainImpactStrength
}

function removeRainImpactShader(material: RuntimeMaterial) {
  if (!material.userData.rainImpactPatched) {
    return
  }

  material.onBeforeCompile = material.userData.rainImpactOriginalOnBeforeCompile ?? (() => {})
  material.customProgramCacheKey = material.userData.rainImpactOriginalCustomProgramCacheKey ?? (() => '')
  material.defines = material.userData.rainImpactOriginalDefines
    ? { ...material.userData.rainImpactOriginalDefines }
    : undefined
  delete material.userData.rainImpactOriginalOnBeforeCompile
  delete material.userData.rainImpactOriginalCustomProgramCacheKey
  delete material.userData.rainImpactOriginalDefines
  delete material.userData.rainImpactUniforms
  delete material.userData.rainImpactSignature
  delete material.userData.rainImpactPatched
  material.needsUpdate = true
}

function applyRainImpactShader(material: RuntimeMaterial, materialState: RainImpactMaterialState) {
  const effect = materialState.effect
  const activeCount = getRainImpactActiveCount(effect)

  if (!effect.rainImpactsAdded || !effect.rainImpactsEnabled || activeCount <= 0 || !hasRainImpactUvTarget(materialState)) {
    removeRainImpactShader(material)
    return
  }

  const signature = getRainImpactSignature(effect)
  if (material.userData.rainImpactPatched && material.userData.rainImpactSignature === signature) {
    return
  }

  if (!material.userData.rainImpactPatched) {
    material.userData.rainImpactOriginalOnBeforeCompile = material.onBeforeCompile
    material.userData.rainImpactOriginalCustomProgramCacheKey = material.customProgramCacheKey
    material.userData.rainImpactOriginalDefines = material.defines ? { ...material.defines } : null
  }

  const previousOnBeforeCompile = material.userData.rainImpactOriginalOnBeforeCompile ?? (() => {})
  const previousCustomProgramCacheKey = material.userData.rainImpactOriginalCustomProgramCacheKey ?? (() => '')
  const uniforms = material.userData.rainImpactUniforms ?? createRainImpactUniforms(materialState.id, effect)
  material.userData.rainImpactUniforms = uniforms
  updateRainImpactUniforms(material, effect, 0)

  material.defines = material.userData.rainImpactOriginalDefines
    ? { ...material.userData.rainImpactOriginalDefines }
    : undefined

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_pars_vertex>', `#include <uv_pars_vertex>\n${RAIN_IMPACT_VERTEX_PARS_CHUNK}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${RAIN_IMPACT_VERTEX_CHUNK}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RAIN_IMPACT_SHADER_HEADER}`)
      .replace('#include <uv_pars_fragment>', `#include <uv_pars_fragment>\n${RAIN_IMPACT_FRAGMENT_PARS_CHUNK}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${RAIN_IMPACT_COLOR_CHUNK}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${RAIN_IMPACT_NORMAL_CHUNK}`)
  }

  material.customProgramCacheKey = () => `${previousCustomProgramCacheKey()}:rain-impacts:${signature}`
  material.userData.rainImpactSignature = signature
  material.userData.rainImpactPatched = true
  material.needsUpdate = true
}

function ensureMaterialTextureBackup(
  material: RuntimeMaterial,
  materialState?: {
    textureSlots: RainImpactMaterialState['textureSlots']
  },
) {
  if (!material.userData.originalTextureSlots) {
    material.userData.originalTextureSlots = Object.fromEntries(
      MATERIAL_TEXTURE_SLOTS.map((slot) => [slot, material[slot] ?? null]),
    ) as Partial<Record<MaterialTextureSlot, THREE.Texture | null>>
  }

  material.userData.customTextureSlots ??= {}

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    const currentTexture = material[slot] ?? null
    const customTexture = material.userData.customTextureSlots?.[slot] ?? null
    const textureState = materialState?.textureSlots[slot]
    const currentMatchesOriginal = textureState
      ? textureMatchesOriginalSlot(currentTexture, textureState, slot)
      : Boolean(currentTexture)
    const backupMatchesOriginal = textureState
      ? textureMatchesOriginalSlot(material.userData.originalTextureSlots?.[slot], textureState, slot)
      : Boolean(material.userData.originalTextureSlots?.[slot])

    if (
      currentTexture &&
      currentTexture !== customTexture &&
      currentMatchesOriginal &&
      (!backupMatchesOriginal || material.userData.originalTextureSlots?.[slot] === customTexture)
    ) {
      material.userData.originalTextureSlots![slot] = currentTexture
    }
  })
}

function getSelectedTexture(
  material: RuntimeMaterial,
  textureState: {
    selectedSource: 'original' | 'custom' | null
  },
  slot: MaterialTextureSlot,
) {
  const originalTexture = material.userData.originalTextureSlots?.[slot] ?? null
  const customTexture = material.userData.customTextureSlots?.[slot] ?? null

  if (textureState.selectedSource === 'custom' && customTexture) {
    return customTexture
  }

  if (textureState.selectedSource === 'original' && originalTexture) {
    return originalTexture
  }

  return customTexture ?? originalTexture ?? null
}

function getRainImpactImageSource(texture: THREE.Texture | null | undefined) {
  const source = (texture?.source?.data ?? texture?.image) as
    | (CanvasImageSource & {
        width?: number
        height?: number
        naturalWidth?: number
        naturalHeight?: number
        videoWidth?: number
        videoHeight?: number
      })
    | undefined

  if (!source) {
    return null
  }

  const width = source.naturalWidth ?? source.videoWidth ?? source.width ?? 0
  const height = source.naturalHeight ?? source.videoHeight ?? source.height ?? 0
  if (!width || !height) {
    return null
  }

  return {
    source,
    width,
    height,
  }
}

function copyTextureSampling(target: THREE.Texture, source: THREE.Texture) {
  target.colorSpace = source.colorSpace
  target.flipY = source.flipY
  target.wrapS = source.wrapS
  target.wrapT = source.wrapT
  target.minFilter = source.minFilter
  target.magFilter = source.magFilter
  target.generateMipmaps = source.generateMipmaps
  target.anisotropy = source.anisotropy
  target.rotation = source.rotation
  target.channel = source.channel
  target.offset.copy(source.offset)
  target.repeat.copy(source.repeat)
  target.center.copy(source.center)
}

function rainImpactHash(x: number, y: number, seed: number) {
  const dot = x * 127.1 + y * 311.7 + seed * 74.7
  return Math.sin(dot) * 43758.5453123 - Math.floor(Math.sin(dot) * 43758.5453123)
}

function getRainImpactSeed(materialId: string) {
  let seed = 0
  for (let index = 0; index < materialId.length; index += 1) {
    seed = (seed * 31 + materialId.charCodeAt(index)) % 9973
  }
  return seed / 9973
}

function ensureRainImpactCanvas(
  material: RuntimeMaterial,
  baseTexture: THREE.Texture,
  sourceWidth: number,
  sourceHeight: number,
) {
  const maxSide = 1024
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(2, Math.round(sourceWidth * scale))
  const height = Math.max(2, Math.round(sourceHeight * scale))
  const currentSize = material.userData.rainImpactCanvasSize

  if (!material.userData.rainImpactCanvas) {
    material.userData.rainImpactCanvas = document.createElement('canvas')
  }

  const canvas = material.userData.rainImpactCanvas
  if (!currentSize || currentSize[0] !== width || currentSize[1] !== height) {
    canvas.width = width
    canvas.height = height
    material.userData.rainImpactCanvasSize = [width, height]
  }

  if (!material.userData.rainImpactContext) {
    material.userData.rainImpactContext = canvas.getContext('2d')
  }

  let texture = material.userData.rainImpactTexture
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas)
    material.userData.rainImpactTexture = texture
  }

  if (material.userData.rainImpactSourceTexture !== baseTexture) {
    copyTextureSampling(texture, baseTexture)
    material.userData.rainImpactSourceTexture = baseTexture
  }

  return {
    canvas,
    context: material.userData.rainImpactContext,
    texture,
  }
}

function drawRainImpactCanvas(
  material: RuntimeMaterial,
  materialState: RainImpactMaterialState,
  elapsed: number,
) {
  const effect = materialState.effect
  const activeCount = getRainImpactActiveCount(effect)
  const baseTexture = getSelectedTexture(material, materialState.textureSlots.map, 'map')
  const baseImage = getRainImpactImageSource(baseTexture)

  if (!baseTexture || !baseImage || activeCount <= 0) {
    removeRainImpactCanvas(material)
    return
  }

  const resources = ensureRainImpactCanvas(material, baseTexture, baseImage.width, baseImage.height)
  const { canvas, context, texture } = resources
  if (!context) {
    removeRainImpactCanvas(material)
    return
  }

  try {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(baseImage.source, 0, 0, canvas.width, canvas.height)
  } catch {
    removeRainImpactCanvas(material)
    return
  }

  const lifetime = Math.max(effect.rainImpactLifetime, 0.001)
  const time = elapsed / lifetime
  const minSide = Math.min(canvas.width, canvas.height)
  const strength = Math.min(Math.max(effect.rainImpactStrength, 0), 2)
  const seed = getRainImpactSeed(materialState.id)

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (let index = 0; index < activeCount; index += 1) {
    const slot = index
    const rainTime = time + slot * 0.417
    const age = rainTime - Math.floor(rainTime)
    const cycle = Math.floor(rainTime)
    const x = rainImpactHash(slot + 0.13, cycle + 1.91, seed) * canvas.width
    const y = rainImpactHash(slot + 9.77, cycle + 5.31, seed) * canvas.height
    const radius = effect.rainImpactSize * (0.18 + (1.45 - 0.18) * age) * minSide
    const fade = Math.pow(1 - age, 1.35)
    const alpha = Math.min(0.9, fade * (0.26 + strength * 0.34))
    const width = Math.max(1.5, effect.rainImpactSize * minSide * 0.065)

    context.globalCompositeOperation = 'source-over'
    context.strokeStyle = `rgba(8, 18, 24, ${alpha * 0.44})`
    context.lineWidth = width * 2.5
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = `rgba(220, 245, 255, ${alpha})`
    context.lineWidth = width
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.45})`
    context.lineWidth = Math.max(1, width * 0.38)
    context.beginPath()
    context.arc(x, y, radius + width * 0.9, 0, Math.PI * 2)
    context.stroke()
  }

  context.restore()
  texture.needsUpdate = true
  if (material.map !== texture) {
    material.map = texture
    material.needsUpdate = true
  }
}

function removeRainImpactCanvas(material: RuntimeMaterial) {
  const rainTexture = material.userData.rainImpactTexture
  if (!rainTexture) {
    return
  }

  if (material.map === rainTexture) {
    material.map = material.userData.rainImpactSourceTexture ?? material.userData.originalTextureSlots?.map ?? null
  }

  rainTexture.dispose()
  delete material.userData.rainImpactTexture
  delete material.userData.rainImpactCanvas
  delete material.userData.rainImpactContext
  delete material.userData.rainImpactSourceTexture
  delete material.userData.rainImpactCanvasSize
  material.needsUpdate = true
}

function restoreMaterialTextureSelections(
  material: RuntimeMaterial,
  materialState: {
    textureSlots: RainImpactMaterialState['textureSlots']
  },
) {
  ensureMaterialTextureBackup(material, materialState)

  MATERIAL_TEXTURE_SLOTS.forEach((slot) => {
    material[slot] = getSelectedTexture(material, materialState.textureSlots[slot], slot)
  })

  if (material.emissive && material.userData.flipbookOriginalEmissiveHex != null) {
    material.emissive.setHex(material.userData.flipbookOriginalEmissiveHex)
    delete material.userData.flipbookOriginalEmissiveHex
  }
}

function applyFlipbookSlotOverride(
  material: RuntimeMaterial,
  materialState: {
    textureSlots: RainImpactMaterialState['textureSlots']
    effect: {
      isAdded: boolean
      enabled: boolean
      targetSlot: 'emissive' | 'baseColor'
    }
  },
  atlasTexture: THREE.Texture | null,
  atlasFrameTexture: THREE.Texture | null,
) {
  if (!materialState.effect.isAdded || !materialState.effect.enabled || !atlasTexture) {
    restoreMaterialTextureSelections(material, materialState)
    material.needsUpdate = true
    return
  }

  if (!atlasFrameTexture) {
    return
  }

  restoreMaterialTextureSelections(material, materialState)

  const overrideTexture = atlasFrameTexture

  if (materialState.effect.targetSlot === 'baseColor') {
    material.map = overrideTexture
  } else {
    if (material.emissive) {
      if (material.userData.flipbookOriginalEmissiveHex == null) {
        material.userData.flipbookOriginalEmissiveHex = material.emissive.getHex()
      }

      if (material.emissive.getHex() === 0x000000) {
        material.emissive.setHex(0xffffff)
      }
    }

    material.emissiveMap = overrideTexture
  }

  material.needsUpdate = true
}

function hasFlipbookSlotOverride(
  material: RuntimeMaterial,
  materialState: {
    effect: {
      isAdded: boolean
      enabled: boolean
      targetSlot: 'emissive' | 'baseColor'
    }
  },
  atlasTexture: THREE.Texture | null,
  atlasFrameTexture: THREE.Texture | null,
) {
  if (!materialState.effect.isAdded || !materialState.effect.enabled || !atlasTexture) {
    return false
  }

  if (!atlasFrameTexture) {
    return false
  }

  const overrideTexture = atlasFrameTexture

  return materialState.effect.targetSlot === 'baseColor'
    ? material.map === overrideTexture
    : material.emissiveMap === overrideTexture
}

export function MaterialEffectController() {
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const materials = useEditorStore((state) => state.materials)
  const atlasTexture = useEditorStore((state) => state.runtimeTextures.atlasTexture)
  const atlasFrameTexture = useEditorStore((state) => state.runtimeTextures.atlasFrameTexture)
  const activeMaterialId = (() => {
    const selectedMaterial = selectedMaterialId ? materials[selectedMaterialId] : null
    if (selectedMaterial?.effect.isAdded && selectedMaterial.effect.enabled) {
      return selectedMaterialId
    }

    const fallbackMaterial = Object.values(materials).find(
      (material) => material.effect.isAdded && material.effect.enabled,
    )

    return fallbackMaterial?.id ?? null
  })()

  useAtlasAnimator(activeMaterialId)

  useEffect(() => {
    Object.values(materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id] as RuntimeMaterial | undefined
      if (!material) {
        return
      }

      if (materialState.id === activeMaterialId) {
        applyFlipbookSlotOverride(material, materialState, atlasTexture, atlasFrameTexture)
        removeRainImpactShader(material)
        drawRainImpactCanvas(material, materialState, 0)
        return
      }

      restoreMaterialTextureSelections(material, materialState)
      removeRainImpactShader(material)
      drawRainImpactCanvas(material, materialState, 0)
      material.needsUpdate = true
    })
  }, [activeMaterialId, atlasFrameTexture, atlasTexture, materials])

  useEffect(() => {
    return () => {
      const store = useEditorStore.getState()
      Object.values(store.materials).forEach((materialState) => {
        const material = store.runtime.materialById[materialState.id] as RuntimeMaterial | undefined
        if (!material) {
          return
        }

        restoreMaterialTextureSelections(material, materialState)
        removeRainImpactShader(material)
        removeRainImpactCanvas(material)
        material.needsUpdate = true
      })
    }
  }, [])

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    const store = useEditorStore.getState()
    const activeMaterialState = activeMaterialId ? store.materials[activeMaterialId] : null
    const activeMaterial = activeMaterialId
      ? (store.runtime.materialById[activeMaterialId] as RuntimeMaterial | undefined)
      : undefined

    if (
      activeMaterialId &&
      activeMaterialState &&
      activeMaterial &&
      !hasFlipbookSlotOverride(
        activeMaterial,
        activeMaterialState,
        store.runtimeTextures.atlasTexture,
        store.runtimeTextures.atlasFrameTexture,
      )
    ) {
      applyFlipbookSlotOverride(
        activeMaterial,
        activeMaterialState,
        store.runtimeTextures.atlasTexture,
        store.runtimeTextures.atlasFrameTexture,
      )
    }

    Object.values(useEditorStore.getState().materials).forEach((materialState) => {
      const material = useEditorStore.getState().runtime.materialById[materialState.id] as RuntimeMaterial | undefined
      if (!material) {
        return
      }

      if (materialState.effect.rainImpactsAdded && materialState.effect.rainImpactsEnabled) {
        removeRainImpactShader(material)
        drawRainImpactCanvas(material, materialState, elapsed)
      } else {
        removeRainImpactShader(material)
        removeRainImpactCanvas(material)
      }
    })
  })

  return null
}
