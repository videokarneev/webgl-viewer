import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

export function ViewerSync({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const viewer = useEditorStore((state) => state.viewer)
  const setViewer = useEditorStore((state) => state.setViewer)

  useEffect(() => {
    if (!controlsRef.current) {
      return
    }

    const current = controlsRef.current.target
    if (
      current.x !== viewer.orbitTarget[0] ||
      current.y !== viewer.orbitTarget[1] ||
      current.z !== viewer.orbitTarget[2]
    ) {
      controlsRef.current.target.set(...viewer.orbitTarget)
      controlsRef.current.update()
    }
  }, [controlsRef, viewer.orbitTarget])

  useFrame(({ camera }) => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const nextCameraPosition: [number, number, number] = [
      perspectiveCamera.position.x,
      perspectiveCamera.position.y,
      perspectiveCamera.position.z,
    ]

    const controls = controlsRef.current
    const nextOrbitTarget: [number, number, number] = controls
      ? [controls.target.x, controls.target.y, controls.target.z]
      : [0, 0, 0]

    const currentViewer = useEditorStore.getState().viewer
    if (
      currentViewer.cameraPosition[0] !== nextCameraPosition[0] ||
      currentViewer.cameraPosition[1] !== nextCameraPosition[1] ||
      currentViewer.cameraPosition[2] !== nextCameraPosition[2] ||
      currentViewer.orbitTarget[0] !== nextOrbitTarget[0] ||
      currentViewer.orbitTarget[1] !== nextOrbitTarget[1] ||
      currentViewer.orbitTarget[2] !== nextOrbitTarget[2]
    ) {
      setViewer({
        cameraPosition: nextCameraPosition,
        orbitTarget: nextOrbitTarget,
      })
    }
  })

  return null
}
