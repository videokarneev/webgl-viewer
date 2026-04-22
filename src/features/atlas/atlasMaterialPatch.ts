import * as THREE from 'three'
import type { AtlasEffectState } from '../../store/editorStore'

type AtlasShaderUniforms = {
  uAtlasTexture: { value: THREE.Texture | null }
  uAtlasOpacity: { value: number }
  uAtlasTransform: { value: THREE.Vector4 }
  uAtlasRotation: { value: number }
  uAtlasEnabled: { value: number }
  uAtlasTargetSlot: { value: number }
  uAtlasUvSource: { value: number }
  uAtlasOrder: { value: number }
  uAtlasWrapMode: { value: number }
  uAtlasSwapXY: { value: number }
}

type PatchableShader = {
  uniforms: Record<string, unknown> & Partial<AtlasShaderUniforms>
  vertexShader: string
  fragmentShader: string
}

type PatchedMaterial = THREE.Material & {
  onBeforeCompile: (shader: PatchableShader) => void
  customProgramCacheKey?: () => string
  userData: THREE.Material['userData'] & {
    atlasEffectActive?: boolean
    atlasUniforms?: PatchableShader['uniforms'] & AtlasShaderUniforms
    originalOnBeforeCompile?: (shader: PatchableShader) => void
    originalCustomProgramCacheKey?: () => string
  }
}

function toRadians(degrees: number) {
  return THREE.MathUtils.degToRad(degrees)
}

function getUvSourceValue(channel: AtlasEffectState['uvChannel']) {
  return (
    {
      auto: 0,
      normal: 1,
      baseColor: 2,
      emissive: 3,
      uv: 4,
      uv2: 5,
    }[channel] ?? 0
  )
}

export function getWrapMode(mode: AtlasEffectState['wrapMode']) {
  return mode === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
}

export function ensureAtlasTextureOptions(texture: THREE.Texture, wrapMode: AtlasEffectState['wrapMode']) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.wrapS = getWrapMode(wrapMode)
  texture.wrapT = getWrapMode(wrapMode)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

export function ensureFrameTextureOptions(texture: THREE.CanvasTexture, wrapMode: AtlasEffectState['wrapMode']) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.wrapS = getWrapMode(wrapMode)
  texture.wrapT = getWrapMode(wrapMode)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

export function applyPatchToMaterial(
  material: THREE.Material,
  effect: AtlasEffectState,
  atlasTexture: THREE.Texture | null,
  atlasFrameTexture: THREE.Texture | null,
) {
  const target = material as PatchedMaterial
  if (!target || typeof target.onBeforeCompile !== 'function') {
    return
  }

  if (!target.userData.originalOnBeforeCompile) {
    target.userData.originalOnBeforeCompile = target.onBeforeCompile
  }

  if (!target.userData.originalCustomProgramCacheKey) {
    target.userData.originalCustomProgramCacheKey = target.customProgramCacheKey
  }

  const shouldPatch = Boolean(atlasTexture) && effect.enabled
  target.userData.atlasEffectActive = shouldPatch

  target.customProgramCacheKey = () =>
    JSON.stringify({
      atlas: shouldPatch,
      targetSlot: effect.targetSlot,
      uvChannel: effect.uvChannel,
      swapXY: effect.swapXY,
      frameOrder: effect.frameOrder,
      wrapMode: effect.wrapMode,
      gridX: effect.gridX,
      gridY: effect.gridY,
    })

  target.onBeforeCompile = (shader) => {
    target.userData.originalOnBeforeCompile?.(shader)

    if (!target.userData.atlasEffectActive || !atlasTexture) {
      return
    }

    shader.uniforms.uAtlasTexture = { value: atlasFrameTexture ?? atlasTexture }
    shader.uniforms.uAtlasOpacity = { value: effect.opacity }
    shader.uniforms.uAtlasTransform = {
      value: new THREE.Vector4(effect.offsetX, effect.offsetY, effect.scaleX, effect.scaleY),
    }
    shader.uniforms.uAtlasRotation = { value: toRadians(effect.rotation) }
    shader.uniforms.uAtlasEnabled = { value: effect.enabled ? 1 : 0 }
    shader.uniforms.uAtlasTargetSlot = { value: effect.targetSlot === 'baseColor' ? 1 : 0 }
    shader.uniforms.uAtlasUvSource = { value: getUvSourceValue(effect.uvChannel) }
    shader.uniforms.uAtlasOrder = { value: effect.frameOrder === 'column' ? 1 : 0 }
    shader.uniforms.uAtlasWrapMode = { value: effect.wrapMode === 'repeat' ? 1 : 0 }
    shader.uniforms.uAtlasSwapXY = { value: effect.swapXY ? 1 : 0 }
    target.userData.atlasUniforms = shader.uniforms as PatchableShader['uniforms'] & AtlasShaderUniforms

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_pars_vertex>',
      `#include <uv_pars_vertex>
varying vec2 vAtlasUv;
varying vec2 vAtlasUv2;`,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
vAtlasUv = vec2(0.0);
vAtlasUv2 = vec2(0.0);
#ifdef USE_UV
  vAtlasUv = uv;
#endif
#ifdef USE_UV2
  vAtlasUv2 = uv2;
#else
  vAtlasUv2 = vAtlasUv;
#endif`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uAtlasTexture;
uniform float uAtlasOpacity;
uniform vec4 uAtlasTransform;
uniform float uAtlasRotation;
uniform float uAtlasEnabled;
uniform float uAtlasTargetSlot;
uniform float uAtlasUvSource;
uniform float uAtlasOrder;
uniform float uAtlasWrapMode;
uniform float uAtlasSwapXY;
varying vec2 vAtlasUv;
varying vec2 vAtlasUv2;`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <uv_pars_fragment>',
      `#include <uv_pars_fragment>

vec2 rotateAtlasUv(vec2 uv, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  uv -= 0.5;
  uv = mat2(c, -s, s, c) * uv;
  uv += 0.5;
  return uv;
}

vec2 getSourceAtlasUv() {
  if (uAtlasUvSource > 4.5) {
    return vAtlasUv2;
  }

  if (uAtlasUvSource > 3.5) {
    return vAtlasUv;
  }

  if (uAtlasUvSource > 2.5) {
    #ifdef USE_EMISSIVEMAP
      return vEmissiveMapUv;
    #elif defined(USE_MAP)
      return vMapUv;
    #else
      return vAtlasUv;
    #endif
  }

  if (uAtlasUvSource > 1.5) {
    #ifdef USE_MAP
      return vMapUv;
    #else
      return vAtlasUv;
    #endif
  }

  if (uAtlasUvSource > 0.5) {
    #ifdef USE_NORMALMAP
      return vNormalMapUv;
    #elif defined(USE_MAP)
      return vMapUv;
    #else
      return vAtlasUv;
    #endif
  }

  #ifdef USE_NORMALMAP
    return vNormalMapUv;
  #elif defined(USE_EMISSIVEMAP)
    return vEmissiveMapUv;
  #elif defined(USE_MAP)
    return vMapUv;
  #else
    return vAtlasUv;
  #endif
}

vec2 transformAtlasUv(vec2 uv) {
  if (uAtlasSwapXY > 0.5) {
    uv = uv.yx;
  }

  uv = uv * uAtlasTransform.zw + uAtlasTransform.xy;
  uv = rotateAtlasUv(uv, uAtlasRotation);

  if (uAtlasWrapMode > 0.5) {
    uv = fract(uv);
  } else {
    uv = clamp(uv, 0.0, 1.0);
  }

  return uv;
}

vec2 getAtlasSampleUv() {
  return transformAtlasUv(getSourceAtlasUv());
}

vec4 sampleAtlasColor() {
  return texture2D(uAtlasTexture, getAtlasSampleUv());
}`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
if (uAtlasEnabled > 0.5 && uAtlasTargetSlot > 0.5) {
  vec4 atlasSample = sampleAtlasColor();
  float atlasMask = atlasSample.a;

  if (atlasMask <= 0.001) {
    atlasMask = 1.0;
  }

  float baseMask = atlasMask * uAtlasOpacity;
  diffuseColor.rgb = mix(diffuseColor.rgb, atlasSample.rgb, baseMask);
}`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
if (uAtlasEnabled > 0.5 && uAtlasTargetSlot < 0.5) {
  vec4 atlasSample = sampleAtlasColor();
  float atlasMask = atlasSample.a;

  if (atlasMask <= 0.001) {
    atlasMask = 1.0;
  }

  float emissiveMask = atlasMask * uAtlasOpacity;
  totalEmissiveRadiance += atlasSample.rgb * emissiveMask;
}
`,
    )
  }

  target.needsUpdate = true
}

export function clearPatchFromMaterial(material: THREE.Material) {
  const target = material as PatchedMaterial
  if (!target || typeof target.onBeforeCompile !== 'function') {
    return
  }

  target.userData.atlasEffectActive = false
  target.userData.atlasUniforms = undefined
  target.onBeforeCompile = target.userData.originalOnBeforeCompile ?? (() => {})
  target.customProgramCacheKey =
    target.userData.originalCustomProgramCacheKey ?? target.customProgramCacheKey
  target.needsUpdate = true
}

export function updatePatchedMaterialUniforms(
  material: THREE.Material,
  effect: AtlasEffectState,
  atlasTexture: THREE.Texture | null,
  atlasFrameTexture: THREE.Texture | null,
) {
  const target = material as PatchedMaterial
  const uniforms = target.userData.atlasUniforms
  if (!uniforms) {
    return
  }

  uniforms.uAtlasTexture.value = atlasFrameTexture ?? atlasTexture
  uniforms.uAtlasOpacity.value = effect.opacity
  uniforms.uAtlasTransform.value.set(effect.offsetX, effect.offsetY, effect.scaleX, effect.scaleY)
  uniforms.uAtlasRotation.value = toRadians(effect.rotation)
  uniforms.uAtlasEnabled.value = effect.enabled ? 1 : 0
  uniforms.uAtlasTargetSlot.value = effect.targetSlot === 'baseColor' ? 1 : 0
  uniforms.uAtlasUvSource.value = getUvSourceValue(effect.uvChannel)
  uniforms.uAtlasOrder.value = effect.frameOrder === 'column' ? 1 : 0
  uniforms.uAtlasWrapMode.value = effect.wrapMode === 'repeat' ? 1 : 0
  uniforms.uAtlasSwapXY.value = effect.swapXY ? 1 : 0
}
