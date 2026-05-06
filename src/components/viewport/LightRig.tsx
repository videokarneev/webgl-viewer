import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore, type ExtraLightState } from '../../store/editorStore'

function ExtraLightMarker({ type, color }: { type: ExtraLightState['type']; color: string }) {
  const markerColor = color || '#8bcff2'

  if (type === 'directional') {
    return (
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 0.42, 18]} />
          <meshBasicMaterial color={markerColor} transparent opacity={0.78} />
        </mesh>
        <mesh position={[0, -0.34, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.42, 12]} />
          <meshBasicMaterial color={markerColor} transparent opacity={0.7} />
        </mesh>
      </group>
    )
  }

  if (type === 'spot') {
    return (
      <group>
        <mesh>
          <sphereGeometry args={[0.13, 18, 12]} />
          <meshBasicMaterial color={markerColor} transparent opacity={0.88} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.28, 0.5, 24, 1, true]} />
          <meshBasicMaterial color={markerColor} wireframe transparent opacity={0.55} />
        </mesh>
      </group>
    )
  }

  return (
    <mesh>
      <sphereGeometry args={[0.16, 20, 14]} />
      <meshBasicMaterial color={markerColor} transparent opacity={0.86} />
    </mesh>
  )
}

function ManagedExtraLight({ light }: { light: ExtraLightState }) {
  const markerRef = useRef<THREE.Group | null>(null)
  const targetRef = useRef<THREE.Object3D | null>(null)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)

  useEffect(() => {
    registerObjectRef(light.id, markerRef.current)
    return () => {
      registerObjectRef(light.id, null)
    }
  }, [light.id, registerObjectRef])

  if (light.type === 'ambient') {
    return <ambientLight intensity={light.intensity} color={light.color} visible={light.visible} />
  }

  return (
    <>
      <group
        ref={markerRef}
        position={light.position}
        visible={light.visible}
        onPointerDown={(event) => {
          event.stopPropagation()
          setSelectedObjectId(light.id)
        }}
      >
        <ExtraLightMarker type={light.type} color={light.color} />
      </group>
      {light.type === 'directional' ? (
        <>
          <directionalLight
            position={light.position}
            intensity={light.intensity}
            color={light.color}
            visible={light.visible}
            castShadow={light.castShadow}
            shadow-bias={light.shadowBias}
            target={targetRef.current ?? undefined}
          />
          <object3D ref={targetRef} position={light.targetPosition} />
        </>
      ) : null}
      {light.type === 'point' ? (
        <pointLight
          position={light.position}
          intensity={light.intensity}
          distance={light.distance}
          decay={light.decay}
          color={light.color}
          visible={light.visible}
          castShadow={light.castShadow}
          shadow-bias={light.shadowBias}
        />
      ) : null}
      {light.type === 'spot' ? (
        <>
          <spotLight
            position={light.position}
            intensity={light.intensity}
            distance={light.distance}
            decay={light.decay}
            angle={THREE.MathUtils.degToRad(light.angle)}
            penumbra={light.penumbra}
            color={light.color}
            visible={light.visible}
            castShadow={light.castShadow}
            shadow-bias={light.shadowBias}
            target={targetRef.current ?? undefined}
          />
          <object3D ref={targetRef} position={light.targetPosition} />
        </>
      ) : null}
    </>
  )
}

export function LightRig() {
  const ambient = useEditorStore((state) => state.lights.ambient)
  const rig = useEditorStore((state) => state.lights.rig)
  const extraLights = useEditorStore((state) => state.extraLights)
  const environmentEnabled = useEditorStore((state) => state.environment.isEnvironmentEnabled)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const ambientRef = useRef<THREE.AmbientLight | null>(null)
  const lightSetup = useMemo(
    () => ({
      hemisphere: {
        skyColor: '#eaf4ff',
        groundColor: '#182028',
      },
      key: {
        color: '#fff5e8',
        position: [6, 7, 5] as [number, number, number],
      },
      fill: {
        color: '#d8ebff',
        position: [-5, 3.5, 6] as [number, number, number],
      },
      rim: {
        color: '#cfe4ff',
        position: [-4, 6, -5] as [number, number, number],
      },
    }),
    [],
  )

  useEffect(() => {
    registerObjectRef('light:ambient:system', ambientRef.current)
    return () => {
      registerObjectRef('light:ambient:system', null)
    }
  }, [ambient.exists, registerObjectRef])

  return (
    <>
      {ambient.exists ? (
        <ambientLight
          ref={ambientRef}
          color={ambient.color}
          intensity={ambient.visible ? ambient.intensity : 0}
          visible={ambient.visible}
        />
      ) : null}
      {environmentEnabled ? (
        <>
          <hemisphereLight
            color={lightSetup.hemisphere.skyColor}
            groundColor={lightSetup.hemisphere.groundColor}
            intensity={rig.hemisphere}
          />
          <directionalLight
            color={lightSetup.key.color}
            intensity={rig.key}
            position={lightSetup.key.position}
            castShadow
          />
          <directionalLight color={lightSetup.fill.color} intensity={rig.fill} position={lightSetup.fill.position} />
          <directionalLight color={lightSetup.rim.color} intensity={rig.rim} position={lightSetup.rim.position} />
        </>
      ) : null}
      {extraLights.map((light) => (
        <ManagedExtraLight key={light.id} light={light} />
      ))}
    </>
  )
}
