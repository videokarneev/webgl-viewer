import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  type InterfaceElementAnchor,
  type InterfaceElementMaterialState,
  type InterfaceElementScreen3dState,
  type InterfaceElementState,
  useEditorStore,
} from '../../store/editorStore'
import { getInterfaceElementRuntimeAction, runInterfaceElementAction } from '../../features/scene/runtime/interfaceElementActions'

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width * 0.5, height * 0.5)
  context.beginPath()
  context.moveTo(x + nextRadius, y)
  context.lineTo(x + width - nextRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + nextRadius)
  context.lineTo(x + width, y + height - nextRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - nextRadius, y + height)
  context.lineTo(x + nextRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - nextRadius)
  context.lineTo(x, y + nextRadius)
  context.quadraticCurveTo(x, y, x + nextRadius, y)
  context.closePath()
}

function getAnchorOffsetX(anchor: InterfaceElementAnchor, planeWidth: number, objectWidth: number) {
  if (anchor.includes('left')) {
    return -planeWidth * 0.5 + objectWidth * 0.5
  }

  if (anchor.includes('right')) {
    return planeWidth * 0.5 - objectWidth * 0.5
  }

  return 0
}

function getAnchorOffsetY(anchor: InterfaceElementAnchor, planeHeight: number, objectHeight: number) {
  if (anchor.includes('top')) {
    return planeHeight * 0.5 - objectHeight * 0.5
  }

  if (anchor.includes('bottom')) {
    return -planeHeight * 0.5 + objectHeight * 0.5
  }

  return 0
}

function buildButtonTexture({
  label,
  width: buttonWidth,
  height: buttonHeight,
  color,
  isSelected,
}: {
  label: string
  width: number
  height: number
  color: string
  isSelected: boolean
}) {
  const width = Math.max(320, Math.min(2048, Math.round(buttonWidth * 2)))
  const height = Math.max(128, Math.min(1024, Math.round(buttonHeight * 2)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  context.clearRect(0, 0, width, height)

  const fill = color
  const radius = Math.round(Math.min(width, height) * 0.18)
  drawRoundedRect(context, 4, 4, width - 8, height - 8, radius)
  context.fillStyle = fill
  context.fill()

  const sheen = context.createLinearGradient(0, 0, 0, height)
  sheen.addColorStop(0, 'rgba(255,255,255,0.34)')
  sheen.addColorStop(0.42, 'rgba(255,255,255,0.12)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)')
  drawRoundedRect(context, 4, 4, width - 8, height - 8, radius)
  context.fillStyle = sheen
  context.fill()

  context.lineWidth = isSelected ? 8 : 4
  context.strokeStyle = isSelected ? 'rgba(163, 219, 255, 0.95)' : 'rgba(255,255,255,0.32)'
  drawRoundedRect(context, 4, 4, width - 8, height - 8, radius)
  context.stroke()

  context.fillStyle = 'rgba(247, 251, 255, 0.98)'
  context.font = `700 ${Math.max(28, Math.round(height * 0.28))}px "Segoe UI", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = 'rgba(0,0,0,0.35)'
  context.shadowBlur = 10
  context.fillText(label || 'Button', width * 0.5, height * 0.54, width * 0.82)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

function applyScreen3dTransform(
  object: THREE.Object3D,
  config: InterfaceElementScreen3dState,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
) {
  const perspectiveCamera = camera as THREE.PerspectiveCamera
  const safeHeight = Math.max(viewportHeight, 1)
  const safeWidth = Math.max(viewportWidth, 1)
  const forward = new THREE.Vector3()
  perspectiveCamera.getWorldDirection(forward)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(perspectiveCamera.quaternion)
  const vFov = THREE.MathUtils.degToRad(perspectiveCamera.fov)
  const planeHeight = 2 * Math.tan(vFov * 0.5) * config.distance
  const planeWidth = planeHeight * perspectiveCamera.aspect
  const worldPerPixelX = planeWidth / safeWidth
  const worldPerPixelY = planeHeight / safeHeight
  const objectWidth = config.scaleMode === 'perspective' ? config.width : config.width * worldPerPixelX
  const objectHeight = config.scaleMode === 'perspective' ? config.height : config.height * worldPerPixelY
  const x = getAnchorOffsetX(config.anchor, planeWidth, objectWidth) + config.offsetX * worldPerPixelX
  const y = getAnchorOffsetY(config.anchor, planeHeight, objectHeight) - config.offsetY * worldPerPixelY
  const base = perspectiveCamera.position.clone().add(forward.multiplyScalar(config.distance))

  object.position.copy(base)
  object.position.add(right.multiplyScalar(x))
  object.position.add(up.multiplyScalar(y))
  if (config.billboard) {
    object.quaternion.copy(perspectiveCamera.quaternion)
  }
  object.scale.set(objectWidth, objectHeight, 1)
}

function buildCommonMaterialProps(material: InterfaceElementMaterialState, isSelected: boolean, texture: THREE.Texture | null) {
  return {
    map: texture ?? undefined,
    color: new THREE.Color('#ffffff'),
    toneMapped: true,
    transparent: material.opacity < 0.999 || material.transmission > 0.001,
    opacity: material.opacity,
    metalness: material.metalness,
    roughness: material.roughness,
    envMapIntensity: material.envMapIntensity,
    emissive: new THREE.Color(material.emissive),
    emissiveIntensity: material.emissiveIntensity + (isSelected ? 0.18 : 0),
    side: THREE.DoubleSide,
  }
}

function Screen3DButton({
  entry,
  allowSelection,
  onDraggingChange,
}: {
  entry: InterfaceElementState
  allowSelection: boolean
  onDraggingChange: (value: boolean) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const { camera, size } = useThree()
  const selectedInterfaceElementId = useEditorStore((state) => state.selectedInterfaceElementId)
  const transformMode = useEditorStore((state) => state.hud.transformMode)
  const updateInterfaceElement = useEditorStore((state) => state.updateInterfaceElement)
  const setSelectedInterfaceElementId = useEditorStore((state) => state.setSelectedInterfaceElementId)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setSelectedMaterialId = useEditorStore((state) => state.setSelectedMaterialId)
  const isSelected = allowSelection && selectedInterfaceElementId === entry.id
  const dragStateRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)
  const screen3dRef = useRef(entry.screen3d)
  const texture = useMemo(
    () =>
      buildButtonTexture({
        label: entry.label || 'Button',
        width: entry.screen3d.width,
        height: entry.screen3d.height,
        color: entry.screen3d.material.color,
        isSelected,
      }),
    [entry.label, entry.screen3d.width, entry.screen3d.height, entry.screen3d.material.color, isSelected],
  )

  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  useEffect(() => {
    screen3dRef.current = entry.screen3d
  }, [entry.screen3d])

  useEffect(() => {
    if (!allowSelection) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag) {
        return
      }

      const deltaX = event.clientX - drag.startX
      const deltaY = event.clientY - drag.startY
      updateInterfaceElement(entry.id, {
        screen3d: {
          ...screen3dRef.current,
          offsetX: drag.offsetX + deltaX,
          offsetY: drag.offsetY + deltaY,
        },
      })
    }

    const handlePointerUp = () => {
      if (dragStateRef.current) {
        onDraggingChange(false)
      }
      dragStateRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [allowSelection, entry.id, onDraggingChange, updateInterfaceElement])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    applyScreen3dTransform(mesh, entry.screen3d, camera, size.width, size.height)
    mesh.renderOrder = entry.screen3d.depthMode === 'overlay' ? 1000 : 0
  })

  const materialProps = buildCommonMaterialProps(entry.screen3d.material, isSelected, texture)
  const isPhysicalMaterial = entry.screen3d.material.type !== 'standard'

  return (
    <mesh
      ref={meshRef}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (!allowSelection) {
          return
        }

        setSelectedInterfaceElementId(entry.id)
        if (transformMode === 'translate') {
          onDraggingChange(true)
          dragStateRef.current = {
            startX: event.nativeEvent.clientX,
            startY: event.nativeEvent.clientY,
            offsetX: screen3dRef.current.offsetX,
            offsetY: screen3dRef.current.offsetY,
          }
          return
        }

        useEditorStore.getState().setHud({ transformMode: 'none' })
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (allowSelection) {
          setSelectedInterfaceElementId(entry.id)
          return
        }

        runInterfaceElementAction(getInterfaceElementRuntimeAction(entry))
      }}
    >
      <planeGeometry args={[1, 1]} />
      {isPhysicalMaterial ? (
        <meshPhysicalMaterial
          ref={materialRef}
          clearcoat={entry.screen3d.material.clearcoat}
          clearcoatRoughness={entry.screen3d.material.clearcoatRoughness}
          transmission={entry.screen3d.material.transmission}
          ior={entry.screen3d.material.ior}
          depthTest={entry.screen3d.depthMode === 'occluded'}
          depthWrite={entry.screen3d.depthMode === 'occluded'}
          {...materialProps}
        />
      ) : (
        <meshStandardMaterial
          depthTest={entry.screen3d.depthMode === 'occluded'}
          depthWrite={entry.screen3d.depthMode === 'occluded'}
          {...materialProps}
        />
      )}
    </mesh>
  )
}

export function InterfaceScreen3DOverlay({
  allowSelection,
  onDraggingChange,
}: {
  allowSelection: boolean
  onDraggingChange: (value: boolean) => void
}) {
  const interfaceElements = useEditorStore((state) => state.interfaceElements)
  const elements = interfaceElements.filter((entry) => entry.visible && entry.renderMode === 'screen3d')

  return (
    <group>
      {elements.map((entry) => (
        <Screen3DButton
          key={entry.id}
          entry={entry}
          allowSelection={allowSelection}
          onDraggingChange={onDraggingChange}
        />
      ))}
    </group>
  )
}
