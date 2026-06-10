import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  getGodRaysArrowWorldDirection,
  getGodRaysDirectionArrowId,
  getGodRaysDirectionQuaternion,
  normalizeGodRaysDirection,
  useEditorStore,
} from '../../../store/editorStore'
import { GodRaysBox } from './GodRaysBox'

function GodRaysDirectionArrow({ effectId, selectable = true }: { effectId: string; selectable?: boolean }) {
  const arrowRef = useRef<THREE.Group | null>(null)
  const arrowId = useMemo(() => getGodRaysDirectionArrowId(effectId), [effectId])
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const entry = useEditorStore((state) => state.godRaysBoxes.find((item) => item.id === effectId) ?? null)
  const godRaysGlobalDirection = useEditorStore((state) => state.godRaysGlobalDirection)
  const runtimeObject = useEditorStore((state) => state.runtime.objectById[effectId] ?? null)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setHud = useEditorStore((state) => state.setHud)
  const isActive = selectable && activeGodRaysDirectionBoxId === effectId
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  const worldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const cameraPosition = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    if (!arrowRef.current || !entry) {
      return
    }

    const arrowDirection =
      runtimeObject
        ? getGodRaysArrowWorldDirection(entry, runtimeObject, godRaysGlobalDirection)
        : normalizeGodRaysDirection(
            entry.dustDirectionMode === 'global' ? godRaysGlobalDirection : entry.dustDirectionLocal,
          )

    worldQuaternion.copy(getGodRaysDirectionQuaternion(arrowDirection))
    arrowRef.current.quaternion.copy(worldQuaternion)
  }, [entry, godRaysGlobalDirection, runtimeObject, worldQuaternion])

  useEffect(() => {
    if (!isActive) {
      registerObjectRef(arrowId, null)
      return
    }

    registerObjectRef(arrowId, arrowRef.current)
    return () => {
      registerObjectRef(arrowId, null)
    }
  }, [arrowId, isActive, registerObjectRef])

  useFrame((state) => {
    if (!arrowRef.current || !entry) {
      return
    }

    if (runtimeObject) {
      runtimeObject.updateWorldMatrix(true, false)
      runtimeObject.getWorldPosition(worldPosition)
      arrowRef.current.position.copy(worldPosition)
    } else {
      arrowRef.current.position.set(0, 0, 0)
    }

    state.camera.getWorldPosition(cameraPosition)
    const distance = cameraPosition.distanceTo(arrowRef.current.position)
    const perspectiveScale =
      (state.camera as THREE.PerspectiveCamera).isPerspectiveCamera
        ? distance * Math.tan(THREE.MathUtils.degToRad((state.camera as THREE.PerspectiveCamera).fov * 0.5)) * 0.32
        : 1
    const scale = THREE.MathUtils.clamp(perspectiveScale, 0.7, 2.4)
    arrowRef.current.scale.setScalar(scale)
  })

  if (!entry) {
    return null
  }

  return (
    <group
      ref={arrowRef}
      visible={isActive}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (!selectable) {
          return
        }

        event.stopPropagation()
        setSelectedObjectId(effectId)
        setHud({ transformMode: 'rotate', activeGodRaysDirectionBoxId: effectId })
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!selectable) {
          return
        }

        event.stopPropagation()
        setSelectedObjectId(effectId)
        setHud({ transformMode: 'rotate', activeGodRaysDirectionBoxId: effectId })
      }}
    >
      <mesh position={[0, 0.02, 0]} renderOrder={8}>
        <sphereGeometry args={[0.07, 18, 14]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.98} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={7}>
        <torusGeometry args={[0.16, 0.01, 10, 48]} />
        <meshBasicMaterial color="#7fd0ff" transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.38, 0]} renderOrder={8}>
        <cylinderGeometry args={[0.02, 0.02, 0.64, 18]} />
        <meshBasicMaterial color="#c7f1ff" transparent opacity={0.96} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.82, 0]} renderOrder={9}>
        <coneGeometry args={[0.085, 0.22, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.99} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.17, 0]} renderOrder={8}>
        <cylinderGeometry args={[0.045, 0.07, 0.1, 20]} />
        <meshBasicMaterial color="#54c8ff" transparent opacity={0.88} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.42, 0]} renderOrder={6}>
        <sphereGeometry args={[0.24, 18, 14]} />
        <meshBasicMaterial transparent opacity={0.01} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function GodRaysBoxes({ selectable = true }: { selectable?: boolean }) {
  const entries = useEditorStore((state) => state.godRaysBoxes)

  return (
    <>
      {entries.map((entry) => (
        <GodRaysBox key={entry.id} entry={entry} selectable={selectable} />
      ))}
      {entries.map((entry) => (
        <GodRaysDirectionArrow key={getGodRaysDirectionArrowId(entry.id)} effectId={entry.id} selectable={selectable} />
      ))}
    </>
  )
}
