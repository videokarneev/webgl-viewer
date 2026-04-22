import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()
const rgbeLoader = new RGBELoader()

export function loadGltf(url: string) {
  return new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

export function loadTexture(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    textureLoader.load(url, resolve, undefined, reject)
  })
}

export function loadHdri(url: string) {
  return new Promise<THREE.DataTexture>((resolve, reject) => {
    rgbeLoader.load(url, resolve, undefined, reject)
  })
}

export function sanitizeNumber(value: unknown, fallback: number, min?: number) {
  const next = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(next)) {
    return fallback
  }
  return min != null ? Math.max(min, next) : next
}

export function frameObject(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
) {
  fitCameraToObject(camera, controls, object)
}

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  object: THREE.Object3D,
  margin = 1.95,
) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) {
    return null
  }

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
  cameraZ *= margin

  camera.position.set(center.x, center.y, center.z + cameraZ)
  camera.lookAt(center)
  camera.near = Math.max(cameraZ / 100, 0.1)
  camera.far = Math.max(cameraZ * 100, 2000)
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(center)
    controls.update()
  }

  useEditorStore.getState().setViewer({
    cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
    orbitTarget: [center.x, center.y, center.z],
  })

  return {
    position: camera.position.clone(),
    target: center,
    distance: cameraZ,
  }
}
