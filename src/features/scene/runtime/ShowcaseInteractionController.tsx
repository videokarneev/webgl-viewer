import { useFrame } from '@react-three/fiber'
import type { MutableRefObject, RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useEditorStore } from '../../../store/editorStore'
import { resolvePhoneScreenBoxCameraFrame, resolvePhoneScreenBoxDimensions } from './phoneScreenBoxRuntime'
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

function applyPortalDepthDeformation(
  mesh: THREE.Mesh,
  shiftX: number,
  shiftZ: number,
  boxHeight: number,
) {
  const geometry = mesh.geometry
  const positionAttribute = geometry.getAttribute('position')
  const basePositions = getBaseGeometryPositions(mesh)
  if (!(positionAttribute instanceof THREE.BufferAttribute) || !basePositions) {
    return
  }

  const safeHeight = Math.max(boxHeight, 0.0001)
  const positions = positionAttribute.array as Float32Array
  let changed = false

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const offset = index * 3
    const baseX = basePositions[offset] ?? 0
    const baseY = basePositions[offset + 1] ?? 0
    const baseZ = basePositions[offset + 2] ?? 0
    const depthRatio = THREE.MathUtils.clamp(-baseY / safeHeight, 0, 1)
    const easedDepthRatio = depthRatio * depthRatio * depthRatio
    const frontLock = THREE.MathUtils.clamp((-baseZ + safeHeight * 0.08) / Math.max(Math.abs(baseZ) * 1.35, 0.0001), 0, 1)
    const sideBias = THREE.MathUtils.clamp(Math.abs(baseX) / Math.max(Math.abs(baseZ), 0.0001), 0, 1)
    const wallTaper = 1 - sideBias * 0.06
    const influence = easedDepthRatio * frontLock * wallTaper
    const nextX = baseX + shiftX * influence
    const nextZ = baseZ + shiftZ * influence

    if (positions[offset] !== nextX || positions[offset + 2] !== nextZ) {
      positions[offset] = nextX
      positions[offset + 2] = nextZ
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
  const openingCenterRef = new THREE.Vector3()
  const selectedTargetRef = new THREE.Vector3()
  const boxQuaternionRef = new THREE.Quaternion()
  const fallbackObjectQuaternionRef = new THREE.Quaternion()
  const fallbackObjectMatrixRef = new THREE.Matrix4()
  const deformedBoxIdsRef = new Set<string>()

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
    const visibleBoxIds = new Set<string>()
    store.phoneScreenBoxes.forEach((entry) => {
      const objectState = store.objects[entry.id]
      if (objectState?.visible) {
        visibleBoxIds.add(entry.id)
      }
    })

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
      openingCenterRef.set(0, 0, 0).applyMatrix4(runtimeObject.matrixWorld)
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
      openingCenterRef.set(0, 0, 0).applyMatrix4(fallbackObjectMatrixRef)
      if (!useLockedFrame) {
        anchorTargetRef
          .set(...activeBox.content.anchor)
          .applyMatrix4(fallbackObjectMatrixRef)
      }
      rightAxisRef.set(1, 0, 0).applyQuaternion(fallbackObjectQuaternionRef).normalize()
      screenUpAxisRef.set(0, 0, 1).applyQuaternion(fallbackObjectQuaternionRef).normalize()
    } else {
      anchorTargetRef.copy(baseTargetRef)
      openingCenterRef.copy(baseTargetRef)
      rightAxisRef.set(1, 0, 0)
      screenUpAxisRef.set(0, 0, 1)
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

    const runtimeMesh = runtimeObject instanceof THREE.Mesh ? runtimeObject : null
    if (useLockedFrame && runtimeMesh) {
      const resolvedDimensions = resolvePhoneScreenBoxDimensions(
        activeBox,
        store.responsiveFrame,
        state.size.width / Math.max(state.size.height, 1),
      )
      const localShiftX = pointerX * Math.min(activeBox.interaction.maxOffsetX, 0.02) * 6.5
      const localShiftZ = -pointerY * Math.min(activeBox.interaction.maxOffsetY, 0.026) * 6.5
      applyPortalDepthDeformation(
        runtimeMesh,
        localShiftX,
        localShiftZ,
        resolvedDimensions.boxHeight,
      )
      deformedBoxIdsRef.add(activeBox.id)
      desiredOffsetRef.set(0, 0, 0)
    } else {
      desiredOffsetRef
        .copy(rightAxisRef)
        .multiplyScalar(pointerX * activeBox.interaction.maxOffsetX)
        .addScaledVector(screenUpAxisRef, -pointerY * activeBox.interaction.maxOffsetY)
    }

    for (const boxId of Array.from(deformedBoxIdsRef)) {
      if (boxId === activeBox.id && useLockedFrame && runtimeMesh) {
        continue
      }

      if (!visibleBoxIds.has(boxId)) {
        deformedBoxIdsRef.delete(boxId)
        continue
      }

      const object = store.runtime.objectById[boxId]
      if (object instanceof THREE.Mesh) {
        restoreShowcaseGeometry(object)
      }
      deformedBoxIdsRef.delete(boxId)
    }

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
