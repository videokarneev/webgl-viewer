import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore, type RotateAnimationAxis, type RotateAnimationState, type SceneGraphNode } from '../store/editorStore'

const FULL_TURN_RADIANS = Math.PI * 2

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

function buildConfigKey(animation: RotateAnimationState) {
  return `${animation.targetObjectId ?? 'none'}:${animation.pivot}:${animation.axis}`
}

function progressToAngle(progress: number) {
  return THREE.MathUtils.clamp(progress, 0, 100) / 100 * FULL_TURN_RADIANS
}

function angleToProgress(angle: number) {
  return (THREE.MathUtils.euclideanModulo(angle, FULL_TURN_RADIANS) / FULL_TURN_RADIANS) * 100
}

export function SceneAnimationController() {
  const sessionRef = useRef<RotateSession | null>(null)
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

  const restoreSessionPose = (session: RotateSession | null) => {
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

  useEffect(() => {
    return () => {
      restoreSessionPose(sessionRef.current)
      sessionRef.current = null
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

  return null
}
