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
  const depthAxisRef = new THREE.Vector3()
  const fallbackTargetRef = new THREE.Vector3()
  const anchorTargetRef = new THREE.Vector3()
  const selectedTargetRef = new THREE.Vector3()
  const boxQuaternionRef = new THREE.Quaternion()
  const fallbackObjectQuaternionRef = new THREE.Quaternion()
  const fallbackObjectMatrixRef = new THREE.Matrix4()

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

    const perspectiveCamera = state.camera as THREE.PerspectiveCamera
    const nextSmoothing = THREE.MathUtils.clamp((activeBox?.interaction.smoothing ?? 0.14) * delta * 60, 0.01, 1)

    if (!activeBox || store.viewer.cameraMode !== 'orbit') {
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

    if (useLockedFrame && objectState) {
      const frame = resolvePhoneScreenBoxCameraFrame(
        activeBox,
        objectState,
        store.responsiveFrame,
        state.size.width / Math.max(state.size.height, 1),
        perspectiveCamera.aspect,
        perspectiveCamera.fov,
      )
      baseCameraPositionRef.set(...frame.position)
      baseTargetRef.set(...frame.target)
      anchorTargetRef.set(...frame.target)
    } else {
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
      runtimeObject.getWorldQuaternion(boxQuaternionRef)
      if (!useLockedFrame) {
        anchorTargetRef.set(...activeBox.content.anchor).applyMatrix4(runtimeObject.matrixWorld)
      }
      rightAxisRef.set(1, 0, 0).applyQuaternion(boxQuaternionRef).normalize()
      depthAxisRef.set(0, 0, 1).applyQuaternion(boxQuaternionRef).normalize()
    } else if (objectState) {
      fallbackObjectQuaternionRef.setFromEuler(new THREE.Euler(...objectState.rotation))
      if (!useLockedFrame) {
        fallbackObjectMatrixRef.compose(
          new THREE.Vector3(...objectState.position),
          fallbackObjectQuaternionRef,
          new THREE.Vector3(...objectState.scale),
        )
        anchorTargetRef
          .set(...activeBox.content.anchor)
          .applyMatrix4(fallbackObjectMatrixRef)
      }
      rightAxisRef.set(1, 0, 0).applyQuaternion(fallbackObjectQuaternionRef).normalize()
      depthAxisRef.set(0, 0, 1).applyQuaternion(fallbackObjectQuaternionRef).normalize()
    } else {
      anchorTargetRef.copy(baseTargetRef)
      rightAxisRef.set(1, 0, 0)
      depthAxisRef.set(0, 0, 1)
    }

    const gyroSample = gyroSampleRef.current
    const useGyro =
      activeBox.interaction.enabled && supportsGyroInput(activeBox.interaction.inputMode) && gyroSample.active
    const useMouse =
      activeBox.interaction.enabled &&
      supportsMouseInput(activeBox.interaction.inputMode) &&
      !useLockedFrame &&
      !useGyro
    const pointerX = useGyro ? gyroSample.x : useMouse ? THREE.MathUtils.clamp(state.pointer.x, -1, 1) : 0
    const pointerY = useGyro ? gyroSample.y : useMouse ? THREE.MathUtils.clamp(state.pointer.y, -1, 1) : 0
    desiredOffsetRef
      .copy(rightAxisRef)
      .multiplyScalar(pointerX * activeBox.interaction.maxOffsetX)
      .addScaledVector(depthAxisRef, -pointerY * activeBox.interaction.maxOffsetY)
    if (useLockedFrame) {
      desiredTargetOffsetRef.set(0, 0, 0)
    } else {
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
  })

  return null
}
