import { type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  useEditorStore,
  type GodRaysBoxState,
} from '../../../store/editorStore'
import { GodRaysDust } from './GodRaysDust'
import { GodRaysVolume } from './GodRaysVolume'
import { createGodRaysOutlineGeometry, createGodRaysPrismGeometry } from './godRaysShared'

export function GodRaysBox({ entry }: { entry: GodRaysBoxState }) {
  const groupRef = useRef<THREE.Group | null>(null)
  const objectState = useEditorStore((state) => state.objects[entry.id] ?? null)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const activeGodRaysDirectionBoxId = useEditorStore((state) => state.hud.activeGodRaysDirectionBoxId)
  const anchorModeEnabled = useEditorStore((state) => state.hud.anchorModeEnabled)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const isSelected = selectedObjectId === entry.id
  const isDirectionEditing = activeGodRaysDirectionBoxId === entry.id
  const helperGeometry = useMemo(
    () => createGodRaysOutlineGeometry(entry),
    [entry.bottomRadius, entry.sideCount, entry.topRadius],
  )
  const selectionGeometry = useMemo(
    () => createGodRaysPrismGeometry(entry),
    [entry.bottomRadius, entry.sideCount, entry.topRadius],
  )

  useEffect(() => {
    registerObjectRef(entry.id, groupRef.current)
    return () => {
      registerObjectRef(entry.id, null)
    }
  }, [entry.id, registerObjectRef])

  useEffect(() => () => helperGeometry.dispose(), [helperGeometry])
  useEffect(() => () => selectionGeometry.dispose(), [selectionGeometry])

  useEffect(() => {
    if (!groupRef.current || !objectState) {
      return
    }

    groupRef.current.position.set(...objectState.position)
    groupRef.current.rotation.set(...objectState.rotation)
    groupRef.current.scale.set(...objectState.scale)
    groupRef.current.visible = objectState.visible
  }, [objectState])

  if (!objectState) {
    return null
  }

  const disableSelectionRaycast = anchorModeEnabled && selectedObjectId === entry.id

  return (
    <group
      ref={groupRef}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 2) {
          return
        }

        event.stopPropagation()
        if (anchorModeEnabled) {
          if (selectedObjectId !== entry.id) {
            setSelectedObjectId(entry.id)
          }
          return
        }

        setSelectedObjectId(selectedObjectId === entry.id ? null : entry.id)
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
      }}
    >
      <mesh
        geometry={selectionGeometry}
        raycast={disableSelectionRaycast ? () => null : undefined}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ffffff" />
      </mesh>
      {entry.raysEnabled ? <GodRaysVolume entry={entry} disableRaycast /> : null}
      {entry.dustEnabled && entry.dustCount > 0 ? <GodRaysDust entry={entry} disableRaycast /> : null}
      {(isSelected || isDirectionEditing) && entry.helperVisible ? (
        <lineSegments geometry={helperGeometry} renderOrder={4}>
          <lineBasicMaterial color="#9ed8ff" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
        </lineSegments>
      ) : null}
    </group>
  )
}
