import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorStore, type SceneConfig } from '../../../store/editorStore'
import { sanitizeNumber } from './shared'

export function ConfigController({
  root,
  controlsRef,
}: {
  root: THREE.Object3D | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera, gl } = useThree()
  const configRequest = useEditorStore((state) => state.configRequest)
  const requestModelLoad = useEditorStore((state) => state.requestModelLoad)
  const requestAtlasLoad = useEditorStore((state) => state.requestAtlasLoad)
  const requestEnvironmentLoad = useEditorStore((state) => state.requestEnvironmentLoad)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setSelectedObjectId = useEditorStore((state) => state.setSelectedObjectId)
  const setHud = useEditorStore((state) => state.setHud)
  const updateObjectTransform = useEditorStore((state) => state.updateObjectTransform)
  const updateMaterial = useEditorStore((state) => state.updateMaterial)
  const updateMaterialEffect = useEditorStore((state) => state.updateMaterialEffect)
  const setViewer = useEditorStore((state) => state.setViewer)
  const setStatus = useEditorStore((state) => state.setStatus)
  const materials = useEditorStore((state) => state.materials)
  const rootNodeId = useEditorStore((state) => state.rootNodeId)
  const appliedNonceRef = useRef<number | null>(null)
  const pendingConfigRef = useRef<SceneConfig | null>(null)

  useEffect(() => {
    if (!configRequest) {
      return
    }

    pendingConfigRef.current = configRequest.config
    appliedNonceRef.current = null
    setStatus(`Importing config: ${configRequest.label}`)

    if (configRequest.config.assets?.model) {
      requestModelLoad({
        url: configRequest.config.assets.model,
        label: configRequest.config.assets.model,
        revokeAfter: false,
      })
    }
    if (configRequest.config.assets?.atlas) {
      requestAtlasLoad({
        url: configRequest.config.assets.atlas,
        label: configRequest.config.assets.atlas,
        revokeAfter: false,
      })
    }
    if (configRequest.config.assets?.hdri) {
      requestEnvironmentLoad({
        url: configRequest.config.assets.hdri,
        label: configRequest.config.assets.hdri,
        kind: 'hdri',
        revokeAfter: false,
      })
    }
    if (configRequest.config.assets?.panorama) {
      requestEnvironmentLoad({
        url: configRequest.config.assets.panorama,
        label: configRequest.config.assets.panorama,
        kind: 'panorama',
        revokeAfter: false,
      })
    }
  }, [configRequest, requestAtlasLoad, requestEnvironmentLoad, requestModelLoad, setStatus])

  useEffect(() => {
    if (!configRequest || !pendingConfigRef.current || appliedNonceRef.current === configRequest.nonce) {
      return
    }

    if (configRequest.config.assets?.model && !root) {
      return
    }

    const config = pendingConfigRef.current
    const cameraPerspective = camera as THREE.PerspectiveCamera

    if (config.viewer?.envIntensity != null) {
      setEnvironment({ intensity: sanitizeNumber(config.viewer.envIntensity, 1.5, 0) })
    }

    if (config.viewer?.cameraPosition && config.viewer.cameraPosition.length === 3) {
      setViewer({
        cameraPosition: [
          sanitizeNumber(config.viewer.cameraPosition[0], cameraPerspective.position.x),
          sanitizeNumber(config.viewer.cameraPosition[1], cameraPerspective.position.y),
          sanitizeNumber(config.viewer.cameraPosition[2], cameraPerspective.position.z),
        ],
      })
    }

    if (config.viewer?.orbitTarget && config.viewer.orbitTarget.length === 3 && controlsRef.current) {
      const orbitTarget: [number, number, number] = [
        sanitizeNumber(config.viewer.orbitTarget[0], controlsRef.current.target.x),
        sanitizeNumber(config.viewer.orbitTarget[1], controlsRef.current.target.y),
        sanitizeNumber(config.viewer.orbitTarget[2], controlsRef.current.target.z),
      ]
      controlsRef.current.target.set(...orbitTarget)
      controlsRef.current.update()
      setViewer({ orbitTarget })
    }

    if (config.viewer?.focalLength != null) {
      setViewer({
        focalLength: sanitizeNumber(config.viewer.focalLength, cameraPerspective.getFocalLength(), 1),
      })
    }

    if (config.viewer?.exposure != null) {
      setViewer({
        exposure: sanitizeNumber(config.viewer.exposure, gl.toneMappingExposure, 0),
      })
    }

    if (config.viewer?.dofEnabled != null) {
      setViewer({ dofEnabled: Boolean(config.viewer.dofEnabled) })
    }

    if (config.viewer?.dofVisualizerEnabled != null) {
      setViewer({ dofVisualizerEnabled: Boolean(config.viewer.dofVisualizerEnabled) })
    }

    if (config.viewer?.dofFocusDistance != null) {
      setViewer({
        dofFocusDistance: sanitizeNumber(config.viewer.dofFocusDistance, 5, 0.1),
      })
    }

    if (config.viewer?.dofAperture != null) {
      setViewer({
        dofAperture: sanitizeNumber(config.viewer.dofAperture, 2, 0.1),
      })
    }

    if (config.viewer?.dofManualBlur != null) {
      setViewer({
        dofManualBlur: sanitizeNumber(config.viewer.dofManualBlur, 1.2, 0),
      })
    }

    if (config.viewer?.cameraMode === 'orbit' || config.viewer?.cameraMode === 'firstPerson') {
      setViewer({ cameraMode: config.viewer.cameraMode })
      setHud({ orbitEnabled: config.viewer.cameraMode === 'orbit' })
    }

    if (config.modelTransform && rootNodeId) {
      const node = useEditorStore.getState().objects[rootNodeId]
      if (node) {
        const nextPosition: [number, number, number] =
          config.modelTransform.position && config.modelTransform.position.length === 3
            ? [
                sanitizeNumber(config.modelTransform.position[0], node.position[0]),
                sanitizeNumber(config.modelTransform.position[1], node.position[1]),
                sanitizeNumber(config.modelTransform.position[2], node.position[2]),
              ]
            : node.position

        const nextRotation: [number, number, number] =
          config.modelTransform.rotation && config.modelTransform.rotation.length === 3
            ? [
                THREE.MathUtils.degToRad(
                  sanitizeNumber(config.modelTransform.rotation[0], THREE.MathUtils.radToDeg(node.rotation[0])),
                ),
                THREE.MathUtils.degToRad(
                  sanitizeNumber(config.modelTransform.rotation[1], THREE.MathUtils.radToDeg(node.rotation[1])),
                ),
                THREE.MathUtils.degToRad(
                  sanitizeNumber(config.modelTransform.rotation[2], THREE.MathUtils.radToDeg(node.rotation[2])),
                ),
              ]
            : node.rotation

        updateObjectTransform(rootNodeId, {
          position: nextPosition,
          rotation: nextRotation,
        })
      }
    }

    let targetMaterialId =
      config.materialEffect?.materialId && materials[config.materialEffect.materialId]
        ? config.materialEffect.materialId
        : null

    if (!targetMaterialId && config.materialEffect?.materialName) {
      targetMaterialId =
        Object.values(materials).find((entry) => entry.name === config.materialEffect?.materialName)?.id ?? null
    }

    if (!targetMaterialId) {
      targetMaterialId = Object.keys(materials)[0] ?? null
    }

    if (targetMaterialId && config.materialSettings) {
      updateMaterial(targetMaterialId, {
        color: config.materialSettings.color ? `#${config.materialSettings.color}` : undefined,
        emissive: config.materialSettings.emissive ? `#${config.materialSettings.emissive}` : undefined,
        metalness:
          config.materialSettings.metalness != null
            ? sanitizeNumber(config.materialSettings.metalness, materials[targetMaterialId].metalness ?? 0, 0)
            : undefined,
        roughness:
          config.materialSettings.roughness != null
            ? sanitizeNumber(config.materialSettings.roughness, materials[targetMaterialId].roughness ?? 1, 0)
            : undefined,
        envMapIntensity:
          config.materialSettings.envMapIntensity != null
            ? sanitizeNumber(config.materialSettings.envMapIntensity, materials[targetMaterialId].envMapIntensity ?? 1, 0)
            : undefined,
        emissiveIntensity:
          config.materialSettings.emissiveIntensity != null
            ? sanitizeNumber(config.materialSettings.emissiveIntensity, materials[targetMaterialId].emissiveIntensity ?? 1, 0)
            : undefined,
        clearcoat:
          config.materialSettings.clearcoat != null
            ? sanitizeNumber(config.materialSettings.clearcoat, materials[targetMaterialId].clearcoat ?? 0, 0)
            : undefined,
      })
    }

    if (targetMaterialId && config.materialEffect) {
      updateMaterialEffect(targetMaterialId, {
        enabled: config.materialEffect.enabled ?? materials[targetMaterialId].effect.enabled,
        targetSlot: config.materialEffect.targetSlot ?? materials[targetMaterialId].effect.targetSlot,
        frameOrder: config.materialEffect.frameOrder ?? materials[targetMaterialId].effect.frameOrder,
        gridX: sanitizeNumber(config.materialEffect.gridX, materials[targetMaterialId].effect.gridX, 1),
        gridY: sanitizeNumber(config.materialEffect.gridY, materials[targetMaterialId].effect.gridY, 1),
        fps: sanitizeNumber(config.materialEffect.fps, materials[targetMaterialId].effect.fps, 1),
        frameCount: sanitizeNumber(config.materialEffect.frameCount, materials[targetMaterialId].effect.frameCount, 1),
        currentFrame: sanitizeNumber(config.materialEffect.currentFrame, materials[targetMaterialId].effect.currentFrame, 0),
        opacity: sanitizeNumber(config.materialEffect.opacity, materials[targetMaterialId].effect.opacity, 0),
        frameBlend: config.materialEffect.frameBlend ?? materials[targetMaterialId].effect.frameBlend,
        play: config.materialEffect.play ?? materials[targetMaterialId].effect.play,
        loop: config.materialEffect.loop ?? materials[targetMaterialId].effect.loop,
        uvChannel: config.materialEffect.uvChannel ?? materials[targetMaterialId].effect.uvChannel,
        wrapMode: config.materialEffect.wrapMode ?? materials[targetMaterialId].effect.wrapMode,
        swapXY: config.materialEffect.swapXY ?? materials[targetMaterialId].effect.swapXY,
        offsetX: sanitizeNumber(config.materialEffect.offsetX, materials[targetMaterialId].effect.offsetX),
        offsetY: sanitizeNumber(config.materialEffect.offsetY, materials[targetMaterialId].effect.offsetY),
        scaleX: sanitizeNumber(config.materialEffect.scaleX, materials[targetMaterialId].effect.scaleX, 0.01),
        scaleY: sanitizeNumber(config.materialEffect.scaleY, materials[targetMaterialId].effect.scaleY, 0.01),
        rotation: sanitizeNumber(config.materialEffect.rotation, materials[targetMaterialId].effect.rotation),
      })
      setSelectedObjectId(targetMaterialId)
    }

    appliedNonceRef.current = configRequest.nonce
    setStatus(`Config applied: ${configRequest.label}`)
  }, [
    camera,
    configRequest,
    controlsRef,
    gl,
    materials,
    root,
    rootNodeId,
    setEnvironment,
    setHud,
    setSelectedObjectId,
    setStatus,
    setViewer,
    updateMaterial,
    updateMaterialEffect,
    updateObjectTransform,
  ])

  return null
}
