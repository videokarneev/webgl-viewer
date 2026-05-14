import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ensureAtlasTextureOptions } from '../features/atlas/atlasMaterialPatch'
import { buildSceneGraph } from '../features/scene/buildSceneGraph'
import { loadGltf, loadHdri, loadTexture } from '../features/scene/runtime/shared'
import { useEditorStore } from '../store/editorStore'

function revokeIfBlob(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function disposeMaterial(material: THREE.Material) {
  material.dispose()
}

function disposeObjectTree(root: THREE.Object3D | null) {
  if (!root) {
    return
  }

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return
    }

    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()

    const rawMaterial = mesh.material
    const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]
    materials.forEach((material) => {
      if (material) {
        disposeMaterial(material)
      }
    })
  })
}

function clearRegisteredRuntimeRefs(
  ids: { objectIds: string[]; materialIds: string[] },
  registerObjectRef: (id: string, object: THREE.Object3D | null) => void,
  registerMaterialRef: (id: string, material: THREE.Material | null) => void,
) {
  ids.objectIds.forEach((id) => registerObjectRef(id, null))
  ids.materialIds.forEach((id) => registerMaterialRef(id, null))
}

function collectRuntimeRefs(root: THREE.Object3D) {
  const objects: Array<{ id: string; object: THREE.Object3D }> = []
  const materials: Array<{ id: string; material: THREE.Material }> = []
  const seenMaterials = new Set<string>()

  root.traverse((object) => {
    objects.push({ id: object.uuid, object })

    if (!(object as THREE.Mesh).isMesh) {
      return
    }

    const mesh = object as THREE.Mesh
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

    meshMaterials.forEach((material) => {
      if (!material) {
        return
      }

      const id = `material:${material.uuid}`
      if (seenMaterials.has(id)) {
        return
      }

      seenMaterials.add(id)
      materials.push({ id, material })
    })
  })

  return { objects, materials }
}

function getActiveWrapMode() {
  const state = useEditorStore.getState()
  if (state.selectedMaterialId && state.materials[state.selectedMaterialId]) {
    return state.materials[state.selectedMaterialId].effect.wrapMode
  }

  return Object.values(state.materials)[0]?.effect.wrapMode ?? 'repeat'
}

export function AssetController() {
  const modelRequest = useEditorStore((state) => state.modelRequest)
  const atlasRequest = useEditorStore((state) => state.atlasRequest)
  const environmentRequest = useEditorStore((state) => state.environmentRequest)
  const rootNodeIds = useEditorStore((state) => state.rootNodeIds)
  const materials = useEditorStore((state) => state.materials)
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId)
  const registerObjectRef = useEditorStore((state) => state.registerObjectRef)
  const registerMaterialRef = useEditorStore((state) => state.registerMaterialRef)
  const addLoadedModel = useEditorStore((state) => state.addLoadedModel)
  const setAssets = useEditorStore((state) => state.setAssets)
  const setAtlasTexture = useEditorStore((state) => state.setAtlasTexture)
  const setAtlasFrameTexture = useEditorStore((state) => state.setAtlasFrameTexture)
  const setEnvironmentTextures = useEditorStore((state) => state.setEnvironmentTextures)
  const setEnvironment = useEditorStore((state) => state.setEnvironment)
  const setStatus = useEditorStore((state) => state.setStatus)
  const setViewer = useEditorStore((state) => state.setViewer)

  const loadedRootsRef = useRef(
    new Map<
      string,
      {
        root: THREE.Object3D
        registeredIds: { objectIds: string[]; materialIds: string[] }
      }
    >(),
  )
  const handledModelNonceRef = useRef<number | null>(null)
  const handledAtlasNonceRef = useRef<number | null>(null)
  const handledEnvironmentNonceRef = useRef<number | null>(null)
  const previousModelUrlRef = useRef<string | null>(null)
  const previousAtlasUrlRef = useRef<string | null>(null)
  const previousEnvironmentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      revokeIfBlob(previousModelUrlRef.current)
      revokeIfBlob(previousAtlasUrlRef.current)
      revokeIfBlob(previousEnvironmentUrlRef.current)
      loadedRootsRef.current.forEach(({ root, registeredIds }) => {
        clearRegisteredRuntimeRefs(registeredIds, registerObjectRef, registerMaterialRef)
        disposeObjectTree(root)
      })
      loadedRootsRef.current.clear()
      const runtimeTextures = useEditorStore.getState().runtimeTextures
      runtimeTextures.atlasTexture?.dispose()
      runtimeTextures.atlasFrameTexture?.dispose()
      runtimeTextures.environmentMap?.dispose()
      if (
        runtimeTextures.environmentBackground &&
        runtimeTextures.environmentBackground !== runtimeTextures.environmentMap
      ) {
        runtimeTextures.environmentBackground.dispose()
      }
      Object.values(runtimeTextures.materialEnvironmentMaps).forEach((texture) => texture.dispose())
    }
  }, [])

  useEffect(() => {
    loadedRootsRef.current.forEach((entry, rootId) => {
      if (rootNodeIds.includes(rootId)) {
        return
      }

      clearRegisteredRuntimeRefs(entry.registeredIds, registerObjectRef, registerMaterialRef)
      disposeObjectTree(entry.root)
      loadedRootsRef.current.delete(rootId)
    })
  }, [rootNodeIds, registerMaterialRef, registerObjectRef])

  useEffect(() => {
    const runtimeTextures = useEditorStore.getState().runtimeTextures
    const wrapMode = getActiveWrapMode()

    if (runtimeTextures.atlasTexture) {
      ensureAtlasTextureOptions(runtimeTextures.atlasTexture, wrapMode)
    }
    if (runtimeTextures.atlasFrameTexture) {
      ensureAtlasTextureOptions(runtimeTextures.atlasFrameTexture, wrapMode)
    }
  }, [materials, selectedMaterialId])

  useEffect(() => {
    if (!modelRequest || handledModelNonceRef.current === modelRequest.nonce) {
      return
    }

    handledModelNonceRef.current = modelRequest.nonce
    let isCancelled = false

    revokeIfBlob(previousModelUrlRef.current)
    previousModelUrlRef.current = modelRequest.url
    setStatus(`Loading model: ${modelRequest.label}`)

    void (async () => {
      try {
        const gltf = await loadGltf(modelRequest.url)
        const latestModelNonce = useEditorStore.getState().modelRequest?.nonce ?? null
        if (isCancelled || latestModelNonce !== modelRequest.nonce) {
          disposeObjectTree(gltf.scene)
          return
        }

        const root = gltf.scene
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })

        const nextGraph = buildSceneGraph(root)
        const runtimeRefs = collectRuntimeRefs(root)
        runtimeRefs.objects.forEach(({ id, object }) => registerObjectRef(id, object))
        runtimeRefs.materials.forEach(({ id, material }) => registerMaterialRef(id, material))
        loadedRootsRef.current.set(nextGraph.rootNodeId, {
          root,
          registeredIds: {
            objectIds: runtimeRefs.objects.map((entry) => entry.id),
            materialIds: runtimeRefs.materials.map((entry) => entry.id),
          },
        })

        addLoadedModel(
          nextGraph.sceneGraph,
          nextGraph.objects,
          nextGraph.materials,
          nextGraph.rootNodeId,
          modelRequest.label,
          nextGraph.rootNodeId,
        )
        setAssets({ model: modelRequest.label, fileSize: modelRequest.fileSize })
        setStatus(`Model ready: ${modelRequest.label}`)
        setViewer({ cameraMode: 'orbit' })
      } catch (error) {
        console.error(error)
        setStatus(`Failed to load model: ${modelRequest.label}`)
      } finally {
        if (modelRequest.revokeAfter) {
          revokeIfBlob(modelRequest.url)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [
    modelRequest,
    registerMaterialRef,
    registerObjectRef,
    setAssets,
    addLoadedModel,
    setStatus,
    setViewer,
  ])

  useEffect(() => {
    if (!atlasRequest || handledAtlasNonceRef.current === atlasRequest.nonce) {
      return
    }

    handledAtlasNonceRef.current = atlasRequest.nonce
    let isCancelled = false

    revokeIfBlob(previousAtlasUrlRef.current)
    previousAtlasUrlRef.current = atlasRequest.url
    setStatus(`Loading atlas: ${atlasRequest.label}`)

    void (async () => {
      try {
        const texture = await loadTexture(atlasRequest.url)
        if (isCancelled) {
          texture.dispose()
          return
        }

        const runtimeTextures = useEditorStore.getState().runtimeTextures
        if (runtimeTextures.atlasTexture && runtimeTextures.atlasTexture !== texture) {
          runtimeTextures.atlasTexture.dispose()
        }
        if (runtimeTextures.atlasFrameTexture) {
          runtimeTextures.atlasFrameTexture.dispose()
          setAtlasFrameTexture(null)
        }

        ensureAtlasTextureOptions(texture, getActiveWrapMode())
        setAtlasTexture(texture)
        setAssets({ atlas: atlasRequest.label })
        setStatus(`Atlas loaded: ${atlasRequest.label}`)
      } catch (error) {
        console.error(error)
        setStatus(`Failed to load atlas: ${atlasRequest.label}`)
      } finally {
        if (atlasRequest.revokeAfter) {
          revokeIfBlob(atlasRequest.url)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [atlasRequest, setAssets, setAtlasFrameTexture, setAtlasTexture, setStatus])

  useEffect(() => {
    if (!environmentRequest || handledEnvironmentNonceRef.current === environmentRequest.nonce) {
      return
    }

    handledEnvironmentNonceRef.current = environmentRequest.nonce
    let isCancelled = false

    revokeIfBlob(previousEnvironmentUrlRef.current)
    previousEnvironmentUrlRef.current = environmentRequest.url
    setStatus(`Loading environment: ${environmentRequest.label}`)

    void (async () => {
      try {
        const shouldLoadAsHdri =
          environmentRequest.kind === 'hdri' ||
          (environmentRequest.kind === 'background' &&
            /\.(hdr|exr)$/i.test(environmentRequest.label || environmentRequest.url))
        const texture =
          shouldLoadAsHdri
            ? await loadHdri(environmentRequest.url)
            : await loadTexture(environmentRequest.url)
        if (isCancelled) {
          texture.dispose()
          return
        }

        texture.mapping = THREE.EquirectangularReflectionMapping
        if (!shouldLoadAsHdri) {
          texture.colorSpace = THREE.SRGBColorSpace
        }

        const runtimeTextures = useEditorStore.getState().runtimeTextures

        if (environmentRequest.kind === 'panorama' || environmentRequest.kind === 'background') {
          if (
            runtimeTextures.environmentBackground &&
            runtimeTextures.environmentBackground !== runtimeTextures.environmentMap
          ) {
            runtimeTextures.environmentBackground.dispose()
          }

          setEnvironmentTextures({ environmentBackground: texture })
          useEditorStore.getState().setBackgroundPanoramaUrl(environmentRequest.url)
          useEditorStore.getState().setBackgroundMode('background')
          setAssets({ background: environmentRequest.label })
          setStatus(`Background loaded: ${environmentRequest.label}`)
          return
        }

        if (runtimeTextures.environmentMap && runtimeTextures.environmentMap !== texture) {
          runtimeTextures.environmentMap.dispose()
        }

        setEnvironmentTextures({ environmentMap: texture })
        setEnvironment({
          source: environmentRequest.label,
          customHdriUrl: environmentRequest.url,
          kind: environmentRequest.kind === 'image' ? 'panorama' : 'hdri',
          isEnvironmentEnabled: true,
        })
        setAssets({ reflections: environmentRequest.label })
        setStatus(`Environment loaded: ${environmentRequest.label}`)
      } catch (error) {
        console.error(error)
        setStatus(`Failed to load environment: ${environmentRequest.label}`)
      } finally {
        if (environmentRequest.revokeAfter) {
          revokeIfBlob(environmentRequest.url)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [environmentRequest, setAssets, setEnvironment, setEnvironmentTextures, setStatus])

  return null
}
