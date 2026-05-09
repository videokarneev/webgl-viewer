import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../../../store/editorStore'
import { ensureAtlasTextureOptions } from '../../atlas/atlasMaterialPatch'
import { buildSceneGraph } from '../buildSceneGraph'
import { loadGltf, loadHdri, loadTexture } from './shared'

export function AssetController({
  onRootLoaded,
}: {
  onRootLoaded: (root: THREE.Object3D | null) => void
}) {
  const { gl } = useThree()
  const pmremRef = useRef<THREE.PMREMGenerator | null>(null)
  const modelRequest = useEditorStore((state) => state.modelRequest)
  const atlasRequest = useEditorStore((state) => state.atlasRequest)
  const environmentRequest = useEditorStore((state) => state.environmentRequest)
  const setAssets = useEditorStore((state) => state.setAssets)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setSceneGraph = useEditorStore((state) => state.setSceneGraph)
  const setAtlasTexture = useEditorStore((state) => state.setAtlasTexture)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setEnvironmentTextures = useEditorStore((state) => state.setEnvironmentTextures)
  const setViewer = useEditorStore((state) => state.setViewer)

  useEffect(() => {
    pmremRef.current = new THREE.PMREMGenerator(gl)
    pmremRef.current.compileEquirectangularShader()
    return () => {
      pmremRef.current?.dispose()
    }
  }, [gl])

  useEffect(() => {
    if (!modelRequest) {
      return
    }

    let isCancelled = false
    setStatus(`Loading model: ${modelRequest.label}`)

    loadGltf(modelRequest.url)
      .then((gltf) => {
        if (isCancelled) return

        const root = gltf.scene
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })

        const nextGraph = buildSceneGraph(root)
        setSceneGraph(
          nextGraph.sceneGraph,
          nextGraph.objects,
          nextGraph.materials,
          nextGraph.rootNodeId,
          null,
        )
        setAssets({ model: modelRequest.label, fileSize: modelRequest.fileSize })
        setStatus(`Model loaded: ${modelRequest.label}`)
        onRootLoaded(root)
        setViewer({ cameraMode: 'orbit' })
      })
      .catch((error) => {
        console.error(error)
        setStatus(`Failed to load model: ${modelRequest.label}`)
      })
      .finally(() => {
        if (modelRequest.revokeAfter) {
          URL.revokeObjectURL(modelRequest.url)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [modelRequest, onRootLoaded, setAssets, setSceneGraph, setStatus, setViewer])

  useEffect(() => {
    if (!atlasRequest) {
      return
    }

    let isCancelled = false
    setStatus(`Loading atlas: ${atlasRequest.label}`)

    loadTexture(atlasRequest.url)
      .then((texture) => {
        if (isCancelled) return
        const previous = useEditorStore.getState().runtimeTextures.atlasTexture
        if (previous && previous !== texture) {
          previous.dispose()
        }
        ensureAtlasTextureOptions(
          texture,
          useEditorStore.getState().materials[useEditorStore.getState().selectedObjectId ?? '']?.effect.wrapMode ?? 'repeat',
        )
        setAtlasTexture(texture)
        setAssets({ atlas: atlasRequest.label })
        setStatus(`Atlas loaded: ${atlasRequest.label}`)
      })
      .catch((error) => {
        console.error(error)
        setStatus(`Failed to load atlas: ${atlasRequest.label}`)
      })
      .finally(() => {
        if (atlasRequest.revokeAfter) {
          URL.revokeObjectURL(atlasRequest.url)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [atlasRequest, setAssets, setAtlasTexture, setStatus])

  useEffect(() => {
    if (!environmentRequest || !pmremRef.current) {
      return
    }

    let isCancelled = false
    setStatus(`Loading environment: ${environmentRequest.label}`)

    const loader =
      environmentRequest.kind === 'hdri' ? loadHdri(environmentRequest.url) : loadTexture(environmentRequest.url)

    Promise.resolve(loader)
      .then((texture) => {
        if (isCancelled) return

        const { runtimeTextures: currentTextures, environment: currentEnvironment } = useEditorStore.getState()

        if (environmentRequest.kind === 'panorama') {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.mapping = THREE.EquirectangularReflectionMapping
          if (
            currentTextures.environmentBackground &&
            currentTextures.environmentBackground !== currentTextures.environmentMap
          ) {
            currentTextures.environmentBackground.dispose()
          }
          setEnvironmentTextures({
            environmentBackground: texture,
          })
          setEnvironment({
            source: environmentRequest.label,
            kind: 'panorama',
            background: 'environment',
            backgroundVisible: true,
          })
          setAssets({ background: environmentRequest.label })
          setStatus(`Background loaded: ${environmentRequest.label}`)
          return
        }

        texture.mapping = THREE.EquirectangularReflectionMapping
        if (environmentRequest.kind === 'image') {
          texture.colorSpace = THREE.SRGBColorSpace
        }
        const envMap = pmremRef.current!.fromEquirectangular(texture).texture

        if (
          currentEnvironment.customHdriUrl &&
          currentEnvironment.customHdriUrl !== environmentRequest.url &&
          currentEnvironment.customHdriUrl.startsWith('blob:')
        ) {
          URL.revokeObjectURL(currentEnvironment.customHdriUrl)
        }

        currentTextures.environmentMap?.dispose()
        setEnvironmentTextures({
          environmentMap: envMap,
        })
          setEnvironment({
            source: environmentRequest.label,
            customHdriUrl: environmentRequest.url,
            kind: 'hdri',
            isEnvironmentEnabled: true,
          })
        setAssets({ reflections: environmentRequest.label })
        setStatus(`Environment loaded: ${environmentRequest.label}`)

        texture.dispose()
      })
      .catch((error) => {
        console.error(error)
        if (environmentRequest.kind !== 'panorama') {
          setEnvironment({
            customHdriUrl: null,
            kind: 'default',
            source: null,
            isEnvironmentEnabled: true,
          })
          setAssets({ reflections: null })
        }
        setStatus(`Failed to load environment: ${environmentRequest.label}`)
      })
      .finally(() => {
        if (environmentRequest.revokeAfter) {
          URL.revokeObjectURL(environmentRequest.url)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [environmentRequest, setAssets, setEnvironment, setEnvironmentTextures, setStatus])

  return null
}
