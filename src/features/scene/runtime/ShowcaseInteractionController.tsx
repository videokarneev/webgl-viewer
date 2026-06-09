import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useEditorStore, type ObjectTransformState } from '../../../store/editorStore'
import { resolvePhoneScreenBoxCameraFrame } from './phoneScreenBoxRuntime'
import type { ShowcaseMotionSample } from './useShowcaseMotionSensor'

function supportsMouseInput(mode: string) {
  return mode === 'mouse' || mode === 'mouse+gyro'
}

function supportsGyroInput(mode: string) {
  return mode === 'gyro' || mode === 'mouse+gyro'
}

const LOCKED_FRAME_PARALLAX_SCALE = 1.625

function getBaseGeometryPositions(mesh: THREE.Mesh) {
  const geometry = mesh.geometry
  const positionAttribute = geometry.getAttribute('position')
  if (!(positionAttribute instanceof THREE.BufferAttribute)) {
    return null
  }

  const existing = mesh.userData.showcaseBasePositions as Float32Array | undefined
  const existingGeometryUuid = mesh.userData.showcaseBasePositionsGeometryUuid as string | undefined
  if (existing && existingGeometryUuid === geometry.uuid && existing.length === positionAttribute.array.length) {
    return existing
  }

  const snapshot = new Float32Array(positionAttribute.array as ArrayLike<number>)
  mesh.userData.showcaseBasePositions = snapshot
  mesh.userData.showcaseBasePositionsGeometryUuid = geometry.uuid
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

function applyPortalDepthShear(mesh: THREE.Mesh, shiftX: number, shiftZ: number, boxHeight: number) {
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
    const nextX = baseX + shiftX * depthRatio
    const nextZ = baseZ + shiftZ * depthRatio

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

function restoreRuntimeObjectTransform(object: THREE.Object3D, objectState: ObjectTransformState) {
  object.position.set(...objectState.position)
  object.rotation.set(objectState.rotation[0], objectState.rotation[1], objectState.rotation[2])
  object.scale.set(...objectState.scale)
  object.visible = objectState.visible
  object.updateMatrixWorld(true)
}

const attachedWorldPosition = new THREE.Vector3()
const attachedBoxLocalPosition = new THREE.Vector3()
const attachedWorldOffset = new THREE.Vector3()
const attachedDesiredWorldPosition = new THREE.Vector3()
const attachedBoxInverseMatrix = new THREE.Matrix4()
const attachedWorldQuaternion = new THREE.Quaternion()
const attachedYawQuaternion = new THREE.Quaternion()
const attachedTiltQuaternionX = new THREE.Quaternion()
const attachedTiltQuaternionY = new THREE.Quaternion()
const attachedNextWorldQuaternion = new THREE.Quaternion()
const attachedParentWorldQuaternion = new THREE.Quaternion()
const attachedParentInverseQuaternion = new THREE.Quaternion()

const ATTACHED_CONTENT_MIN_DEPTH_RATIO = 0.42
const ATTACHED_CONTENT_PARALLAX_SCALE = 1.4
const ATTACHED_CONTENT_YAW = 1.05
const ATTACHED_CONTENT_TILT_X = 0.92
const ATTACHED_CONTENT_TILT_Y = 0.62

function resolveAttachedObjectIds(
  boxAttachedObjectIds: string[],
  store: ReturnType<typeof useEditorStore.getState>,
  lockOnlyWhenSelected: boolean,
) {
  const resolvedIds = boxAttachedObjectIds.filter((objectId) => Boolean(store.runtime.objectById[objectId]))
  if (resolvedIds.length || lockOnlyWhenSelected) {
    return resolvedIds
  }

  const visibleModelRootIds = store.loadedModels
    .map((model) => model.rootNodeId)
    .filter((objectId) => Boolean(store.runtime.objectById[objectId] && store.objects[objectId]?.visible))

  return visibleModelRootIds.length === 1 ? visibleModelRootIds : resolvedIds
}

function applyPortalDepthOffsetToObject({
  object,
  objectState,
  boxObject,
  boxHeight,
  rightAxis,
  screenUpAxis,
  shiftX,
  shiftZ,
  pointerX,
  pointerY,
  rotationPointerX,
  rotationPointerY,
  yaw,
}: {
  object: THREE.Object3D
  objectState: ObjectTransformState
  boxObject: THREE.Object3D
  boxHeight: number
  rightAxis: THREE.Vector3
  screenUpAxis: THREE.Vector3
  shiftX: number
  shiftZ: number
  pointerX: number
  pointerY: number
  rotationPointerX: number
  rotationPointerY: number
  yaw: number
}) {
  restoreRuntimeObjectTransform(object, objectState)
  if (!object.visible) {
    return
  }

  boxObject.updateWorldMatrix(true, false)
  object.updateWorldMatrix(true, true)
  object.getWorldPosition(attachedWorldPosition)
  attachedBoxInverseMatrix.copy(boxObject.matrixWorld).invert()
  attachedBoxLocalPosition.copy(attachedWorldPosition).applyMatrix4(attachedBoxInverseMatrix)

  const rawDepthRatio = THREE.MathUtils.clamp(-attachedBoxLocalPosition.y / Math.max(boxHeight, 0.0001), 0, 1)
  const depthRatio = Math.max(rawDepthRatio, ATTACHED_CONTENT_MIN_DEPTH_RATIO)

  attachedWorldOffset
    .copy(rightAxis)
    .multiplyScalar(shiftX * depthRatio * ATTACHED_CONTENT_PARALLAX_SCALE)
    .addScaledVector(screenUpAxis, shiftZ * depthRatio * ATTACHED_CONTENT_PARALLAX_SCALE)
  attachedDesiredWorldPosition.copy(attachedWorldPosition).add(attachedWorldOffset)

  if (object.parent) {
    object.parent.updateWorldMatrix(true, false)
    object.position.copy(object.parent.worldToLocal(attachedDesiredWorldPosition))
  } else {
    object.position.copy(attachedDesiredWorldPosition)
  }

  object.getWorldQuaternion(attachedWorldQuaternion)
  const yawDepthRatio = Math.max(depthRatio, 0.7)
  attachedYawQuaternion.setFromAxisAngle(screenUpAxis, -yaw * ATTACHED_CONTENT_YAW * yawDepthRatio)
  attachedTiltQuaternionX.setFromAxisAngle(screenUpAxis, -rotationPointerX * ATTACHED_CONTENT_TILT_X * depthRatio)
  attachedTiltQuaternionY.setFromAxisAngle(rightAxis, rotationPointerY * ATTACHED_CONTENT_TILT_Y * depthRatio)
  attachedNextWorldQuaternion
    .copy(attachedYawQuaternion)
    .multiply(attachedTiltQuaternionX)
    .multiply(attachedTiltQuaternionY)
    .multiply(attachedWorldQuaternion)

  if (object.parent) {
    object.parent.getWorldQuaternion(attachedParentWorldQuaternion)
    attachedParentInverseQuaternion.copy(attachedParentWorldQuaternion).invert()
    object.quaternion.copy(attachedParentInverseQuaternion.multiply(attachedNextWorldQuaternion))
  } else {
    object.quaternion.copy(attachedNextWorldQuaternion)
  }

  object.updateMatrixWorld(true)
}

export function ShowcaseInteractionController({
  controlsRef,
  cameraOffsetRef,
  targetOffsetRef,
  gyroSampleRef,
  lockOnlyWhenSelected = false,
  transformDragging = false,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  cameraOffsetRef: MutableRefObject<THREE.Vector3>
  targetOffsetRef: MutableRefObject<THREE.Vector3>
  gyroSampleRef: MutableRefObject<ShowcaseMotionSample>
  lockOnlyWhenSelected?: boolean
  transformDragging?: boolean
}) {
  const smoothedOffsetRef = cameraOffsetRef
  const smoothedTargetOffsetRef = targetOffsetRef
  const lastPortalObjectIdsRef = useRef<Set<string>>(new Set())
  const baseCameraPositionRef = new THREE.Vector3()
  const baseTargetRef = new THREE.Vector3()
  const desiredOffsetRef = new THREE.Vector3()
  const desiredTargetOffsetRef = new THREE.Vector3()
  const rightAxisRef = new THREE.Vector3()
  const screenUpAxisRef = new THREE.Vector3()
  const boxUpAxisRef = new THREE.Vector3()
  const fallbackTargetRef = new THREE.Vector3()
  const anchorTargetRef = new THREE.Vector3()
  const selectedTargetRef = new THREE.Vector3()
  const boxQuaternionRef = new THREE.Quaternion()
  const fallbackObjectQuaternionRef = new THREE.Quaternion()
  const fallbackObjectMatrixRef = new THREE.Matrix4()
  const portalLookAtMatrixRef = new THREE.Matrix4()
  const portalQuaternionRef = new THREE.Quaternion()

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

    if (lockOnlyWhenSelected) {
      return null
    }

    return visibleBoxes.find((entry) => entry.screenBinding.lockToFrame || entry.interaction.enabled) ?? visibleBoxes[0] ?? null
  }

  useFrame((state, delta) => {
    const store = useEditorStore.getState()
    const activeBox = resolveActiveBox()
    const attachedObjectIds = new Set(lastPortalObjectIdsRef.current)
    store.phoneScreenBoxes.forEach((entry) => {
      entry.content.attachedObjectIds.forEach((objectId) => {
        attachedObjectIds.add(objectId)
      })
    })
    lastPortalObjectIdsRef.current.clear()
    attachedObjectIds.forEach((objectId) => {
      const object = store.runtime.objectById[objectId]
      const objectState = store.objects[objectId]
      if (object && objectState) {
        restoreRuntimeObjectTransform(object, objectState)
      }
    })
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
      runtimeObject.getWorldQuaternion(boxQuaternionRef)
      if (!useLockedFrame) {
        anchorTargetRef.set(...activeBox.content.anchor).applyMatrix4(runtimeObject.matrixWorld)
      }
      boxUpAxisRef.set(0, 1, 0).applyQuaternion(boxQuaternionRef).normalize()
      rightAxisRef.set(1, 0, 0).applyQuaternion(boxQuaternionRef).normalize()
      screenUpAxisRef.set(0, 0, 1).applyQuaternion(boxQuaternionRef).normalize()
    } else if (objectState) {
      fallbackObjectQuaternionRef.setFromEuler(new THREE.Euler(...objectState.rotation))
      fallbackObjectMatrixRef.compose(
        new THREE.Vector3(...objectState.position),
        fallbackObjectQuaternionRef,
        new THREE.Vector3(...objectState.scale),
      )
      if (!useLockedFrame) {
        anchorTargetRef
          .set(...activeBox.content.anchor)
          .applyMatrix4(fallbackObjectMatrixRef)
      }
      boxUpAxisRef.set(0, 1, 0).applyQuaternion(fallbackObjectQuaternionRef).normalize()
      rightAxisRef.set(1, 0, 0).applyQuaternion(fallbackObjectQuaternionRef).normalize()
      screenUpAxisRef.set(0, 0, 1).applyQuaternion(fallbackObjectQuaternionRef).normalize()
    } else {
      anchorTargetRef.copy(baseTargetRef)
      boxUpAxisRef.set(0, 1, 0)
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
    const rawPointerX = useGyro ? gyroSample.x : useMouse ? THREE.MathUtils.clamp(state.pointer.x, -1, 1) : 0
    const rawPointerY = useGyro ? gyroSample.y : useMouse ? THREE.MathUtils.clamp(state.pointer.y, -1, 1) : 0
    const rawYaw = useGyro ? gyroSample.yaw : useMouse ? THREE.MathUtils.clamp(state.pointer.x * 0.72, -1, 1) : 0
    const pointerX = useGyro
      ? THREE.MathUtils.clamp(rawYaw * 0.9 + rawPointerX * 0.28, -1, 1)
      : rawPointerX
    const pointerY = useGyro ? THREE.MathUtils.clamp(rawPointerY * 0.34, -1, 1) : rawPointerY
    const yaw = useGyro
      ? THREE.MathUtils.clamp(rawYaw * 1.12 + rawPointerX * 0.16, -1, 1)
      : rawYaw
    const rotationPointerX = useGyro ? pointerX * 0.16 : pointerX
    const rotationPointerY = useGyro ? pointerY * 0.42 : pointerY

    if (useLockedFrame) {
      desiredOffsetRef
        .copy(rightAxisRef)
        .multiplyScalar(-pointerX * Math.min(activeBox.interaction.maxOffsetX, 0.02) * LOCKED_FRAME_PARALLAX_SCALE)
        .addScaledVector(
          screenUpAxisRef,
          pointerY * Math.min(activeBox.interaction.maxOffsetY, 0.026) * LOCKED_FRAME_PARALLAX_SCALE,
        )
      desiredTargetOffsetRef.set(0, 0, 0)
    } else {
      desiredOffsetRef
        .copy(rightAxisRef)
        .multiplyScalar(pointerX * activeBox.interaction.maxOffsetX)
        .addScaledVector(screenUpAxisRef, -pointerY * activeBox.interaction.maxOffsetY)
      desiredTargetOffsetRef.copy(anchorTargetRef).sub(baseTargetRef)
    }

    smoothedOffsetRef.current.lerp(desiredOffsetRef, nextSmoothing)
    smoothedTargetOffsetRef.current.lerp(desiredTargetOffsetRef, nextSmoothing)
    if (useLockedFrame) {
      perspectiveCamera.position.copy(baseCameraPositionRef)
    } else {
      perspectiveCamera.position.copy(baseCameraPositionRef).add(smoothedOffsetRef.current)
    }
    selectedTargetRef.copy(baseTargetRef).add(smoothedTargetOffsetRef.current)

    if (useLockedFrame) {
      portalLookAtMatrixRef.lookAt(perspectiveCamera.position, baseTargetRef, screenUpAxisRef)
      portalQuaternionRef.setFromRotationMatrix(portalLookAtMatrixRef)
      perspectiveCamera.quaternion.copy(portalQuaternionRef)
      perspectiveCamera.updateMatrixWorld()
      if (controlsRef.current) {
        controlsRef.current.target.copy(baseTargetRef)
      }
    } else if (controlsRef.current) {
      controlsRef.current.target.copy(selectedTargetRef)
      controlsRef.current.update()
    } else {
      perspectiveCamera.lookAt(selectedTargetRef)
    }

    if (useLockedFrame && lockedFrame) {
      const runtimeMesh = runtimeObject instanceof THREE.Mesh ? runtimeObject : null
      if (runtimeMesh) {
        const shiftX = smoothedOffsetRef.current.dot(rightAxisRef)
        const shiftZ = smoothedOffsetRef.current.dot(screenUpAxisRef)
        applyPortalDepthShear(
          runtimeMesh,
          shiftX,
          shiftZ,
          lockedFrame.dimensions.boxHeight,
        )
        resolveAttachedObjectIds(activeBox.content.attachedObjectIds, store, lockOnlyWhenSelected).forEach((objectId) => {
          const attachedObject = store.runtime.objectById[objectId] ?? null
          const attachedObjectState = store.objects[objectId] ?? null
          if (
            !attachedObject ||
            !attachedObjectState ||
            (transformDragging && objectId === store.selectedObjectId && store.hud.transformMode !== 'none')
          ) {
            return
          }

          lastPortalObjectIdsRef.current.add(objectId)
          applyPortalDepthOffsetToObject({
            object: attachedObject,
            objectState: attachedObjectState,
            boxObject: runtimeMesh,
            boxHeight: lockedFrame.dimensions.boxHeight,
            rightAxis: rightAxisRef,
            screenUpAxis: screenUpAxisRef,
            shiftX,
            shiftZ,
            pointerX,
            pointerY,
            rotationPointerX,
            rotationPointerY,
            yaw,
          })
        })
      }
    }
  })

  return null
}
