import JSZip from 'jszip'
import { buildPublishedScene, type PublishedSceneV2 } from './buildPublishedScene'

type AssetFolder =
  | 'model'
  | 'atlas'
  | 'environment'
  | 'background'
  | 'audio'
  | 'material-textures'
  | 'material-environments'

type PackageAssetRequest = {
  url: string
  label: string | null
  folder: AssetFolder
  slug: string
}

type PackageAssetRecord = {
  url: string
  relativePath: string
}

type PackageAssetSource = {
  assetUrl: string | null
}

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'
}

function getExtension(url: string, label: string | null) {
  const fromLabel = label?.match(/(\.[a-z0-9]+)$/i)?.[1]
  if (fromLabel) {
    return fromLabel.toLowerCase()
  }

  const fromUrl = url
    .split('#')[0]
    ?.split('?')[0]
    ?.match(/(\.[a-z0-9]+)$/i)?.[1]

  return fromUrl ? fromUrl.toLowerCase() : '.bin'
}

function buildSuggestedRelativePath(request: PackageAssetRequest) {
  const extension = getExtension(request.url, request.label)
  const fileStem = sanitizeSegment(request.label ?? request.slug)
  return `assets/${request.folder}/${request.slug}-${fileStem}${extension}`
}

function clonePublishedScene(scene: PublishedSceneV2): PublishedSceneV2 {
  return JSON.parse(JSON.stringify(scene)) as PublishedSceneV2
}

function rewriteAssetUrl(source: PackageAssetSource | null | undefined, assetMap: Map<string, string>) {
  if (!source?.assetUrl) {
    return
  }

  source.assetUrl = assetMap.get(source.assetUrl) ?? source.assetUrl
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function fetchAssetBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.blob()
}

function collectPackageAssetRequests(scene: PublishedSceneV2) {
  const requests: PackageAssetRequest[] = []

  if (scene.model?.assetUrl) {
    requests.push({
      url: scene.model.assetUrl,
      label: scene.model.assetLabel,
      folder: 'model',
      slug: 'scene-model',
    })
  }

  if (scene.scene.environment.assetUrl) {
    requests.push({
      url: scene.scene.environment.assetUrl,
      label: scene.scene.environment.assetLabel,
      folder: 'environment',
      slug: 'scene-environment',
    })
  }

  if (scene.scene.environment.backgroundAssetUrl) {
    requests.push({
      url: scene.scene.environment.backgroundAssetUrl,
      label: scene.scene.environment.backgroundAssetLabel,
      folder: 'background',
      slug: 'scene-background',
    })
  }

  if (scene.audio.assetUrl) {
    requests.push({
      url: scene.audio.assetUrl,
      label: scene.audio.assetLabel,
      folder: 'audio',
      slug: 'scene-audio',
    })
  }

  scene.materials.forEach((material, materialIndex) => {
    const materialSlug = `${materialIndex + 1}-${sanitizeSegment(material.name || material.id)}`

    if (material.environmentOverride?.assetUrl) {
      requests.push({
        url: material.environmentOverride.assetUrl,
        label: material.environmentOverride.assetLabel,
        folder: 'material-environments',
        slug: `${materialSlug}-environment`,
      })
    }

    Object.entries(material.textureSlots).forEach(([slotName, slotEntry]) => {
      if (!slotEntry?.assetUrl || slotEntry.source === 'original' || slotEntry.source === 'none') {
        return
      }

      requests.push({
        url: slotEntry.assetUrl,
        label: slotEntry.label,
        folder: slotEntry.source === 'flipbook' ? 'atlas' : 'material-textures',
        slug: `${materialSlug}-${sanitizeSegment(slotName)}`,
      })
    })

    if (material.effects.flipbook?.atlasAssetUrl) {
      requests.push({
        url: material.effects.flipbook.atlasAssetUrl,
        label: material.effects.flipbook.atlasAssetLabel,
        folder: 'atlas',
        slug: `${materialSlug}-flipbook-atlas`,
      })
    }
  })

  return requests
}

async function buildPackageAssetMap(scene: PublishedSceneV2) {
  const zip = new JSZip()
  const warnings: string[] = []
  const assetMap = new Map<string, string>()
  const usedRelativePaths = new Set<string>()
  const requests = collectPackageAssetRequests(scene)

  for (const request of requests) {
    if (assetMap.has(request.url)) {
      continue
    }

    let relativePath = buildSuggestedRelativePath(request)
    let collisionIndex = 2
    while (usedRelativePaths.has(relativePath)) {
      const extension = getExtension(request.url, request.label)
      relativePath = `assets/${request.folder}/${request.slug}-${collisionIndex}${extension}`
      collisionIndex += 1
    }

    try {
      const blob = await fetchAssetBlob(request.url)
      zip.file(relativePath, blob)
      assetMap.set(request.url, relativePath)
      usedRelativePaths.add(relativePath)
    } catch (error) {
      console.error(error)
      warnings.push(`Failed to package asset "${request.label ?? request.slug}" from ${request.url}.`)
    }
  }

  return { zip, warnings, assetMap }
}

function rewriteSceneAssetUrls(scene: PublishedSceneV2, assetMap: Map<string, string>) {
  rewriteAssetUrl(scene.model, assetMap)
  rewriteAssetUrl(scene.scene.environment, assetMap)
  if (scene.scene.environment.backgroundAssetUrl) {
    scene.scene.environment.backgroundAssetUrl =
      assetMap.get(scene.scene.environment.backgroundAssetUrl) ?? scene.scene.environment.backgroundAssetUrl
  }
  rewriteAssetUrl(scene.audio, assetMap)

  scene.materials.forEach((material) => {
    rewriteAssetUrl(material.environmentOverride, assetMap)

    Object.values(material.textureSlots).forEach((slotEntry) => {
      rewriteAssetUrl(slotEntry, assetMap)
    })

    if (material.effects.flipbook?.atlasAssetUrl) {
      material.effects.flipbook.atlasAssetUrl =
        assetMap.get(material.effects.flipbook.atlasAssetUrl) ?? material.effects.flipbook.atlasAssetUrl
    }
  })
}

function buildPackageReadme() {
  return [
    'Web Package Export',
    '',
    'Contents:',
    '- scene.json',
    '- assets/... referenced by scene.json',
    '',
    'How to host:',
    '1. Upload the entire unzipped folder to a static host or CDN.',
    '2. Keep scene.json and assets/ together.',
    '3. Open the viewer with:',
    '   https://your-viewer-host.example/?player=1&scene=https://your-cdn.example/path/to/scene.json',
    '',
    'iframe example:',
    '<iframe src="https://your-viewer-host.example/?player=1&scene=https%3A%2F%2Fyour-cdn.example%2Fpath%2Fto%2Fscene.json" width="100%" height="700" style="border:0;" allow="autoplay; fullscreen"></iframe>',
  ].join('\n')
}

export async function exportWebPackage(filename = 'scene-web-package.zip') {
  const { scene, warnings: baseWarnings } = buildPublishedScene()
  const sceneForPackage = clonePublishedScene(scene)
  const { zip, warnings: packagingWarnings, assetMap } = await buildPackageAssetMap(sceneForPackage)

  rewriteSceneAssetUrls(sceneForPackage, assetMap)
  zip.file('scene.json', JSON.stringify(sceneForPackage, null, 2))
  zip.file('README.txt', buildPackageReadme())

  const archive = await zip.generateAsync({ type: 'blob' })
  downloadBlob(filename, archive)

  const filteredBaseWarnings = baseWarnings.filter(
    (warning) => !warning.includes('publish asset packaging is not wired yet'),
  )

  return {
    warnings: [...filteredBaseWarnings, ...packagingWarnings],
  }
}
