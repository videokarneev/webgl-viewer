import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'

export function LightRig() {
  const ambient = useEditorStore((state) => state.lights.ambient)
  const rig = useEditorStore((state) => state.lights.rig)
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
  }, [registerObjectRef])

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
      <directionalLight
        color={lightSetup.fill.color}
        intensity={rig.fill}
        position={lightSetup.fill.position}
      />
      <directionalLight
        color={lightSetup.rim.color}
        intensity={rig.rim}
        position={lightSetup.rim.position}
      />
    </>
  )
}
