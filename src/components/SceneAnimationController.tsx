import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { focusPointerState, suppressFocusScenePointerInput } from '../features/scene/runtime/FocusInteractionController'
import {
  useEditorStore,
  type FloatAnimationState,
  type FocusFrontFace,
  type RotateAnimationAxis,
  type RotateAnimationState,
  type SceneGraphNode,
} from '../store/editorStore'

const FULL_TURN_RADIANS = Math.PI * 2
const FOCUS_RETURN_POINTER_SUPPRESSION_PADDING_MS = 180

type RotateSession = {
  targetObjectId: string
  configKey: string
  object: THREE.Object3D
  baseLocalPosition: THREE.Vector3
  baseLocalQuaternion: THREE.Quaternion
  baseLocalScale: THREE.Vector3
  baseWorldPosition: THREE.Vector3
  baseWorldQuaternion: THREE.Quaternion
  pivotWorldPosition: THREE.Vector3
  axisWorld: THREE.Vector3
  angle: number
  completed: boolean
}

type FloatSession = {
  targetObjectId: string
  object: THREE.Object3D
  baseLocalPosition: THREE.Vector3
  baseLocalQuaternion: THREE.Quaternion
  baseLocalScale: THREE.Vector3
  phase: number
  completed: boolean
}

type FocusSession = {
  targetObjectId: string
  object: THREE.Object3D
  focused: boolean
  elapsed: number
  duration: number
  restWorldPosition: THREE.Vector3
  restWorldQuaternion: THREE.Quaternion
  localCenter: THREE.Vector3
  startWorldPosition: THREE.Vector3
  startWorldQuaternion: THREE.Quaternion
  currentWorldPosition: THREE.Vector3
  currentWorldQuaternion: THREE.Quaternion
}

function isAnimatableNode(node: SceneGraphNode | null | undefined) {
  return Boolean(node && (node.type === 'scene' || node.type === 'group' || node.type === 'mesh'))
}

function getAxisVector(axis: RotateAnimationAxis) {
  if (axis === 'x') {
    return new THREE.Vector3(1, 0, 0)
  }
  if (axis === 'z') {
    return new THREE.Vector3(0, 0, 1)
  }
  return new THREE.Vector3(0, 1, 0)
}

function getFrontFaceVector(frontFace: FocusFrontFace) {
  switch (frontFace) {
    case '+x':
      return new THREE.Vector3(1, 0, 0)
    case '-x':
      return new THREE.Vector3(-1, 0, 0)
    case '+y':
      return new THREE.Vector3(0, 1, 0)
    case '-y':
      return new THREE.Vector3(0, -1, 0)
    case '-z':
      return new THREE.Vector3(0, 0, -1)
    case '+z':
    default:
      return new THREE.Vector3(0, 0, 1)
  }
}

function easeInOutCubic(value: number) {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function buildConfigKey(animation: RotateAnimationState) {
  return `${animation.targetObjectId ?? 'none'}:${animation.pivot}:${animation.axis}`
}

function progressToAngle(progress: number) {
  return THREE.MathUtils.clamp(progress, 0, 100) / 100 * FULL_TURN_RADIANS
}

function angleToProgress(angle: number) {
  return (THREE.MathUtils.euclideanModulo(angle, FULL_TURN_RADIANS) / FULL_TURN_RADIANS) * 100
}

function progressToPhase(progress: number) {
  return THREE.MathUtils.clamp(progress, 0, 100) / 100 * FULL_TURN_RADIANS
}

function phaseToProgress(phase: number) {
  return (THREE.MathUtils.euclideanModulo(phase, FULL_TURN_RADIANS) / FULL_TURN_RADIANS) * 100
}

export function SceneAnimationController() {
  const sessionRef = useRef<RotateSession | null>(null)
  const floatSessionRef = useRef<FloatSession | null>(null)
  const focusSessionRef = useRef<FocusSession | null>(null)
  const focusPointerRef = useRef({ x: 0, y: 0 })
  const tempBox = useMemo(() => new THREE.Box3(), [])
  const tempCenter = useMemo(() => new THREE.Vector3(), [])
  const tempAxis = useMemo(() => new THREE.Vector3(), [])
  const tempDeltaQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const tempWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempParentPosition = useMemo(() => new THREE.Vector3(), [])
  const tempParentScale = useMemo(() => new THREE.Vector3(), [])
  const tempLocalPosition = useMemo(() => new THREE.Vector3(), [])
  const tempOffset = useMemo(() => new THREE.Vector3(), [])
  const tempInverseParentQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempFloatQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempFloatTiltX = useMemo(() => new THREE.Quaternion(), [])
  const tempFloatTiltZ = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusForward = useMemo(() => new THREE.Vector3(), [])
  const tempFocusTargetPosition = useMemo(() => new THREE.Vector3(), [])
  const tempFocusMatrix = useMemo(() => new THREE.Matrix4(), [])
  const tempFocusLookQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusFrontCorrection = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusFront = useMemo(() => new THREE.Vector3(), [])
  const tempFocusCurrentPosition = useMemo(() => new THREE.Vector3(), [])
  const tempFocusCurrentQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusObjectScale = useMemo(() => new THREE.Vector3(), [])
  const tempFocusCenter = useMemo(() => new THREE.Vector3(), [])
  const tempFocusLocalCenter = useMemo(() => new THREE.Vector3(), [])
  const tempFocusCenterOffset = useMemo(() => new THREE.Vector3(), [])
  const tempFocusInverseMatrix = useMemo(() => new THREE.Matrix4(), [])
  const tempFocusRight = useMemo(() => new THREE.Vector3(), [])
  const tempFocusUp = useMemo(() => new THREE.Vector3(), [])
  const tempFocusParallaxPosition = useMemo(() => new THREE.Vector3(), [])
  const tempFocusTiltX = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusTiltY = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusParallaxQuaternion = useMemo(() => new THREE.Quaternion(), [])

  const restoreSessionPose = (session: RotateSession | null) => {
    if (!session) {
      return
    }

    session.object.position.copy(session.baseLocalPosition)
    session.object.quaternion.copy(session.baseLocalQuaternion)
    session.object.scale.copy(session.baseLocalScale)
    session.object.updateMatrixWorld(true)
  }

  const restoreFloatSessionPose = (session: FloatSession | null) => {
    if (!session) {
      return
    }

    session.object.position.copy(session.baseLocalPosition)
    session.object.quaternion.copy(session.baseLocalQuaternion)
    session.object.scale.copy(session.baseLocalScale)
    session.object.updateMatrixWorld(true)
  }

  const captureSession = (object: THREE.Object3D, animation: RotateAnimationState) => {
    object.updateWorldMatrix(true, true)
    object.getWorldPosition(tempWorldPosition)
    object.getWorldQuaternion(tempWorldQuaternion)

    if (animation.pivot === 'gizmo') {
      tempBox.setFromObject(object)
      if (tempBox.isEmpty()) {
        tempCenter.copy(tempWorldPosition)
      } else {
        tempBox.getCenter(tempCenter)
      }
    } else {
      tempCenter.copy(tempWorldPosition)
    }

    tempAxis.copy(getAxisVector(animation.axis)).applyQuaternion(tempWorldQuaternion).normalize()

    sessionRef.current = {
      targetObjectId: animation.targetObjectId ?? '',
      configKey: buildConfigKey(animation),
      object,
      baseLocalPosition: object.position.clone(),
      baseLocalQuaternion: object.quaternion.clone(),
      baseLocalScale: object.scale.clone(),
      baseWorldPosition: tempWorldPosition.clone(),
      baseWorldQuaternion: tempWorldQuaternion.clone(),
      pivotWorldPosition: tempCenter.clone(),
      axisWorld: tempAxis.clone(),
      angle: progressToAngle(animation.progress),
      completed: false,
    }
  }

  const applySessionAngle = (session: RotateSession, angle: number) => {
    tempDeltaQuaternion.setFromAxisAngle(session.axisWorld, angle)
    tempOffset.copy(session.baseWorldPosition).sub(session.pivotWorldPosition).applyQuaternion(tempDeltaQuaternion)
    tempWorldPosition.copy(session.pivotWorldPosition).add(tempOffset)
    tempWorldQuaternion.copy(session.baseWorldQuaternion).premultiply(tempDeltaQuaternion)

    const parent = session.object.parent
    if (parent) {
      parent.updateWorldMatrix(true, true)
      parent.getWorldQuaternion(tempParentQuaternion)
      parent.getWorldPosition(tempParentPosition)
      parent.getWorldScale(tempParentScale)
      tempInverseParentQuaternion.copy(tempParentQuaternion).invert()
      tempLocalPosition.copy(tempWorldPosition).sub(tempParentPosition)
      tempLocalPosition.applyQuaternion(tempInverseParentQuaternion)
      tempLocalPosition.divide(tempParentScale)
      session.object.position.copy(tempLocalPosition)
      session.object.quaternion.copy(tempInverseParentQuaternion.multiply(tempWorldQuaternion))
    } else {
      session.object.position.copy(tempWorldPosition)
      session.object.quaternion.copy(tempWorldQuaternion)
    }

    session.object.scale.copy(session.baseLocalScale)
    session.object.updateMatrixWorld(true)
  }

  const applyWorldPose = (object: THREE.Object3D, worldPosition: THREE.Vector3, worldQuaternion: THREE.Quaternion) => {
    const parent = object.parent
    if (parent) {
      parent.updateWorldMatrix(true, true)
      parent.getWorldQuaternion(tempParentQuaternion)
      parent.getWorldPosition(tempParentPosition)
      parent.getWorldScale(tempParentScale)
      tempInverseParentQuaternion.copy(tempParentQuaternion).invert()
      tempLocalPosition.copy(worldPosition).sub(tempParentPosition)
      tempLocalPosition.applyQuaternion(tempInverseParentQuaternion)
      tempLocalPosition.divide(tempParentScale)
      object.position.copy(tempLocalPosition)
      object.quaternion.copy(tempInverseParentQuaternion.multiply(worldQuaternion))
    } else {
      object.position.copy(worldPosition)
      object.quaternion.copy(worldQuaternion)
    }

    object.updateMatrixWorld(true)
  }

  const captureFloatSession = (object: THREE.Object3D, animation: FloatAnimationState) => {
    floatSessionRef.current = {
      targetObjectId: animation.targetObjectId ?? '',
      object,
      baseLocalPosition: object.position.clone(),
      baseLocalQuaternion: object.quaternion.clone(),
      baseLocalScale: object.scale.clone(),
      phase: progressToPhase(animation.progress),
      completed: false,
    }
  }

  const applyFloatPhase = (session: FloatSession, animation: FloatAnimationState) => {
    const bob = Math.sin(session.phase) * animation.amplitude
    const tiltRadians = THREE.MathUtils.degToRad(animation.tilt)
    const tiltX = Math.sin(session.phase + Math.PI * 0.5) * tiltRadians
    const tiltZ = Math.sin(session.phase + Math.PI * 0.18) * tiltRadians * 0.65

    session.object.position.copy(session.baseLocalPosition)
    session.object.position.y += bob
    tempFloatTiltX.setFromAxisAngle(tempAxis.set(1, 0, 0), tiltX)
    tempFloatTiltZ.setFromAxisAngle(tempAxis.set(0, 0, 1), tiltZ)
    tempFloatQuaternion.copy(session.baseLocalQuaternion).multiply(tempFloatTiltX).multiply(tempFloatTiltZ)
    session.object.quaternion.copy(tempFloatQuaternion)
    session.object.scale.copy(session.baseLocalScale)
    session.object.updateMatrixWorld(true)
  }

  const getLocalBoundingCenter = (object: THREE.Object3D) => {
    tempBox.setFromObject(object)
    if (tempBox.isEmpty()) {
      tempFocusLocalCenter.set(0, 0, 0)
      return tempFocusLocalCenter
    }

    tempBox.getCenter(tempFocusCenter)
    tempFocusInverseMatrix.copy(object.matrixWorld).invert()
    return tempFocusLocalCenter.copy(tempFocusCenter).applyMatrix4(tempFocusInverseMatrix)
  }

  const getWorldPositionForFocusedCenter = (
    object: THREE.Object3D,
    worldCenter: THREE.Vector3,
    worldQuaternion: THREE.Quaternion,
    localCenter: THREE.Vector3,
  ) => {
    object.getWorldScale(tempFocusObjectScale)
    tempFocusCenterOffset.copy(localCenter).multiply(tempFocusObjectScale).applyQuaternion(worldQuaternion)
    return tempWorldPosition.copy(worldCenter).sub(tempFocusCenterOffset)
  }

  useEffect(() => {
    return () => {
      restoreSessionPose(sessionRef.current)
      sessionRef.current = null
      restoreFloatSessionPose(floatSessionRef.current)
      floatSessionRef.current = null
      focusSessionRef.current = null
    }
  }, [])

  useFrame((_, delta) => {
    const store = useEditorStore.getState()
    const animation = store.rotateAnimation
    const configKey = buildConfigKey(animation)
    const targetNode = animation.targetObjectId ? store.sceneGraph[animation.targetObjectId] ?? null : null
    const targetObject = animation.targetObjectId ? store.runtime.objectById[animation.targetObjectId] ?? null : null

    if (
      !animation.isAdded ||
      !animation.enabled ||
      !animation.targetObjectId ||
      !isAnimatableNode(targetNode) ||
      !targetObject
    ) {
      restoreSessionPose(sessionRef.current)
      sessionRef.current = null
      return
    }

    if (sessionRef.current && sessionRef.current.configKey !== configKey) {
      restoreSessionPose(sessionRef.current)
      sessionRef.current = null
    }

    if (!animation.play) {
      if (!sessionRef.current) {
        captureSession(targetObject, animation)
      }

      if (sessionRef.current) {
        sessionRef.current.angle = progressToAngle(animation.progress)
        applySessionAngle(sessionRef.current, sessionRef.current.angle)
      }
      return
    }

    if (sessionRef.current?.completed) {
      restoreSessionPose(sessionRef.current)
      sessionRef.current = null
    }

    if (!sessionRef.current) {
      captureSession(targetObject, animation)
    }

    const session = sessionRef.current
    if (!session) {
      return
    }

    const angleStep = THREE.MathUtils.degToRad(animation.speed) * delta
    if (animation.loop) {
      session.angle = (session.angle + angleStep) % FULL_TURN_RADIANS
      applySessionAngle(session, session.angle)
      useEditorStore.getState().updateRotateAnimation({ progress: angleToProgress(session.angle) })
      return
    }

    const nextAngle = session.angle + angleStep
    if (nextAngle >= FULL_TURN_RADIANS) {
      restoreSessionPose(session)
      session.angle = FULL_TURN_RADIANS
      session.completed = true
      useEditorStore.getState().updateRotateAnimation({ play: false, progress: 100 })
      return
    }

    session.angle = nextAngle
    applySessionAngle(session, session.angle)
    useEditorStore.getState().updateRotateAnimation({ progress: angleToProgress(session.angle) })
  })

  useFrame((_, delta) => {
    const store = useEditorStore.getState()
    const animation = store.floatAnimation
    const targetNode = animation.targetObjectId ? store.sceneGraph[animation.targetObjectId] ?? null : null
    const targetObject = animation.targetObjectId ? store.runtime.objectById[animation.targetObjectId] ?? null : null

    if (
      !animation.isAdded ||
      !animation.enabled ||
      !animation.targetObjectId ||
      !isAnimatableNode(targetNode) ||
      !targetObject
    ) {
      restoreFloatSessionPose(floatSessionRef.current)
      floatSessionRef.current = null
      return
    }

    if (floatSessionRef.current && floatSessionRef.current.targetObjectId !== animation.targetObjectId) {
      restoreFloatSessionPose(floatSessionRef.current)
      floatSessionRef.current = null
    }

    if (!animation.play) {
      if (!floatSessionRef.current) {
        captureFloatSession(targetObject, animation)
      }

      if (floatSessionRef.current) {
        floatSessionRef.current.phase = progressToPhase(animation.progress)
        applyFloatPhase(floatSessionRef.current, animation)
      }
      return
    }

    if (floatSessionRef.current?.completed) {
      restoreFloatSessionPose(floatSessionRef.current)
      floatSessionRef.current = null
    }

    if (!floatSessionRef.current) {
      captureFloatSession(targetObject, animation)
    }

    const session = floatSessionRef.current
    if (!session) {
      return
    }

    const phaseStep = Math.max(animation.speed, 0) * FULL_TURN_RADIANS * delta
    if (animation.loop) {
      session.phase = (session.phase + phaseStep) % FULL_TURN_RADIANS
      applyFloatPhase(session, animation)
      useEditorStore.getState().updateFloatAnimation({ progress: phaseToProgress(session.phase) })
      return
    }

    const nextPhase = session.phase + phaseStep
    if (nextPhase >= FULL_TURN_RADIANS) {
      restoreFloatSessionPose(session)
      session.phase = FULL_TURN_RADIANS
      session.completed = true
      useEditorStore.getState().updateFloatAnimation({ play: false, progress: 100 })
      return
    }

    session.phase = nextPhase
    applyFloatPhase(session, animation)
    useEditorStore.getState().updateFloatAnimation({ progress: phaseToProgress(session.phase) })
  })

  useFrame(({ camera }, delta) => {
    const store = useEditorStore.getState()
    const animation = store.focusAnimation
    const targetNode = animation.targetObjectId ? store.sceneGraph[animation.targetObjectId] ?? null : null
    const targetObject = animation.targetObjectId ? store.runtime.objectById[animation.targetObjectId] ?? null : null

    if (
      !animation.isAdded ||
      !animation.enabled ||
      !animation.targetObjectId ||
      !isAnimatableNode(targetNode) ||
      !targetObject
    ) {
      focusSessionRef.current = null
      return
    }

    targetObject.updateWorldMatrix(true, true)
    targetObject.getWorldPosition(tempWorldPosition)
    targetObject.getWorldQuaternion(tempWorldQuaternion)

    const desiredFocused = animation.focused
    const duration = Math.max(animation.duration, 0.001)
    let session = focusSessionRef.current
    if (!desiredFocused && !session) {
      return
    }

    if (!session || session.targetObjectId !== animation.targetObjectId || session.focused !== desiredFocused) {
      if (!desiredFocused) {
        focusPointerRef.current.x = 0
        focusPointerRef.current.y = 0
        suppressFocusScenePointerInput(duration * 1000 + FOCUS_RETURN_POINTER_SUPPRESSION_PADDING_MS)
      }

      const localCenter = session
        ? session.localCenter.clone()
        : getLocalBoundingCenter(targetObject).clone()
      const restWorldPosition = session
        ? session.restWorldPosition.clone()
        : tempWorldPosition.clone()
      const restWorldQuaternion = session
        ? session.restWorldQuaternion.clone()
        : tempWorldQuaternion.clone()
      const startWorldPosition = session
        ? session.currentWorldPosition.clone()
        : tempWorldPosition.clone()
      const startWorldQuaternion = session
        ? session.currentWorldQuaternion.clone()
        : tempWorldQuaternion.clone()

      session = {
        targetObjectId: animation.targetObjectId,
        object: targetObject,
        focused: desiredFocused,
        elapsed: 0,
        duration,
        restWorldPosition,
        restWorldQuaternion,
        localCenter,
        startWorldPosition,
        startWorldQuaternion,
        currentWorldPosition: startWorldPosition.clone(),
        currentWorldQuaternion: startWorldQuaternion.clone(),
      }
      focusSessionRef.current = session
    }

    session.duration = duration
    session.elapsed = Math.min(session.elapsed + delta, session.duration)

    camera.getWorldDirection(tempFocusForward)
    tempFocusTargetPosition.copy(camera.position).addScaledVector(tempFocusForward, Math.max(animation.distance, 0.01))
    tempFocusRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize()
    tempFocusUp.copy(camera.up).normalize()
    focusPointerRef.current.x = THREE.MathUtils.lerp(
      focusPointerRef.current.x,
      desiredFocused ? focusPointerState.targetX : 0,
      Math.min(delta * 8, 1),
    )
    focusPointerRef.current.y = THREE.MathUtils.lerp(
      focusPointerRef.current.y,
      desiredFocused ? focusPointerState.targetY : 0,
      Math.min(delta * 8, 1),
    )
    tempFocusParallaxPosition.copy(tempFocusTargetPosition)
    if (desiredFocused) {
      tempFocusParallaxPosition
        .addScaledVector(tempFocusRight, focusPointerRef.current.x * 0.0225)
        .addScaledVector(tempFocusUp, focusPointerRef.current.y * 0.0175)
    }

    tempFocusMatrix.lookAt(tempFocusTargetPosition, camera.position, camera.up)
    tempFocusLookQuaternion.setFromRotationMatrix(tempFocusMatrix)
    tempFocusFront.copy(getFrontFaceVector(animation.frontFace)).normalize()
    tempFocusFrontCorrection.setFromUnitVectors(tempFocusFront, tempAxis.set(0, 0, -1))
    tempFocusLookQuaternion.multiply(tempFocusFrontCorrection)
    if (desiredFocused) {
      tempFocusTiltY.setFromAxisAngle(tempFocusUp, -focusPointerRef.current.x * THREE.MathUtils.degToRad(1.1))
      tempFocusTiltX.setFromAxisAngle(tempFocusRight, focusPointerRef.current.y * THREE.MathUtils.degToRad(0.8))
      tempFocusParallaxQuaternion.copy(tempFocusTiltY).multiply(tempFocusTiltX)
      tempFocusLookQuaternion.premultiply(tempFocusParallaxQuaternion)
    }

    const targetWorldPosition = desiredFocused
      ? getWorldPositionForFocusedCenter(targetObject, tempFocusParallaxPosition, tempFocusLookQuaternion, session.localCenter)
      : session.restWorldPosition
    const targetWorldQuaternion = desiredFocused ? tempFocusLookQuaternion : session.restWorldQuaternion
    const progress = easeInOutCubic(session.elapsed / session.duration)
    tempFocusCurrentPosition.copy(session.startWorldPosition).lerp(targetWorldPosition, progress)
    tempFocusCurrentQuaternion.copy(session.startWorldQuaternion).slerp(targetWorldQuaternion, progress)
    applyWorldPose(targetObject, tempFocusCurrentPosition, tempFocusCurrentQuaternion)
    session.currentWorldPosition.copy(tempFocusCurrentPosition)
    session.currentWorldQuaternion.copy(tempFocusCurrentQuaternion)

    if (!desiredFocused && progress >= 1) {
      focusSessionRef.current = null
    }
  })

  return null
}
