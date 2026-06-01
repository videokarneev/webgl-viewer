import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'

export function ViewerSync({
  controlsRef,
  cameraOffsetRef,
  targetOffsetRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  cameraOffsetRef?: MutableRefObject<THREE.Vector3>
  targetOffsetRef?: MutableRefObject<THREE.Vector3>
}) {
  const viewer = useEditorStore((state) => state.viewer)
  const setViewer = useEditorStore((state) => state.setViewer)
  const syncedControlsRef = useRef<OrbitControlsImpl | null>(null)

  useEffect(() => {
    if (!controlsRef.current) {
      return
    }

    const current = controlsRef.current.target
    const targetOffset = targetOffsetRef?.current
    if (
      current.x !== viewer.orbitTarget[0] + (targetOffset?.x ?? 0) ||
      current.y !== viewer.orbitTarget[1] + (targetOffset?.y ?? 0) ||
      current.z !== viewer.orbitTarget[2] + (targetOffset?.z ?? 0)
    ) {
      controlsRef.current.target.set(
        viewer.orbitTarget[0] + (targetOffset?.x ?? 0),
        viewer.orbitTarget[1] + (targetOffset?.y ?? 0),
        viewer.orbitTarget[2] + (targetOffset?.z ?? 0),
      )
      controlsRef.current.update()
    }
  }, [controlsRef, targetOffsetRef, viewer.orbitTarget])

  useFrame(({ camera }) => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const cameraOffset = cameraOffsetRef?.current ?? null
    const targetOffset = targetOffsetRef?.current ?? null
    const nextCameraPosition: [number, number, number] = [
      perspectiveCamera.position.x - (cameraOffset?.x ?? 0),
      perspectiveCamera.position.y - (cameraOffset?.y ?? 0),
      perspectiveCamera.position.z - (cameraOffset?.z ?? 0),
    ]

    const currentViewer = useEditorStore.getState().viewer
    const controls = controlsRef.current
    if (controls && syncedControlsRef.current !== controls) {
      controls.target.set(
        currentViewer.orbitTarget[0] + (targetOffset?.x ?? 0),
        currentViewer.orbitTarget[1] + (targetOffset?.y ?? 0),
        currentViewer.orbitTarget[2] + (targetOffset?.z ?? 0),
      )
      controls.update()
      syncedControlsRef.current = controls
    }

    const nextOrbitTarget: [number, number, number] = controls
      ? [
          controls.target.x - (targetOffset?.x ?? 0),
          controls.target.y - (targetOffset?.y ?? 0),
          controls.target.z - (targetOffset?.z ?? 0),
        ]
      : currentViewer.orbitTarget

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
