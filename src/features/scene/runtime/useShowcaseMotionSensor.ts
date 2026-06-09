import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getShowcaseGyroTuning } from './showcaseGyroTuning'

export type ShowcaseMotionPermissionState = 'unsupported' | 'idle' | 'granted' | 'denied'

export interface ShowcaseMotionSample {
  x: number
  y: number
  yaw: number
  active: boolean
}

const IDLE_SAMPLE: ShowcaseMotionSample = { x: 0, y: 0, yaw: 0, active: false }
const YAW_RESPONSE_DEGREES = 42
const ORIENTATION_SOURCE_TIMEOUT_MS = 320
const RELATIVE_ORIENTATION_PRIORITY_MS = 520
const SENSOR_SMOOTHING_RESPONSE = 5.5
const SENSOR_MAX_STEP_PER_SECOND = 2.35
const SENSOR_DEADZONE = 0.02

type OrientationSensorSource = 'relative' | 'absolute'

function getScreenOrientationAngle() {
  if (typeof window === 'undefined') {
    return 0
  }

  const screenOrientation = window.screen.orientation
  if (screenOrientation && typeof screenOrientation.angle === 'number') {
    return screenOrientation.angle
  }

  const legacyOrientation = (window as Window & { orientation?: number }).orientation
  return typeof legacyOrientation === 'number' ? legacyOrientation : 0
}

function resolveTiltAxes(deltaBeta: number, deltaGamma: number, angle: number) {
  const normalizedAngle = ((Math.round(angle / 90) * 90) % 360 + 360) % 360

  if (normalizedAngle === 90) {
    return {
      x: THREE.MathUtils.clamp(deltaBeta / 35, -1, 1),
      y: THREE.MathUtils.clamp(-deltaGamma / 35, -1, 1),
    }
  }

  if (normalizedAngle === 180) {
    return {
      x: THREE.MathUtils.clamp(-deltaGamma / 35, -1, 1),
      y: THREE.MathUtils.clamp(-deltaBeta / 35, -1, 1),
    }
  }

  if (normalizedAngle === 270) {
    return {
      x: THREE.MathUtils.clamp(-deltaBeta / 35, -1, 1),
      y: THREE.MathUtils.clamp(deltaGamma / 35, -1, 1),
    }
  }

  return {
    x: THREE.MathUtils.clamp(deltaGamma / 35, -1, 1),
    y: THREE.MathUtils.clamp(deltaBeta / 35, -1, 1),
  }
}

function resolveMotionTiltAxes(deltaX: number, deltaY: number, angle: number) {
  const normalizedAngle = ((Math.round(angle / 90) * 90) % 360 + 360) % 360

  if (normalizedAngle === 90) {
    return {
      x: THREE.MathUtils.clamp(deltaY / 6, -1, 1),
      y: THREE.MathUtils.clamp(deltaX / 6, -1, 1),
    }
  }

  if (normalizedAngle === 180) {
    return {
      x: THREE.MathUtils.clamp(-deltaX / 6, -1, 1),
      y: THREE.MathUtils.clamp(deltaY / 6, -1, 1),
    }
  }

  if (normalizedAngle === 270) {
    return {
      x: THREE.MathUtils.clamp(-deltaY / 6, -1, 1),
      y: THREE.MathUtils.clamp(-deltaX / 6, -1, 1),
    }
  }

  return {
    x: THREE.MathUtils.clamp(deltaX / 6, -1, 1),
    y: THREE.MathUtils.clamp(-deltaY / 6, -1, 1),
  }
}

function normalizeSignedAngleDelta(current: number, baseline: number) {
  return ((((current - baseline) % 360) + 540) % 360) - 180
}

function resolveYawAxis(currentAlpha: number | null, baselineAlpha: number | null) {
  if (currentAlpha === null || baselineAlpha === null) {
    return 0
  }

  return THREE.MathUtils.clamp(normalizeSignedAngleDelta(currentAlpha, baselineAlpha) / YAW_RESPONSE_DEGREES, -1, 1)
}

function getOrientationSensorSource(event: DeviceOrientationEvent): OrientationSensorSource {
  return event.type === 'deviceorientationabsolute' ? 'absolute' : 'relative'
}

function applyDeadzone(value: number) {
  if (Math.abs(value) <= SENSOR_DEADZONE) {
    return 0
  }

  return value
}

function resolveSmoothedSample(
  current: ShowcaseMotionSample,
  target: ShowcaseMotionSample,
  deltaSeconds: number,
): ShowcaseMotionSample {
  const tuning = getShowcaseGyroTuning()
  const smoothingScale = Math.max(tuning.smooth, 0.1)
  const smoothing = 1 - Math.exp(-(SENSOR_SMOOTHING_RESPONSE / smoothingScale) * Math.max(deltaSeconds, 0.001))
  const maxStep = (SENSOR_MAX_STEP_PER_SECOND / smoothingScale) * Math.max(deltaSeconds, 0.001)
  const nextX = THREE.MathUtils.clamp(
    current.x + THREE.MathUtils.clamp((target.x - current.x) * smoothing, -maxStep, maxStep),
    -1,
    1,
  )
  const nextY = THREE.MathUtils.clamp(
    current.y + THREE.MathUtils.clamp((target.y - current.y) * smoothing, -maxStep, maxStep),
    -1,
    1,
  )
  const nextYaw = THREE.MathUtils.clamp(
    current.yaw + THREE.MathUtils.clamp((target.yaw - current.yaw) * smoothing, -maxStep, maxStep),
    -1,
    1,
  )

  return {
    x: applyDeadzone(nextX),
    y: applyDeadzone(nextY),
    yaw: applyDeadzone(nextYaw),
    active: target.active,
  }
}

export function useShowcaseMotionSensor() {
  const sampleRef = useRef<ShowcaseMotionSample>(IDLE_SAMPLE)
  const filteredSampleRef = useRef<ShowcaseMotionSample>(IDLE_SAMPLE)
  const baselineRef = useRef<{ beta: number; gamma: number; alpha: number | null; angle: number } | null>(null)
  const motionBaselineRef = useRef<{ x: number; y: number; angle: number } | null>(null)
  const orientationSourceRef = useRef<OrientationSensorSource | null>(null)
  const lastOrientationSampleTimeRef = useRef(0)
  const lastRelativeOrientationSampleTimeRef = useRef(0)
  const lastSensorUpdateTimeRef = useRef(0)
  const [supported, setSupported] = useState(false)
  const [permissionState, setPermissionState] = useState<ShowcaseMotionPermissionState>('unsupported')
  const [enabled, setEnabled] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      (typeof window.DeviceOrientationEvent === 'undefined' && typeof window.DeviceMotionEvent === 'undefined')
    ) {
      setSupported(false)
      setPermissionState('unsupported')
      setNeedsPermission(false)
      return
    }

    const maybePermissionEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    const maybeMotionPermissionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    setSupported(true)
    setNeedsPermission(
      typeof maybePermissionEvent?.requestPermission === 'function' ||
      typeof maybeMotionPermissionEvent?.requestPermission === 'function',
    )
    setPermissionState('idle')
  }, [])

  useEffect(() => {
    if (!supported || !enabled || permissionState !== 'granted' || typeof window === 'undefined') {
      sampleRef.current = IDLE_SAMPLE
      filteredSampleRef.current = IDLE_SAMPLE
      baselineRef.current = null
      motionBaselineRef.current = null
      orientationSourceRef.current = null
      lastOrientationSampleTimeRef.current = 0
      lastRelativeOrientationSampleTimeRef.current = 0
      lastSensorUpdateTimeRef.current = 0
      return
    }

    const publishSample = (target: ShowcaseMotionSample) => {
      const now = performance.now()
      const lastUpdateTime = lastSensorUpdateTimeRef.current || now
      const deltaSeconds = THREE.MathUtils.clamp((now - lastUpdateTime) / 1000, 1 / 120, 0.12)
      const nextSample = resolveSmoothedSample(filteredSampleRef.current, target, deltaSeconds)
      filteredSampleRef.current = nextSample
      sampleRef.current = nextSample
      lastSensorUpdateTimeRef.current = now
    }

    const resetSample = (target: ShowcaseMotionSample) => {
      filteredSampleRef.current = target
      sampleRef.current = target
      lastSensorUpdateTimeRef.current = performance.now()
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') {
        return
      }

      const now = performance.now()
      const source = getOrientationSensorSource(event)
      const activeSource = orientationSourceRef.current
      if (
        source === 'absolute' &&
        lastRelativeOrientationSampleTimeRef.current > 0 &&
        now - lastRelativeOrientationSampleTimeRef.current < RELATIVE_ORIENTATION_PRIORITY_MS
      ) {
        return
      }
      if (activeSource && activeSource !== source) {
        if (source !== 'relative' && now - lastOrientationSampleTimeRef.current < ORIENTATION_SOURCE_TIMEOUT_MS) {
          return
        }
        orientationSourceRef.current = source
        baselineRef.current = null
      } else if (!activeSource) {
        orientationSourceRef.current = source
      }
      if (source === 'relative') {
        lastRelativeOrientationSampleTimeRef.current = now
      }

      const angle = getScreenOrientationAngle()
      const alpha = typeof event.alpha === 'number' ? event.alpha : null
      const baseline = baselineRef.current
      if (!baseline || Math.abs(baseline.angle - angle) >= 45) {
        baselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
          alpha,
          angle,
        }
        resetSample({ x: 0, y: 0, yaw: 0, active: true })
        lastOrientationSampleTimeRef.current = now
        return
      }

      const { x, y } = resolveTiltAxes(event.beta - baseline.beta, event.gamma - baseline.gamma, angle)
      const yaw = resolveYawAxis(alpha, baseline.alpha)
      publishSample({ x, y, yaw, active: true })
      lastOrientationSampleTimeRef.current = now
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      if (performance.now() - lastOrientationSampleTimeRef.current < ORIENTATION_SOURCE_TIMEOUT_MS) {
        return
      }

      const gravity = event.accelerationIncludingGravity
      if (!gravity || typeof gravity.x !== 'number' || typeof gravity.y !== 'number') {
        return
      }

      const angle = getScreenOrientationAngle()
      const baseline = motionBaselineRef.current
      if (!baseline || Math.abs(baseline.angle - angle) >= 45) {
        motionBaselineRef.current = {
          x: gravity.x,
          y: gravity.y,
          angle,
        }
        resetSample({ x: 0, y: 0, yaw: sampleRef.current.yaw, active: true })
        return
      }

      const { x, y } = resolveMotionTiltAxes(gravity.x - baseline.x, gravity.y - baseline.y, angle)
      publishSample({ x, y, yaw: sampleRef.current.yaw, active: true })
    }

    window.addEventListener('deviceorientation', handleOrientation)
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener)
    window.addEventListener('devicemotion', handleMotion)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener)
      window.removeEventListener('devicemotion', handleMotion)
    }
  }, [enabled, permissionState, supported])

  const enable = useCallback(async () => {
    if (!supported || typeof window === 'undefined') {
      setPermissionState('unsupported')
      setEnabled(false)
      return
    }

    const maybePermissionEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    const maybeMotionPermissionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    const permissionRequests: Array<Promise<'granted' | 'denied'>> = []
    if (typeof maybePermissionEvent?.requestPermission === 'function') {
      permissionRequests.push(maybePermissionEvent.requestPermission())
    }
    if (typeof maybeMotionPermissionEvent?.requestPermission === 'function') {
      permissionRequests.push(maybeMotionPermissionEvent.requestPermission())
    }

    if (permissionRequests.length) {
      try {
        const results = await Promise.all(permissionRequests)
        const granted = results.every((result) => result === 'granted')
        setPermissionState(granted ? 'granted' : 'denied')
        setEnabled(granted)
        if (!granted) {
          sampleRef.current = IDLE_SAMPLE
          filteredSampleRef.current = IDLE_SAMPLE
          baselineRef.current = null
          motionBaselineRef.current = null
          orientationSourceRef.current = null
          lastOrientationSampleTimeRef.current = 0
          lastRelativeOrientationSampleTimeRef.current = 0
          lastSensorUpdateTimeRef.current = 0
        }
        return
      } catch {
        setPermissionState('denied')
        setEnabled(false)
        sampleRef.current = IDLE_SAMPLE
        filteredSampleRef.current = IDLE_SAMPLE
        baselineRef.current = null
        motionBaselineRef.current = null
        orientationSourceRef.current = null
        lastOrientationSampleTimeRef.current = 0
        lastRelativeOrientationSampleTimeRef.current = 0
        lastSensorUpdateTimeRef.current = 0
        return
      }
    }

    setPermissionState('granted')
    setEnabled(true)
  }, [supported])

  const disable = useCallback(() => {
    setEnabled(false)
    sampleRef.current = IDLE_SAMPLE
    filteredSampleRef.current = IDLE_SAMPLE
    baselineRef.current = null
    motionBaselineRef.current = null
    orientationSourceRef.current = null
    lastOrientationSampleTimeRef.current = 0
    lastRelativeOrientationSampleTimeRef.current = 0
    lastSensorUpdateTimeRef.current = 0
  }, [])

  const toggle = useCallback(async () => {
    if (enabled) {
      disable()
      return
    }

    await enable()
  }, [disable, enable, enabled])

  return {
    sampleRef,
    supported,
    enabled,
    needsPermission,
    permissionState,
    enable,
    disable,
    toggle,
  }
}
