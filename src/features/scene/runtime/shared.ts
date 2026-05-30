import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

const gltfLoader = new GLTFLoader()
const rgbeLoader = new RGBELoader()
const exrLoader = new EXRLoader()

export function loadGltf(url: string) {
  return new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

export function loadTexture(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    const image = new Image()
    let settled = false

    const finalize = () => {
      if (settled) {
        return
      }

      settled = true
      const texture = new THREE.Texture(image)
      texture.needsUpdate = true
      resolve(texture)
    }

    image.decoding = 'async'
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }

    image.onload = () => {
      if (typeof image.decode === 'function') {
        image
          .decode()
          .catch(() => {})
          .finally(finalize)
        return
      }

      finalize()
    }

    image.onerror = () => {
      if (settled) {
        return
      }

      settled = true
      reject(new Error(`Failed to load texture: ${url}`))
    }

    image.src = url
  })
}

export function loadHdri(url: string) {
  return new Promise<THREE.DataTexture>((resolve, reject) => {
    if (/\.exr($|\?)/i.test(url)) {
      exrLoader.load(url, resolve, undefined, reject)
      return
    }

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

type CameraFrame = {
  position: THREE.Vector3
  target: THREE.Vector3
  distance: number
  radius: number
}

type FrameBoxCandidate = {
  box: THREE.Box3
  maxDim: number
  minDim: number
  label: string
}

const FRAME_OBJECT_MARGIN = 1.25
const UTILITY_FRAME_NAME_PATTERN = /\b(grid|helper|gizmo|shadow|collision|collider|bounds|bounding|proxy)\b/i

export function applyViewerCameraOptics(camera: THREE.PerspectiveCamera, focalLength: number) {
  camera.setFocalLength(focalLength)
  camera.updateProjectionMatrix()
}

function calculateObjectFrame(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  margin?: number,
): CameraFrame | null {
  object.updateWorldMatrix(true, true)

  const box = getFrameBox(object)
  if (box.isEmpty()) {
    return null
  }

  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(sphere.radius, 0.01)
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.0001))
  const limitingFov = Math.max(Math.min(verticalFov, horizontalFov), 0.001)
  const framingMargin = margin ?? FRAME_OBJECT_MARGIN
  const distance = (radius / Math.sin(limitingFov / 2)) * framingMargin
  const viewDirection = new THREE.Vector3(1, 0.75, 1).normalize()

  return {
    position: center.clone().addScaledVector(viewDirection, distance),
    target: center,
    distance,
    radius,
  }
}

function isVisibleInHierarchy(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) {
      return false
    }
    current = current.parent
  }

  return true
}

function getMaterialLabels(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material]
  return materials.map((entry) => entry?.name ?? '').join(' ')
}

function getFrameBox(object: THREE.Object3D) {
  const candidates: FrameBoxCandidate[] = []

  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh || !isVisibleInHierarchy(child)) {
      return
    }

    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry
    if (!geometry?.getAttribute('position')) {
      return
    }

    const box = new THREE.Box3().setFromObject(mesh)
    if (box.isEmpty()) {
      return
    }

    const size = box.getSize(new THREE.Vector3())
    candidates.push({
      box,
      maxDim: Math.max(size.x, size.y, size.z),
      minDim: Math.min(size.x, size.y, size.z),
      label: `${mesh.name} ${getMaterialLabels(mesh.material)}`,
    })
  })

  const sourceCandidates = candidates.length ? candidates : [{ box: new THREE.Box3().setFromObject(object), maxDim: 0, minDim: 0, label: '' }]
  const sortedMaxDims = sourceCandidates.map((candidate) => candidate.maxDim).filter((value) => value > 0).sort((a, b) => a - b)
  const medianMaxDim = sortedMaxDims[Math.floor(sortedMaxDims.length / 2)] ?? 0
  const usefulCandidates = sourceCandidates.filter((candidate) => {
    if (UTILITY_FRAME_NAME_PATTERN.test(candidate.label)) {
      return false
    }

    const isVeryFlat = candidate.minDim > 0 && candidate.maxDim / candidate.minDim > 120
    const isHugeOutlier = medianMaxDim > 0 && candidate.maxDim > medianMaxDim * 8
    return !(isVeryFlat && isHugeOutlier)
  })
  const resolvedCandidates = usefulCandidates.length ? usefulCandidates : sourceCandidates

  return resolvedCandidates.reduce((frameBox, candidate) => frameBox.union(candidate.box), new THREE.Box3())
}

export function applyCameraFrame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  frame: CameraFrame,
) {
  camera.position.copy(frame.position)
  camera.lookAt(frame.target)
  camera.near = Math.max(frame.distance / 100, 0.1)
  camera.far = Math.max(frame.distance * 100, frame.distance + frame.radius * 2, 2000)
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(frame.target)
    controls.update()
  }

  useEditorStore.getState().setViewer({
    cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
    orbitTarget: [frame.target.x, frame.target.y, frame.target.z],
  })
}

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  object: THREE.Object3D,
  margin?: number,
) {
  const frame = calculateObjectFrame(camera, object, margin)
  if (!frame) {
    return null
  }

  applyCameraFrame(camera, controls, frame)

  return {
    position: camera.position.clone(),
    target: frame.target.clone(),
    distance: frame.distance,
  }
}
