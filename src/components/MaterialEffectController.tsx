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
  roughness?: number
  clearcoat?: number
  bumpScale?: number
  normalScale?: THREE.Vector2
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
    rainImpactHeightCanvas?: HTMLCanvasElement
    rainImpactHeightContext?: CanvasRenderingContext2D | null
    rainImpactHeightTexture?: THREE.CanvasTexture
    rainImpactOriginalBumpScale?: number
    rainImpactOriginalNormalScale?: [number, number]
    rainImpactOriginalRoughness?: number
    rainImpactOriginalClearcoat?: number
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
    | 'rainImpactOpacity'
    | 'rainImpactNormalStrength'
    | 'rainImpactWetness'
    | 'rainImpactNoise'
    | 'rainImpactFlow'
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
  const visibleImpact =
    effect.rainImpactStrength > 0 ||
    effect.rainImpactOpacity > 0 ||
    effect.rainImpactNormalStrength > 0 ||
    effect.rainImpactWetness > 0 ||
    effect.rainImpactNoise > 0
  if (!effect.rainImpactsAdded || !effect.rainImpactsEnabled || effect.rainImpactCount <= 0 || !visibleImpact) {
    return 0
  }

  return Math.min(Math.max(1, effect.rainImpactCount), 32)
}

function getRainImpactSignature(effect: RainImpactMaterialState['effect']) {
  const activeCount = getRainImpactActiveCount(effect)
  return [
    RAIN_IMPACT_SHADER_VERSION,
    activeCount,
    effect.rainImpactSize.toFixed(4),
    effect.rainImpactStrength.toFixed(4),
    effect.rainImpactOpacity.toFixed(4),
    effect.rainImpactNormalStrength.toFixed(4),
    effect.rainImpactWetness.toFixed(4),
    effect.rainImpactNoise.toFixed(4),
    effect.rainImpactFlow.toFixed(4),
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

function rainImpactSignedNoise(x: number, y: number, seed: number) {
  return rainImpactHash(x, y, seed) * 2 - 1
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
  if (!material.userData.rainImpactHeightCanvas) {
    material.userData.rainImpactHeightCanvas = document.createElement('canvas')
  }

  const canvas = material.userData.rainImpactCanvas
  const heightCanvas = material.userData.rainImpactHeightCanvas
  if (!currentSize || currentSize[0] !== width || currentSize[1] !== height) {
    canvas.width = width
    canvas.height = height
    heightCanvas.width = width
    heightCanvas.height = height
    material.userData.rainImpactCanvasSize = [width, height]
  }

  if (!material.userData.rainImpactContext) {
    material.userData.rainImpactContext = canvas.getContext('2d')
  }
  if (!material.userData.rainImpactHeightContext) {
    material.userData.rainImpactHeightContext = heightCanvas.getContext('2d')
  }

  let texture = material.userData.rainImpactTexture
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas)
    material.userData.rainImpactTexture = texture
  }
  let heightTexture = material.userData.rainImpactHeightTexture
  if (!heightTexture) {
    heightTexture = new THREE.CanvasTexture(heightCanvas)
    heightTexture.colorSpace = THREE.NoColorSpace
    heightTexture.generateMipmaps = false
    material.userData.rainImpactHeightTexture = heightTexture
  }

  if (material.userData.rainImpactSourceTexture !== baseTexture) {
    copyTextureSampling(texture, baseTexture)
    copyTextureSampling(heightTexture, baseTexture)
    heightTexture.colorSpace = THREE.NoColorSpace
    heightTexture.generateMipmaps = false
    material.userData.rainImpactSourceTexture = baseTexture
  }

  return {
    canvas,
    heightCanvas,
    context: material.userData.rainImpactContext,
    heightContext: material.userData.rainImpactHeightContext,
    texture,
    heightTexture,
  }
}

function ensureRainImpactMaterialBackups(material: RuntimeMaterial) {
  if (material.userData.rainImpactOriginalBumpScale == null && material.bumpScale != null) {
    material.userData.rainImpactOriginalBumpScale = material.bumpScale
  }
  if (material.userData.rainImpactOriginalNormalScale == null && material.normalScale) {
    material.userData.rainImpactOriginalNormalScale = [material.normalScale.x, material.normalScale.y]
  }
  if (material.userData.rainImpactOriginalRoughness == null && material.roughness != null) {
    material.userData.rainImpactOriginalRoughness = material.roughness
  }
  if (material.userData.rainImpactOriginalClearcoat == null && material.clearcoat != null) {
    material.userData.rainImpactOriginalClearcoat = material.clearcoat
  }
}

function applyRainImpactMaterialResponse(
  material: RuntimeMaterial,
  effect: RainImpactMaterialState['effect'],
  heightTexture: THREE.CanvasTexture,
  elapsed: number,
  hasBaseNormalMap: boolean,
) {
  ensureRainImpactMaterialBackups(material)

  if (effect.rainImpactNormalStrength > 0) {
    if (material.normalMap !== heightTexture) {
      material.normalMap = heightTexture
      material.needsUpdate = true
    }
    if (material.normalScale) {
      const originalNormalScale = material.userData.rainImpactOriginalNormalScale
      if (originalNormalScale) {
        const boost = hasBaseNormalMap ? 1 : 0.65 + effect.rainImpactNormalStrength * 0.85
        material.normalScale.set(originalNormalScale[0] * boost, originalNormalScale[1] * boost)
      } else {
        material.normalScale.setScalar(0.65 + effect.rainImpactNormalStrength * 0.85)
      }
    }
  } else if (material.normalMap === heightTexture) {
    material.normalMap = material.userData.originalTextureSlots?.normalMap ?? null
    const originalNormalScale = material.userData.rainImpactOriginalNormalScale
    if (material.normalScale && originalNormalScale) {
      material.normalScale.set(originalNormalScale[0], originalNormalScale[1])
    }
    material.needsUpdate = true
  }

  if (material.roughness != null) {
    const originalRoughness = material.userData.rainImpactOriginalRoughness ?? material.roughness
    const shimmer = 1 - effect.rainImpactNoise * 0.08 * (0.5 + 0.5 * Math.sin(elapsed * (1.7 + effect.rainImpactFlow)))
    const wetTarget = Math.max(0.08, originalRoughness * 0.42 * shimmer)
    material.roughness = THREE.MathUtils.lerp(originalRoughness, wetTarget, effect.rainImpactWetness)
  }

  if (material.clearcoat != null) {
    const originalClearcoat = material.userData.rainImpactOriginalClearcoat ?? material.clearcoat
    material.clearcoat = THREE.MathUtils.lerp(originalClearcoat, Math.max(originalClearcoat, 0.65), effect.rainImpactWetness)
  }
}

function drawSoftWetSpot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  ratio: number,
  rotation: number,
  innerColor: string,
  outerColor: string,
) {
  context.save()
  context.translate(x, y)
  context.rotate(rotation)
  context.scale(1, ratio)
  const gradient = context.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(1, outerColor)
  context.fillStyle = gradient
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function drawRainNormalArcRing(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  width: number,
  alpha: number,
  phase = 0,
) {
  const segments = 36
  const strength = Math.min(96, 34 + alpha * 88)
  context.lineWidth = width
  context.lineCap = 'round'

  for (let segment = 0; segment < segments; segment += 1) {
    const start = (segment / segments) * Math.PI * 2
    const end = ((segment + 0.72) / segments) * Math.PI * 2
    const angle = (start + end) * 0.5 + phase
    const wave = 0.72 + 0.28 * Math.sin(angle * 5 + phase * 2.3)
    const red = Math.round(128 + Math.cos(angle) * strength * wave)
    const green = Math.round(128 + Math.sin(angle) * strength * wave)
    context.strokeStyle = `rgba(${red}, ${green}, 255, ${Math.min(1, alpha)})`
    context.beginPath()
    context.arc(x, y, radius, start, end)
    context.stroke()
  }
}

function drawRainNormalStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  angle: number,
  width: number,
  alpha: number,
) {
  const red = Math.round(128 + Math.cos(angle) * 74)
  const green = Math.round(128 + Math.sin(angle) * 74)
  context.strokeStyle = `rgba(${red}, ${green}, 255, ${Math.min(1, alpha)})`
  context.lineWidth = width
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(x - Math.cos(angle) * length * 0.5, y - Math.sin(angle) * length * 0.5)
  context.lineTo(x + Math.cos(angle) * length * 0.5, y + Math.sin(angle) * length * 0.5)
  context.stroke()
}

let rainNoiseColorCanvas: HTMLCanvasElement | null = null
let rainNoiseColorContext: CanvasRenderingContext2D | null = null
let rainNoiseNormalCanvas: HTMLCanvasElement | null = null
let rainNoiseNormalContext: CanvasRenderingContext2D | null = null

function ensureRainNoiseScratch(width: number, height: number) {
  if (!rainNoiseColorCanvas) {
    rainNoiseColorCanvas = document.createElement('canvas')
  }
  if (!rainNoiseNormalCanvas) {
    rainNoiseNormalCanvas = document.createElement('canvas')
  }

  if (rainNoiseColorCanvas.width !== width || rainNoiseColorCanvas.height !== height) {
    rainNoiseColorCanvas.width = width
    rainNoiseColorCanvas.height = height
  }
  if (rainNoiseNormalCanvas.width !== width || rainNoiseNormalCanvas.height !== height) {
    rainNoiseNormalCanvas.width = width
    rainNoiseNormalCanvas.height = height
  }

  rainNoiseColorContext ??= rainNoiseColorCanvas.getContext('2d')
  rainNoiseNormalContext ??= rainNoiseNormalCanvas.getContext('2d')

  if (!rainNoiseColorContext || !rainNoiseNormalContext) {
    return null
  }

  return {
    colorCanvas: rainNoiseColorCanvas,
    colorContext: rainNoiseColorContext,
    normalCanvas: rainNoiseNormalCanvas,
    normalContext: rainNoiseNormalContext,
  }
}

function drawRainWetNoiseLayer(
  context: CanvasRenderingContext2D,
  normalContext: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effect: RainImpactMaterialState['effect'],
  elapsed: number,
  seed: number,
) {
  const wetness = Math.min(Math.max(effect.rainImpactWetness, 0), 1)
  const noise = Math.min(Math.max(effect.rainImpactNoise, 0), 1)
  if (wetness <= 0 || noise <= 0) {
    return
  }

  const flow = Math.min(Math.max(effect.rainImpactFlow, 0), 3)
  const baseAlpha = wetness * noise
  const scratchWidth = 192
  const scratchHeight = Math.max(96, Math.round(scratchWidth * (canvas.height / canvas.width)))
  const scratch = ensureRainNoiseScratch(scratchWidth, scratchHeight)

  if (!scratch) {
    return
  }

  const colorImage = scratch.colorContext.createImageData(scratchWidth, scratchHeight)
  const normalImage = scratch.normalContext.createImageData(scratchWidth, scratchHeight)
  const colorData = colorImage.data
  const normalData = normalImage.data
  const phase = elapsed * (0.75 + flow * 2.25)
  const detailPhase = elapsed * (1.5 + flow * 4.15)
  const normalAmount = (18 + effect.rainImpactNormalStrength * 28) * noise

  for (let y = 0; y < scratchHeight; y += 1) {
    for (let x = 0; x < scratchWidth; x += 1) {
      const index = (y * scratchWidth + x) * 4
      const staticA = rainImpactHash(x * 0.23 + 1.7, y * 0.31 + 4.1, seed)
      const staticB = rainImpactHash(x * 0.71 + 8.2, y * 0.47 + 2.9, seed)
      const waveA = Math.sin(phase + x * 0.22 + y * 0.13 + staticA * Math.PI * 2)
      const waveB = Math.sin(detailPhase - x * 0.37 + y * 0.29 + staticB * Math.PI * 2)
      const waveC = Math.sin(phase * 0.54 + (x + y) * 0.09 + staticA * 4.7)
      const value = Math.max(0, waveA * 0.48 + waveB * 0.34 + waveC * 0.18)
      const wetValue = Math.pow(value, 1.45)
      const alpha = Math.min(120, baseAlpha * wetValue * (44 + noise * 84))

      colorData[index] = 180
      colorData[index + 1] = 222
      colorData[index + 2] = 235
      colorData[index + 3] = alpha

      const normalX = Math.sin(phase * 1.14 + x * 0.41 + staticA * Math.PI * 2)
      const normalY = Math.cos(detailPhase * 0.9 + y * 0.43 + staticB * Math.PI * 2)
      normalData[index] = Math.max(0, Math.min(255, 128 + normalX * normalAmount * wetValue))
      normalData[index + 1] = Math.max(0, Math.min(255, 128 + normalY * normalAmount * wetValue))
      normalData[index + 2] = 255
      normalData[index + 3] = Math.min(150, baseAlpha * wetValue * (52 + noise * 96))
    }
  }

  scratch.colorContext.putImageData(colorImage, 0, 0)
  scratch.normalContext.putImageData(normalImage, 0, 0)

  context.save()
  normalContext.save()
  context.imageSmoothingEnabled = true
  normalContext.imageSmoothingEnabled = true
  context.globalCompositeOperation = 'screen'
  normalContext.globalCompositeOperation = 'source-over'
  context.drawImage(scratch.colorCanvas, 0, 0, canvas.width, canvas.height)
  normalContext.drawImage(scratch.normalCanvas, 0, 0, canvas.width, canvas.height)
  context.restore()
  normalContext.restore()
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
  const baseNormalTexture = getSelectedTexture(material, materialState.textureSlots.normalMap, 'normalMap')
  const baseNormalImage = getRainImpactImageSource(baseNormalTexture)

  if (!baseTexture || !baseImage || activeCount <= 0) {
    removeRainImpactCanvas(material)
    return
  }

  const resources = ensureRainImpactCanvas(material, baseTexture, baseImage.width, baseImage.height)
  const { canvas, heightCanvas, context, heightContext, texture, heightTexture } = resources
  if (!context || !heightContext) {
    removeRainImpactCanvas(material)
    return
  }
  if (baseNormalTexture) {
    copyTextureSampling(heightTexture, baseNormalTexture)
    heightTexture.colorSpace = THREE.NoColorSpace
    heightTexture.generateMipmaps = false
  }

  try {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(baseImage.source, 0, 0, canvas.width, canvas.height)
  } catch {
    removeRainImpactCanvas(material)
    return
  }

  let hasBaseNormalMap = false
  heightContext.clearRect(0, 0, heightCanvas.width, heightCanvas.height)
  if (baseNormalImage) {
    try {
      heightContext.drawImage(baseNormalImage.source, 0, 0, heightCanvas.width, heightCanvas.height)
      hasBaseNormalMap = true
    } catch {
      hasBaseNormalMap = false
    }
  }
  if (!hasBaseNormalMap) {
    heightContext.fillStyle = 'rgb(128, 128, 255)'
    heightContext.fillRect(0, 0, heightCanvas.width, heightCanvas.height)
  }

  const lifetime = Math.max(effect.rainImpactLifetime, 0.001)
  const time = elapsed / lifetime
  const minSide = Math.min(canvas.width, canvas.height)
  const strength = Math.min(Math.max(effect.rainImpactStrength, 0), 2)
  const opacity = Math.min(Math.max(effect.rainImpactOpacity, 0), 1)
  const normalStrength = Math.min(Math.max(effect.rainImpactNormalStrength, 0), 2)
  const seed = getRainImpactSeed(materialState.id)

  drawRainWetNoiseLayer(context, heightContext, canvas, effect, elapsed, seed)

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  heightContext.save()
  heightContext.lineCap = 'round'
  heightContext.lineJoin = 'round'

  for (let index = 0; index < activeCount; index += 1) {
    const slot = index
    const rainTime = time + slot * 0.417
    const age = rainTime - Math.floor(rainTime)
    const cycle = Math.floor(rainTime)
    const x = rainImpactHash(slot + 0.13, cycle + 1.91, seed) * canvas.width
    const y = rainImpactHash(slot + 9.77, cycle + 5.31, seed) * canvas.height
    const radius = effect.rainImpactSize * (0.18 + (1.45 - 0.18) * age) * minSide
    const fade = Math.pow(1 - age, 1.35)
    const alpha = Math.min(0.9, fade * (0.26 + strength * 0.34) * opacity)
    const width = Math.max(1.5, effect.rainImpactSize * minSide * 0.065)

    if (alpha > 0) {
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

    if (normalStrength > 0) {
      const heightAlpha = Math.min(0.95, fade * (0.32 + normalStrength * 0.34))
      drawRainNormalArcRing(heightContext, x, y, radius, Math.max(1, width * 0.9), heightAlpha, age * Math.PI * 0.6)
      drawRainNormalArcRing(
        heightContext,
        x,
        y,
        radius + width * 0.95,
        Math.max(1, width * 0.42),
        heightAlpha * 0.58,
        Math.PI + age * Math.PI * 0.45,
      )
    }
  }

  context.restore()
  heightContext.restore()
  texture.needsUpdate = true
  heightTexture.needsUpdate = true
  if (material.map !== texture) {
    material.map = texture
    material.needsUpdate = true
  }
  applyRainImpactMaterialResponse(material, effect, heightTexture, elapsed, hasBaseNormalMap)
}

function removeRainImpactCanvas(material: RuntimeMaterial) {
  const rainTexture = material.userData.rainImpactTexture
  const heightTexture = material.userData.rainImpactHeightTexture
  if (!rainTexture && !heightTexture) {
    return
  }

  if (material.map === rainTexture) {
    material.map = material.userData.rainImpactSourceTexture ?? material.userData.originalTextureSlots?.map ?? null
  }
  if (material.normalMap === heightTexture) {
    material.normalMap = material.userData.originalTextureSlots?.normalMap ?? null
  }
  if (material.bumpMap === heightTexture) {
    material.bumpMap = material.userData.originalTextureSlots?.bumpMap ?? null
  }
  if (material.userData.rainImpactOriginalBumpScale != null) {
    material.bumpScale = material.userData.rainImpactOriginalBumpScale
  }
  if (material.userData.rainImpactOriginalNormalScale && material.normalScale) {
    material.normalScale.set(
      material.userData.rainImpactOriginalNormalScale[0],
      material.userData.rainImpactOriginalNormalScale[1],
    )
  }
  if (material.userData.rainImpactOriginalRoughness != null && material.roughness != null) {
    material.roughness = material.userData.rainImpactOriginalRoughness
  }
  if (material.userData.rainImpactOriginalClearcoat != null && material.clearcoat != null) {
    material.clearcoat = material.userData.rainImpactOriginalClearcoat
  }

  rainTexture?.dispose()
  heightTexture?.dispose()
  delete material.userData.rainImpactTexture
  delete material.userData.rainImpactCanvas
  delete material.userData.rainImpactContext
  delete material.userData.rainImpactSourceTexture
  delete material.userData.rainImpactCanvasSize
  delete material.userData.rainImpactHeightTexture
  delete material.userData.rainImpactHeightCanvas
  delete material.userData.rainImpactHeightContext
  delete material.userData.rainImpactOriginalBumpScale
  delete material.userData.rainImpactOriginalNormalScale
  delete material.userData.rainImpactOriginalRoughness
  delete material.userData.rainImpactOriginalClearcoat
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
