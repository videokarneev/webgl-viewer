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
const FOCUS_FRAME_EDGE_MARGIN_RATIO = 0.045
const FOCUS_FRAME_MIN_EDGE_MARGIN_PX = 14
const FOCUS_FRAME_MAX_EDGE_MARGIN_PX = 56
const FOCUS_FRAME_DISTANCE_GROWTH = 1.35
const FOCUS_FRAME_DISTANCE_SEARCH_STEPS = 20

type FocusFrameInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

type FocusNdcRect = {
  left: number
  right: number
  top: number
  bottom: number
}

type FocusFramingResult = {
  distance: number
  offsetX: number
  offsetY: number
}

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
  localBoundsMin: THREE.Vector3
  localBoundsMax: THREE.Vector3
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

function getUrlFrameInsetParam(params: URLSearchParams, key: string) {
  const value = params.get(key)
  if (!value) {
    return 0
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function getUrlFrameInsetParamWithAuto(
  params: URLSearchParams,
  key: string,
  autoValue: number,
  defaultValue = 0,
) {
  const value = params.get(key)
  if (!value) {
    return defaultValue
  }

  if (value.toLowerCase() === 'auto') {
    return autoValue
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function getFocusFrameInsets(viewportWidth: number): FocusFrameInsets {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  const params = new URL(window.location.href).searchParams
  const autoTopInset = viewportWidth <= 960 ? 52 : 64
  const responsiveTopKey = viewportWidth <= 960 ? 'frameInsetTopMobile' : 'frameInsetTopDesktop'
  const responsiveTop = params.has(responsiveTopKey) ? getUrlFrameInsetParam(params, responsiveTopKey) : null
  const transparentPlayerFallbackTop = params.get('transparent') === '1' ? autoTopInset : 0

  return {
    top: responsiveTop ?? getUrlFrameInsetParamWithAuto(
      params,
      'frameInsetTop',
      autoTopInset,
      transparentPlayerFallbackTop,
    ),
    right: getUrlFrameInsetParam(params, 'frameInsetRight'),
    bottom: getUrlFrameInsetParam(params, 'frameInsetBottom'),
    left: getUrlFrameInsetParam(params, 'frameInsetLeft'),
  }
}

function getFocusSafeNdcRect(width: number, height: number): FocusNdcRect {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const insets = getFocusFrameInsets(safeWidth)
  const edgeMargin = THREE.MathUtils.clamp(
    Math.min(safeWidth, safeHeight) * FOCUS_FRAME_EDGE_MARGIN_RATIO,
    FOCUS_FRAME_MIN_EDGE_MARGIN_PX,
    FOCUS_FRAME_MAX_EDGE_MARGIN_PX,
  )
  const leftPx = THREE.MathUtils.clamp(insets.left + edgeMargin, 0, safeWidth - 1)
  const rightPx = THREE.MathUtils.clamp(safeWidth - insets.right - edgeMargin, leftPx + 1, safeWidth)
  const topPx = THREE.MathUtils.clamp(insets.top + edgeMargin, 0, safeHeight - 1)
  const bottomPx = THREE.MathUtils.clamp(safeHeight - insets.bottom - edgeMargin, topPx + 1, safeHeight)

  return {
    left: (leftPx / safeWidth) * 2 - 1,
    right: (rightPx / safeWidth) * 2 - 1,
    top: 1 - (topPx / safeHeight) * 2,
    bottom: 1 - (bottomPx / safeHeight) * 2,
  }
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
  const tempFocusLocalBoundsMin = useMemo(() => new THREE.Vector3(), [])
  const tempFocusLocalBoundsMax = useMemo(() => new THREE.Vector3(), [])
  const tempFocusBoundsCorner = useMemo(() => new THREE.Vector3(), [])
  const tempFocusCenterOffset = useMemo(() => new THREE.Vector3(), [])
  const tempFocusInverseMatrix = useMemo(() => new THREE.Matrix4(), [])
  const tempFocusRight = useMemo(() => new THREE.Vector3(), [])
  const tempFocusUp = useMemo(() => new THREE.Vector3(), [])
  const tempFocusParallaxPosition = useMemo(() => new THREE.Vector3(), [])
  const tempFocusTiltX = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusTiltY = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusParallaxQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const tempFocusCameraInverseQuaternion = useMemo(() => new THREE.Quaternion(), [])

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

  const captureLocalBounds = (object: THREE.Object3D) => {
    tempBox.setFromObject(object)
    if (tempBox.isEmpty()) {
      tempFocusLocalBoundsMin.set(0, 0, 0)
      tempFocusLocalBoundsMax.set(0, 0, 0)
      return
    }

    const minX = tempBox.min.x
    const minY = tempBox.min.y
    const minZ = tempBox.min.z
    const maxX = tempBox.max.x
    const maxY = tempBox.max.y
    const maxZ = tempBox.max.z
    tempFocusInverseMatrix.copy(object.matrixWorld).invert()
    tempFocusLocalBoundsMin.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    tempFocusLocalBoundsMax.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

    for (let index = 0; index < 8; index += 1) {
      tempFocusBoundsCorner
        .set(
          index & 1 ? maxX : minX,
          index & 2 ? maxY : minY,
          index & 4 ? maxZ : minZ,
        )
        .applyMatrix4(tempFocusInverseMatrix)
      tempFocusLocalBoundsMin.min(tempFocusBoundsCorner)
      tempFocusLocalBoundsMax.max(tempFocusBoundsCorner)
    }
  }

  const getFocusedFraming = (
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
    object: THREE.Object3D,
    worldQuaternion: THREE.Quaternion,
    localCenter: THREE.Vector3,
    localBoundsMin: THREE.Vector3,
    localBoundsMax: THREE.Vector3,
    requestedDistance: number,
    preferredOffsetX: number,
    preferredOffsetY: number,
  ): FocusFramingResult => {
    const minimumDistance = Math.max(requestedDistance, 0.01)
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return {
        distance: minimumDistance,
        offsetX: preferredOffsetX,
        offsetY: preferredOffsetY,
      }
    }

    object.getWorldScale(tempFocusObjectScale)
    tempFocusCameraInverseQuaternion.copy(camera.quaternion).invert()
    const safeRect = getFocusSafeNdcRect(viewportWidth, viewportHeight)
    const verticalTan = Math.max(Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5), 0.0001)
    const horizontalTan = verticalTan * Math.max(camera.aspect, 0.001)
    const minimumDepth = Math.max(camera.near + 0.01, 0.01)
    const candidate: FocusFramingResult = {
      distance: minimumDistance,
      offsetX: preferredOffsetX,
      offsetY: preferredOffsetY,
    }

    const resolveAtDistance = (distance: number, result: FocusFramingResult) => {
      let minOffsetX = Number.NEGATIVE_INFINITY
      let maxOffsetX = Number.POSITIVE_INFINITY
      let minOffsetY = Number.NEGATIVE_INFINITY
      let maxOffsetY = Number.POSITIVE_INFINITY

      for (let index = 0; index < 8; index += 1) {
        tempFocusBoundsCorner
          .set(
            index & 1 ? localBoundsMax.x : localBoundsMin.x,
            index & 2 ? localBoundsMax.y : localBoundsMin.y,
            index & 4 ? localBoundsMax.z : localBoundsMin.z,
          )
          .sub(localCenter)
          .multiply(tempFocusObjectScale)
          .applyQuaternion(worldQuaternion)
          .applyQuaternion(tempFocusCameraInverseQuaternion)

        const depth = distance - tempFocusBoundsCorner.z
        if (depth <= minimumDepth) {
          return false
        }

        const horizontalDepth = depth * horizontalTan
        const verticalDepth = depth * verticalTan
        minOffsetX = Math.max(minOffsetX, safeRect.left * horizontalDepth - tempFocusBoundsCorner.x)
        maxOffsetX = Math.min(maxOffsetX, safeRect.right * horizontalDepth - tempFocusBoundsCorner.x)
        minOffsetY = Math.max(minOffsetY, safeRect.bottom * verticalDepth - tempFocusBoundsCorner.y)
        maxOffsetY = Math.min(maxOffsetY, safeRect.top * verticalDepth - tempFocusBoundsCorner.y)
      }

      if (minOffsetX > maxOffsetX || minOffsetY > maxOffsetY) {
        return false
      }

      const balancedOffsetX = (minOffsetX + maxOffsetX) * 0.5
      const balancedOffsetY = (minOffsetY + maxOffsetY) * 0.5
      result.distance = distance
      result.offsetX = THREE.MathUtils.clamp(balancedOffsetX + preferredOffsetX, minOffsetX, maxOffsetX)
      result.offsetY = THREE.MathUtils.clamp(balancedOffsetY + preferredOffsetY, minOffsetY, maxOffsetY)
      return true
    }

    if (resolveAtDistance(minimumDistance, candidate)) {
      return { ...candidate }
    }

    let lowDistance = minimumDistance
    let highDistance = Math.max(minimumDistance * FOCUS_FRAME_DISTANCE_GROWTH, minimumDistance + 0.1)
    let found = false
    for (let attempt = 0; attempt < FOCUS_FRAME_DISTANCE_SEARCH_STEPS; attempt += 1) {
      if (resolveAtDistance(highDistance, candidate)) {
        found = true
        break
      }
      lowDistance = highDistance
      highDistance = highDistance * FOCUS_FRAME_DISTANCE_GROWTH + 0.05
    }

    if (!found) {
      return {
        distance: highDistance,
        offsetX: preferredOffsetX,
        offsetY: preferredOffsetY,
      }
    }

    const best = { ...candidate }
    for (let step = 0; step < FOCUS_FRAME_DISTANCE_SEARCH_STEPS; step += 1) {
      const midDistance = (lowDistance + highDistance) * 0.5
      if (resolveAtDistance(midDistance, candidate)) {
        highDistance = midDistance
        best.distance = candidate.distance
        best.offsetX = candidate.offsetX
        best.offsetY = candidate.offsetY
      } else {
        lowDistance = midDistance
      }
    }

    return best
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

  useFrame(({ camera, size }, delta) => {
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
      if (!session) {
        captureLocalBounds(targetObject)
      }
      const localBoundsMin = session
        ? session.localBoundsMin.clone()
        : tempFocusLocalBoundsMin.clone()
      const localBoundsMax = session
        ? session.localBoundsMax.clone()
        : tempFocusLocalBoundsMax.clone()
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
        localBoundsMin,
        localBoundsMax,
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
    tempFocusUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize()
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
    tempFocusMatrix.lookAt(tempFocusTargetPosition, camera.position, tempFocusUp)
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

    const focusFraming = desiredFocused
      ? getFocusedFraming(
        camera,
        size.width,
        size.height,
        targetObject,
        tempFocusLookQuaternion,
        session.localCenter,
        session.localBoundsMin,
        session.localBoundsMax,
        animation.distance,
        focusPointerRef.current.x * 0.0225,
        focusPointerRef.current.y * 0.0175,
      )
      : null
    tempFocusParallaxPosition
      .copy(camera.position)
      .addScaledVector(tempFocusForward, Math.max(focusFraming?.distance ?? animation.distance, 0.01))
    if (desiredFocused) {
      tempFocusParallaxPosition
        .addScaledVector(tempFocusRight, focusFraming?.offsetX ?? 0)
        .addScaledVector(tempFocusUp, focusFraming?.offsetY ?? 0)
    }

    const shouldReturnToLiveFloatPose =
      !desiredFocused &&
      floatSessionRef.current?.targetObjectId === animation.targetObjectId &&
      floatSessionRef.current.object === targetObject &&
      store.floatAnimation.isAdded &&
      store.floatAnimation.enabled &&
      store.floatAnimation.targetObjectId === animation.targetObjectId
    const targetWorldPosition = desiredFocused
      ? getWorldPositionForFocusedCenter(targetObject, tempFocusParallaxPosition, tempFocusLookQuaternion, session.localCenter)
      : shouldReturnToLiveFloatPose
        ? tempWorldPosition
        : session.restWorldPosition
    const targetWorldQuaternion = desiredFocused
      ? tempFocusLookQuaternion
      : shouldReturnToLiveFloatPose
        ? tempWorldQuaternion
        : session.restWorldQuaternion
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
