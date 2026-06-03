import { useFrame } from '@react-three/fiber'
import type { MutableRefObject, RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useEditorStore } from '../../../store/editorStore'
import { resolvePhoneScreenBoxCameraFrame } from './phoneScreenBoxRuntime'
import type { ShowcaseMotionSample } from './useShowcaseMotionSensor'

function supportsMouseInput(mode: string) {
  return mode === 'mouse' || mode === 'mouse+gyro'
}

function supportsGyroInput(mode: string) {
  return mode === 'gyro' || mode === 'mouse+gyro'
}

function getBaseGeometryPositions(mesh: THREE.Mesh) {
  const geometry = mesh.geometry
  const positionAttribute = geometry.getAttribute('position')
  if (!(positionAttribute instanceof THREE.BufferAttribute)) {
    return null
  }

  const existing = mesh.userData.showcaseBasePositions as Float32Array | undefined
  if (existing && existing.length === positionAttribute.array.length) {
    return existing
  }

  const snapshot = new Float32Array(positionAttribute.array as ArrayLike<number>)
  mesh.userData.showcaseBasePositions = snapshot
  return snapshot
}

function restoreShowcaseGeometry(mesh: THREE.Mesh | null) {
  if (!mesh) {
    return
  }

  const geometry = mesh.geometry
  const positionAttribute = geometry.getAttribute('position')
  const basePositions = getBaseGeometryPositions(mesh)
  if (!(positionAttribute instanceof THREE.BufferAttribute) || !basePositions) {
    return
  }

  const positions = positionAttribute.array as Float32Array
  let changed = false

  for (let index = 0; index < positions.length; index += 1) {
    const baseValue = basePositions[index] ?? 0
    if (positions[index] !== baseValue) {
      positions[index] = baseValue
      changed = true
    }
  }

  if (changed) {
    positionAttribute.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometry.computeVertexNormals()
  }
}

function resetPortalProjection(camera: THREE.PerspectiveCamera) {
  camera.clearViewOffset()
  camera.updateProjectionMatrix()
}

function applyOffAxisPortalProjection(
  camera: THREE.PerspectiveCamera,
  eye: THREE.Vector3,
  bottomLeft: THREE.Vector3,
  bottomRight: THREE.Vector3,
  topLeft: THREE.Vector3,
) {
  const screenRight = bottomRight.clone().sub(bottomLeft).normalize()
  const screenUp = topLeft.clone().sub(bottomLeft).normalize()
  const screenNormal = new THREE.Vector3().crossVectors(screenUp, screenRight).normalize()
  const toBottomLeft = bottomLeft.clone().sub(eye)
  const toBottomRight = bottomRight.clone().sub(eye)
  const toTopLeft = topLeft.clone().sub(eye)
  const distanceToScreen = -toBottomLeft.dot(screenNormal)

  if (!Number.isFinite(distanceToScreen) || distanceToScreen <= 0.0001) {
    resetPortalProjection(camera)
    return
  }

  const near = Math.max(camera.near, 0.01)
  const far = Math.max(camera.far, near + 0.01)
  const left = screenRight.dot(toBottomLeft) * near / distanceToScreen
  const right = screenRight.dot(toBottomRight) * near / distanceToScreen
  const bottom = screenUp.dot(toBottomLeft) * near / distanceToScreen
  const top = screenUp.dot(toTopLeft) * near / distanceToScreen

  camera.projectionMatrix.set(
    (2 * near) / (right - left),
    0,
    (right + left) / (right - left),
    0,
    0,
    (2 * near) / (top - bottom),
    (top + bottom) / (top - bottom),
    0,
    0,
    0,
    -(far + near) / (far - near),
    (-2 * far * near) / (far - near),
    0,
    0,
    -1,
    0,
  )
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export function ShowcaseInteractionController({
  controlsRef,
  cameraOffsetRef,
  targetOffsetRef,
  gyroSampleRef,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  cameraOffsetRef: MutableRefObject<THREE.Vector3>
  targetOffsetRef: MutableRefObject<THREE.Vector3>
  gyroSampleRef: MutableRefObject<ShowcaseMotionSample>
}) {
  const smoothedOffsetRef = cameraOffsetRef
  const smoothedTargetOffsetRef = targetOffsetRef
  const baseCameraPositionRef = new THREE.Vector3()
  const baseTargetRef = new THREE.Vector3()
  const desiredOffsetRef = new THREE.Vector3()
  const desiredTargetOffsetRef = new THREE.Vector3()
  const rightAxisRef = new THREE.Vector3()
  const screenUpAxisRef = new THREE.Vector3()
  const fallbackTargetRef = new THREE.Vector3()
  const anchorTargetRef = new THREE.Vector3()
  const selectedTargetRef = new THREE.Vector3()
  const boxQuaternionRef = new THREE.Quaternion()
  const fallbackObjectQuaternionRef = new THREE.Quaternion()
  const fallbackObjectMatrixRef = new THREE.Matrix4()
  const boxWorldMatrixRef = new THREE.Matrix4()
  const bottomLeftCornerRef = new THREE.Vector3()
  const bottomRightCornerRef = new THREE.Vector3()
  const topLeftCornerRef = new THREE.Vector3()

  function resolveActiveBox() {
    const store = useEditorStore.getState()
    const visibleBoxes = store.phoneScreenBoxes.filter((entry) => {
      const objectState = store.objects[entry.id]
      return objectState?.visible ?? false
    })
    if (!visibleBoxes.length) {
      return null
    }

    const selectedObjectId = store.selectedObjectId
    const selectedMaterialId = store.selectedMaterialId
    const selectedBox =
      visibleBoxes.find((entry) => entry.id === selectedObjectId || entry.materialId === selectedMaterialId) ?? null

    if (selectedBox) {
      return selectedBox
    }

    return visibleBoxes.find((entry) => entry.screenBinding.lockToFrame || entry.interaction.enabled) ?? visibleBoxes[0] ?? null
  }

  useFrame((state, delta) => {
    const store = useEditorStore.getState()
    const activeBox = resolveActiveBox()
    store.phoneScreenBoxes.forEach((entry) => {
      const object = store.runtime.objectById[entry.id]
      if (object instanceof THREE.Mesh) {
        restoreShowcaseGeometry(object)
      }
    })

    const perspectiveCamera = state.camera as THREE.PerspectiveCamera
    const nextSmoothing = THREE.MathUtils.clamp((activeBox?.interaction.smoothing ?? 0.14) * delta * 60, 0.01, 1)

    if (!activeBox || store.viewer.cameraMode !== 'orbit') {
      perspectiveCamera.up.set(0, 1, 0)
      resetPortalProjection(perspectiveCamera)
      baseCameraPositionRef.copy(perspectiveCamera.position).sub(smoothedOffsetRef.current)
      if (controlsRef.current) {
        baseTargetRef.copy(controlsRef.current.target).sub(smoothedTargetOffsetRef.current)
      } else {
        baseTargetRef.set(...store.viewer.orbitTarget)
      }
      smoothedOffsetRef.current.lerp(desiredOffsetRef.set(0, 0, 0), nextSmoothing)
      smoothedTargetOffsetRef.current.lerp(desiredTargetOffsetRef.set(0, 0, 0), nextSmoothing)
      perspectiveCamera.position.copy(baseCameraPositionRef).add(smoothedOffsetRef.current)
      fallbackTargetRef.copy(baseTargetRef).add(smoothedTargetOffsetRef.current)
      if (controlsRef.current) {
        controlsRef.current.target.copy(fallbackTargetRef)
        controlsRef.current.update()
      } else {
        perspectiveCamera.lookAt(fallbackTargetRef)
      }
      return
    }

    const objectState = store.objects[activeBox.id] ?? null
    const useLockedFrame = Boolean(activeBox.screenBinding.lockToFrame && objectState)
    let lockedFrame: ReturnType<typeof resolvePhoneScreenBoxCameraFrame> | null = null

    if (useLockedFrame && objectState) {
      lockedFrame = resolvePhoneScreenBoxCameraFrame(
        activeBox,
        objectState,
        store.responsiveFrame,
        state.size.width / Math.max(state.size.height, 1),
        perspectiveCamera.aspect,
        perspectiveCamera.fov,
      )
      baseCameraPositionRef.set(...lockedFrame.position)
      baseTargetRef.set(...lockedFrame.target)
      anchorTargetRef.set(...lockedFrame.target)
    } else {
      resetPortalProjection(perspectiveCamera)
      baseCameraPositionRef.copy(perspectiveCamera.position).sub(smoothedOffsetRef.current)
      if (controlsRef.current) {
        baseTargetRef.copy(controlsRef.current.target).sub(smoothedTargetOffsetRef.current)
      } else {
        baseTargetRef.set(...store.viewer.orbitTarget)
      }
    }

    const runtimeObject = store.runtime.objectById[activeBox.id] ?? null
    if (runtimeObject) {
      runtimeObject.updateWorldMatrix(true, false)
      boxWorldMatrixRef.copy(runtimeObject.matrixWorld)
      runtimeObject.getWorldQuaternion(boxQuaternionRef)
      if (!useLockedFrame) {
        anchorTargetRef.set(...activeBox.content.anchor).applyMatrix4(runtimeObject.matrixWorld)
      }
      rightAxisRef.set(1, 0, 0).applyQuaternion(boxQuaternionRef).normalize()
      screenUpAxisRef.set(0, 0, 1).applyQuaternion(boxQuaternionRef).normalize()
    } else if (objectState) {
      fallbackObjectQuaternionRef.setFromEuler(new THREE.Euler(...objectState.rotation))
      fallbackObjectMatrixRef.compose(
        new THREE.Vector3(...objectState.position),
        fallbackObjectQuaternionRef,
        new THREE.Vector3(...objectState.scale),
      )
      boxWorldMatrixRef.copy(fallbackObjectMatrixRef)
      if (!useLockedFrame) {
        anchorTargetRef
          .set(...activeBox.content.anchor)
          .applyMatrix4(fallbackObjectMatrixRef)
      }
      rightAxisRef.set(1, 0, 0).applyQuaternion(fallbackObjectQuaternionRef).normalize()
      screenUpAxisRef.set(0, 0, 1).applyQuaternion(fallbackObjectQuaternionRef).normalize()
    } else {
      anchorTargetRef.copy(baseTargetRef)
      boxWorldMatrixRef.identity()
      rightAxisRef.set(1, 0, 0)
      screenUpAxisRef.set(0, 0, 1)
    }

    if (useLockedFrame) {
      perspectiveCamera.up.copy(screenUpAxisRef)
    } else {
      perspectiveCamera.up.set(0, 1, 0)
    }

    const gyroSample = gyroSampleRef.current
    const useGyro =
      activeBox.interaction.enabled && supportsGyroInput(activeBox.interaction.inputMode) && gyroSample.active
    const useMouse =
      activeBox.interaction.enabled &&
      supportsMouseInput(activeBox.interaction.inputMode) &&
      !useGyro
    const pointerX = useGyro ? gyroSample.x : useMouse ? THREE.MathUtils.clamp(state.pointer.x, -1, 1) : 0
    const pointerY = useGyro ? gyroSample.y : useMouse ? THREE.MathUtils.clamp(state.pointer.y, -1, 1) : 0

    if (useLockedFrame) {
      desiredOffsetRef
        .copy(rightAxisRef)
        .multiplyScalar(pointerX * activeBox.interaction.maxOffsetX * 1.2)
        .addScaledVector(screenUpAxisRef, -pointerY * activeBox.interaction.maxOffsetY * 1.2)
      desiredTargetOffsetRef.copy(desiredOffsetRef)
    } else {
      desiredOffsetRef
        .copy(rightAxisRef)
        .multiplyScalar(pointerX * activeBox.interaction.maxOffsetX)
        .addScaledVector(screenUpAxisRef, -pointerY * activeBox.interaction.maxOffsetY)
      desiredTargetOffsetRef.copy(anchorTargetRef).sub(baseTargetRef)
    }

    smoothedOffsetRef.current.lerp(desiredOffsetRef, nextSmoothing)
    smoothedTargetOffsetRef.current.lerp(desiredTargetOffsetRef, nextSmoothing)
    perspectiveCamera.position.copy(baseCameraPositionRef).add(smoothedOffsetRef.current)
    selectedTargetRef.copy(baseTargetRef).add(smoothedTargetOffsetRef.current)
    if (controlsRef.current) {
      controlsRef.current.target.copy(selectedTargetRef)
      controlsRef.current.update()
    } else {
      perspectiveCamera.lookAt(selectedTargetRef)
    }

    if (useLockedFrame && lockedFrame) {
      const halfWidth = lockedFrame.dimensions.width * 0.5
      const halfDepth = lockedFrame.dimensions.footprintDepth * 0.5
      bottomLeftCornerRef.set(-halfWidth, 0, -halfDepth).applyMatrix4(boxWorldMatrixRef)
      bottomRightCornerRef.set(halfWidth, 0, -halfDepth).applyMatrix4(boxWorldMatrixRef)
      topLeftCornerRef.set(-halfWidth, 0, halfDepth).applyMatrix4(boxWorldMatrixRef)
      applyOffAxisPortalProjection(
        perspectiveCamera,
        perspectiveCamera.position,
        bottomLeftCornerRef,
        bottomRightCornerRef,
        topLeftCornerRef,
      )
    }
  })

  return null
}
