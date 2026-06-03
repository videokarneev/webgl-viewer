import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type ShowcaseMotionPermissionState = 'unsupported' | 'idle' | 'granted' | 'denied'

export interface ShowcaseMotionSample {
  x: number
  y: number
  yaw: number
  active: boolean
}

const IDLE_SAMPLE: ShowcaseMotionSample = { x: 0, y: 0, yaw: 0, active: false }
const YAW_RESPONSE_DEGREES = 42

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

export function useShowcaseMotionSensor() {
  const sampleRef = useRef<ShowcaseMotionSample>(IDLE_SAMPLE)
  const baselineRef = useRef<{ beta: number; gamma: number; alpha: number | null; angle: number } | null>(null)
  const motionBaselineRef = useRef<{ x: number; y: number; angle: number } | null>(null)
  const lastOrientationSampleTimeRef = useRef(0)
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
      baselineRef.current = null
      motionBaselineRef.current = null
      lastOrientationSampleTimeRef.current = 0
      return
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') {
        return
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
        sampleRef.current = { x: 0, y: 0, yaw: 0, active: true }
        lastOrientationSampleTimeRef.current = performance.now()
        return
      }

      const { x, y } = resolveTiltAxes(event.beta - baseline.beta, event.gamma - baseline.gamma, angle)
      const yaw = resolveYawAxis(alpha, baseline.alpha)
      sampleRef.current = { x, y, yaw, active: true }
      lastOrientationSampleTimeRef.current = performance.now()
    }

    const handleMotion = (event: DeviceMotionEvent) => {
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
        sampleRef.current = { x: 0, y: 0, yaw: sampleRef.current.yaw, active: true }
        return
      }

      const { x, y } = resolveMotionTiltAxes(gravity.x - baseline.x, gravity.y - baseline.y, angle)
      sampleRef.current = { x, y, yaw: sampleRef.current.yaw, active: true }
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
          baselineRef.current = null
          motionBaselineRef.current = null
          lastOrientationSampleTimeRef.current = 0
        }
        return
      } catch {
        setPermissionState('denied')
        setEnabled(false)
        sampleRef.current = IDLE_SAMPLE
        baselineRef.current = null
        motionBaselineRef.current = null
        lastOrientationSampleTimeRef.current = 0
        return
      }
    }

    setPermissionState('granted')
    setEnabled(true)
  }, [supported])

  const disable = useCallback(() => {
    setEnabled(false)
    sampleRef.current = IDLE_SAMPLE
    baselineRef.current = null
    motionBaselineRef.current = null
    lastOrientationSampleTimeRef.current = 0
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
