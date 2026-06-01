import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { type PbrMaterialState, type PhoneScreenBoxState, useEditorStore } from '../../../store/editorStore'
import { applyRuntimeMaterialState } from './materialRuntime'
import { createPhoneScreenBoxGeometry, resolvePhoneScreenBoxDimensions } from './phoneScreenBoxRuntime'

function isLegacyDefaultPhoneScreenBoxMaterial(materialState: PbrMaterialState) {
  return (
    materialState.color === '#ffffff' &&
    materialState.emissive === '#000000' &&
    materialState.metalness === 0 &&
    materialState.roughness === 1 &&
    materialState.envMapIntensity === 1 &&
    materialState.clearcoat === 0
  )
}

function isDefaultBlackPhoneScreenBoxMaterial(materialState: PbrMaterialState) {
  return (
    materialState.color === '#000000' &&
    materialState.emissive === '#000000' &&
    materialState.metalness === 0 &&
    materialState.roughness === 0.68 &&
    materialState.envMapIntensity === 1.2 &&
    materialState.clearcoat === 0
  )
}

function PhoneScreenBox({
  boxState,
  selectable,
}: {
  boxState: PhoneScreenBoxState
  selectable: boolean
}) {
  const { id: boxId, materialId } = boxState
  const meshRef = useRef<THREE.Mesh | null>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const objectState = useEditorStore((state) => state.objects[boxId] ?? null)
  const materialState = useEditorStore((state) => state.materials[materialId] ?? null)
  const responsiveFrame = useEditorStore((state) => state.responsiveFrame)
  const environment = useEditorStore((state) => state.environment)
  const sceneEnvironmentMap = useEditorStore((state) => state.runtimeTextures.environmentMap)
  const materialEnvironmentMaps = useEditorStore((state) => state.runtimeTextures.materialEnvironmentMaps)
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const viewportAspect = useThree((state) => state.size.width / Math.max(state.size.height, 1))
  const resolved = useMemo(
    () => resolvePhoneScreenBoxDimensions(boxState, responsiveFrame, viewportAspect),
    [boxState, responsiveFrame, viewportAspect],
  )
  const geometry = useMemo(
    () =>
      createPhoneScreenBoxGeometry(
        resolved.width,
        resolved.boxHeight,
        resolved.footprintDepth,
        resolved.wallThickness,
        boxState.geometry.openTop,
      ),
    [boxState.geometry.openTop, resolved.boxHeight, resolved.footprintDepth, resolved.wallThickness, resolved.width],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    registerObjectRef(boxId, meshRef.current)
    return () => {
      registerObjectRef(boxId, null)
    }
  }, [boxId, registerObjectRef])

  useEffect(() => {
    registerMaterialRef(materialId, materialRef.current)
    return () => {
      registerMaterialRef(materialId, null)
    }
  }, [materialId, registerMaterialRef])

  useEffect(() => {
    if (!meshRef.current || !objectState) {
      return
    }

    meshRef.current.position.set(...objectState.position)
    meshRef.current.rotation.set(...objectState.rotation)
    meshRef.current.scale.set(...objectState.scale)
    meshRef.current.visible = objectState.visible
  }, [objectState])

  useEffect(() => {
    if (!materialRef.current || !materialState) {
      return
    }

    applyRuntimeMaterialState(materialRef.current, materialState, environment, sceneEnvironmentMap, materialEnvironmentMaps)
  }, [environment, materialEnvironmentMaps, materialState, sceneEnvironmentMap])

  useEffect(() => {
    if (!materialRef.current || !materialState) {
      return
    }

    if (sceneEnvironmentMap || !isDefaultBlackPhoneScreenBoxMaterial(materialState)) {
      return
    }

    // Keep showcase boxes readable if a published scene fails to load its HDRI and the surrounding page is dark.
    materialRef.current.color.set('#1c1f24')
    materialRef.current.emissive.set('#080b10')
    materialRef.current.emissiveIntensity = Math.max(materialRef.current.emissiveIntensity, 0.55)
    materialRef.current.roughness = Math.min(materialRef.current.roughness, 0.6)
    materialRef.current.envMapIntensity = Math.max(materialRef.current.envMapIntensity, 0.35)
    materialRef.current.needsUpdate = true
  }, [materialState, sceneEnvironmentMap])

  useEffect(() => {
    if (!materialState || !isLegacyDefaultPhoneScreenBoxMaterial(materialState)) {
      return
    }

    updateMaterial(materialId, {
      color: '#000000',
      roughness: 0.68,
      envMapIntensity: 1.2,
    })
  }, [materialId, materialState, updateMaterial])

  if (!objectState || !materialState) {
    return null
  }

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={
        selectable
          ? (event: ThreeEvent<MouseEvent>) => {
              if (event.delta > 2) {
                return
              }

              event.stopPropagation()
              if (selectedObjectId !== boxId) {
                setSelectedObjectId(boxId)
              }
            }
          : undefined
      }
      onPointerDown={selectable ? (event: ThreeEvent<PointerEvent>) => event.stopPropagation() : undefined}
    >
      <meshStandardMaterial ref={materialRef} color="#000000" metalness={0} roughness={0.68} envMapIntensity={1.2} />
    </mesh>
  )
}

export function CustomSceneBoxes({ selectable = true }: { selectable?: boolean }) {
  const phoneScreenBoxes = useEditorStore((state) => state.phoneScreenBoxes)

  if (!phoneScreenBoxes.length) {
    return null
  }

  return (
    <>
      {phoneScreenBoxes.map((entry) => (
        <PhoneScreenBox
          key={entry.id}
          boxState={entry}
          selectable={selectable}
        />
      ))}
    </>
  )
}
