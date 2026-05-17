import * as THREE from 'three'
import type { AtlasEffectState } from '../../store/editorStore'

function getWrapMode(mode: AtlasEffectState['wrapMode']) {
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
