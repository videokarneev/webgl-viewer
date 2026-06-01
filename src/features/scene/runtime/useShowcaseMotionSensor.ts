import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type ShowcaseMotionPermissionState = 'unsupported' | 'idle' | 'granted' | 'denied'

export interface ShowcaseMotionSample {
  x: number
  y: number
  active: boolean
}

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

export function useShowcaseMotionSensor() {
  const sampleRef = useRef<ShowcaseMotionSample>({ x: 0, y: 0, active: false })
  const baselineRef = useRef<{ beta: number; gamma: number; angle: number } | null>(null)
  const [supported, setSupported] = useState(false)
  const [permissionState, setPermissionState] = useState<ShowcaseMotionPermissionState>('unsupported')
  const [enabled, setEnabled] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      setSupported(false)
      setPermissionState('unsupported')
      setNeedsPermission(false)
      return
    }

    const maybePermissionEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }

    setSupported(true)
    setNeedsPermission(typeof maybePermissionEvent.requestPermission === 'function')
    setPermissionState('idle')
  }, [])

  useEffect(() => {
    if (!supported || !enabled || permissionState !== 'granted' || typeof window === 'undefined') {
      sampleRef.current = { x: 0, y: 0, active: false }
      baselineRef.current = null
      return
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') {
        return
      }

      const angle = getScreenOrientationAngle()
      const baseline = baselineRef.current
      if (!baseline || Math.abs(baseline.angle - angle) >= 45) {
        baselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
          angle,
        }
        sampleRef.current = { x: 0, y: 0, active: true }
        return
      }

      const { x, y } = resolveTiltAxes(event.beta - baseline.beta, event.gamma - baseline.gamma, angle)
      sampleRef.current = { x, y, active: true }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
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

    if (typeof maybePermissionEvent.requestPermission === 'function') {
      try {
        const result = await maybePermissionEvent.requestPermission()
        const granted = result === 'granted'
        setPermissionState(granted ? 'granted' : 'denied')
        setEnabled(granted)
        if (!granted) {
          sampleRef.current = { x: 0, y: 0, active: false }
          baselineRef.current = null
        }
        return
      } catch {
        setPermissionState('denied')
        setEnabled(false)
        sampleRef.current = { x: 0, y: 0, active: false }
        baselineRef.current = null
        return
      }
    }

    setPermissionState('granted')
    setEnabled(true)
  }, [supported])

  const disable = useCallback(() => {
    setEnabled(false)
    sampleRef.current = { x: 0, y: 0, active: false }
    baselineRef.current = null
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
