import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'
import { markFlightUnlockForEscape, registerFlightLock } from './flightLockBridge'

function getFlightSpeedFactor(speed: number) {
  if (speed <= 5) {
    return 0.333 + (speed - 1) * 0.16675
  }

  return 1 + (speed - 5) * 0.5
}

export function FlightController() {
  const { camera, gl } = useThree()
  const velocityRef = useRef(new THREE.Vector3())
  const directionRef = useRef(new THREE.Vector3())
  const sideRef = useRef(new THREE.Vector3())
  const lockInitialized = useRef(false)
  const lockPending = useRef(false)
  const initTimeoutRef = useRef<number | null>(null)
  const eulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const keys = useRef({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Space: false,
    ControlLeft: false,
    ShiftLeft: false,
    ShiftRight: false,
  })
  const flightSpeed = useEditorStore((state) => state.viewer.flightSpeed)
  const cameraMode = useEditorStore((state) => state.viewer.cameraMode)
  const setHud = useEditorStore((state) => state.setHud)
  const setViewer = useEditorStore((state) => state.setViewer)

  useLayoutEffect(() => {
    if (cameraMode === 'firstPerson' || document.pointerLockElement !== gl.domElement) {
      return
    }

    void document.exitPointerLock()
  }, [cameraMode, gl.domElement])

  useLayoutEffect(() => {
    const exitFlightMode = () => {
      lockPending.current = false
      setHud({ orbitEnabled: true })
      setViewer({
        cameraMode: 'orbit',
        cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      })
    }

    const rollbackIfPointerLockFailed = () => {
      if (initTimeoutRef.current != null) {
        window.clearTimeout(initTimeoutRef.current)
      }
      initTimeoutRef.current = window.setTimeout(() => {
        if (!document.pointerLockElement && lockPending.current) {
          exitFlightMode()
        }
        initTimeoutRef.current = null
      }, 250)
    }

    const requestLockFromHud = () => {
      console.log('Attempting Flight Lock')
      if (document.pointerLockElement === gl.domElement) {
        setHud({ orbitEnabled: false })
        setViewer({
          cameraMode: 'firstPerson',
          cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        })
        lockInitialized.current = true
        return
      }

      if (document.pointerLockElement) {
        return
      }

      try {
        lockPending.current = true
        const request = gl.domElement.requestPointerLock()
        void Promise.resolve(request).catch((error) => {
          console.error('Pointer lock was blocked', error)
          exitFlightMode()
        })
        rollbackIfPointerLockFailed()
      } catch (error) {
        console.error('Pointer lock was blocked', error)
        exitFlightMode()
      }
    }

    const handlePointerLockChange = () => {
      if (document.pointerLockElement === gl.domElement) {
        lockPending.current = false
        lockInitialized.current = true
        setHud({ orbitEnabled: false })
        setViewer({
          cameraMode: 'firstPerson',
          cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        })
        if (initTimeoutRef.current != null) {
          window.clearTimeout(initTimeoutRef.current)
          initTimeoutRef.current = null
        }
      } else if (
        lockInitialized.current &&
        useEditorStore.getState().viewer.cameraMode === 'firstPerson'
      ) {
        markFlightUnlockForEscape()
        exitFlightMode()
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (
        document.pointerLockElement !== gl.domElement ||
        useEditorStore.getState().viewer.cameraMode !== 'firstPerson'
      ) {
        return
      }

      eulerRef.current.setFromQuaternion(camera.quaternion)
      eulerRef.current.y -= event.movementX * 0.002
      eulerRef.current.x -= event.movementY * 0.002
      eulerRef.current.x = THREE.MathUtils.clamp(
        eulerRef.current.x,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      )
      camera.quaternion.setFromEuler(eulerRef.current)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^Digit[1-9]$/.test(event.code)) {
        setViewer({ flightSpeed: Number(event.key) })
      }

      if (event.code in keys.current) {
        keys.current[event.code as keyof typeof keys.current] = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code in keys.current) {
        keys.current[event.code as keyof typeof keys.current] = false
      }
    }

    registerFlightLock(requestLockFromHud)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('pointerlockchange', handlePointerLockChange)

    return () => {
      if (initTimeoutRef.current != null) {
        window.clearTimeout(initTimeoutRef.current)
        initTimeoutRef.current = null
      }
      registerFlightLock(null)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      lockPending.current = false
      lockInitialized.current = false
      velocityRef.current.set(0, 0, 0)
      keys.current = {
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        Space: false,
        ControlLeft: false,
        ShiftLeft: false,
        ShiftRight: false,
      }
      if (document.pointerLockElement === gl.domElement) {
        void document.exitPointerLock()
      }
    }
  }, [camera, gl, setHud, setViewer])

  useFrame((_, delta) => {
    if (
      useEditorStore.getState().viewer.cameraMode !== 'firstPerson' ||
      document.pointerLockElement !== gl.domElement
    ) {
      return
    }

    const forward = Number(keys.current.KeyW) - Number(keys.current.KeyS)
    const strafe = Number(keys.current.KeyD) - Number(keys.current.KeyA)
    const vertical = Number(keys.current.Space) - Number(keys.current.ControlLeft)
    const boost = keys.current.ShiftLeft || keys.current.ShiftRight ? 3 : 1
    const speedFactor = getFlightSpeedFactor(flightSpeed)
    const acceleration = 10 * speedFactor * boost
    const damping = Math.exp(-6 * delta)

    directionRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    directionRef.current.y = 0
    if (directionRef.current.lengthSq() > 0.0001) {
      directionRef.current.normalize()
    }

    sideRef.current.crossVectors(directionRef.current, camera.up).normalize()

    if (forward !== 0) {
      velocityRef.current.addScaledVector(directionRef.current, forward * acceleration * delta)
    }
    if (strafe !== 0) {
      velocityRef.current.addScaledVector(sideRef.current, strafe * acceleration * delta)
    }
    if (vertical !== 0) {
      velocityRef.current.y += vertical * acceleration * delta
    }

    velocityRef.current.multiplyScalar(damping)
    camera.position.addScaledVector(velocityRef.current, delta * 4)

    useEditorStore.getState().setViewer({
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
    })
  })

  return null
}
