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

type PackagedAssetFile = PackageAssetRecord & {
  blob: Blob
}

type PackageAssetSource = {
  assetUrl: string | null
}

type ExportWebPackageResult = {
  warnings: string[]
  destination: 'remote' | 'cancelled'
  sceneSlug: string | null
  relativeSceneUrl: string | null
  prettySceneUrl: string | null
  publicSceneUrl: string | null
  deployOrigin: string | null
  gitCommitSha: string | null
  pushed: boolean
}

export type WebPublishDeploymentPhase =
  | 'preparing'
  | 'git-pushed'
  | 'checking'
  | 'ready'
  | 'timeout'
  | 'error'

export type WebPublishDeploymentStatus = {
  phase: WebPublishDeploymentPhase
  message: string
  sceneSlug: string | null
  prettySceneUrl: string | null
  publicSceneUrl: string | null
  deployOrigin: string | null
  gitCommitSha: string | null
}

type WebPublishStatusPayload = {
  status?: 'pending' | 'ready' | 'error'
  message?: string
  deployOrigin?: string | null
  publicSceneUrl?: string | null
  prettySceneUrl?: string | null
}

type ExportWebPackageOptions = {
  onDeploymentStatusChange?: (status: WebPublishDeploymentStatus) => void
  signal?: AbortSignal
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
  const warnings: string[] = []
  const assetMap = new Map<string, string>()
  const usedRelativePaths = new Set<string>()
  const files: PackagedAssetFile[] = []
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
      files.push({
        url: request.url,
        relativePath,
        blob,
      })
      assetMap.set(request.url, relativePath)
      usedRelativePaths.add(relativePath)
    } catch (error) {
      console.error(error)
      warnings.push(`Failed to package asset "${request.label ?? request.slug}" from ${request.url}.`)
    }
  }

  return { warnings, assetMap, files }
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
    '- index.html',
    '- assets/... referenced by scene.json',
    '',
    'How to host:',
    '1. Upload the entire unzipped folder to a static host or CDN.',
    '2. Keep scene.json and assets/ together.',
    '3. Open the viewer with:',
    '   https://your-viewer-host.example/?player=1&scene=https://your-cdn.example/path/to/scene.json&transparent=1',
    '4. Or open the pretty scene URL:',
    '   https://your-cdn.example/path/to/scene-folder/',
    '   The pretty scene URL preserves query params and enables transparent mode automatically inside iframes.',
    '',
    'iframe example:',
    '<iframe src="https://your-cdn.example/path/to/scene-folder/" width="100%" height="700" style="border:0;" allow="autoplay; fullscreen"></iframe>',
  ].join('\n')
}

function buildPublishedSceneIndexHtml(sceneSlug: string) {
  const title = `Scene ${sceneSlug}`
  const sceneUrl = `/scenes/${sceneSlug}/scene.json`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta http-equiv="refresh" content="0; url=/?player=1&scene=${sceneUrl}&transparent=1" />
    <script>
      const sceneUrl = ${JSON.stringify(sceneUrl)}
      const params = new URLSearchParams(window.location.search)
      const isEmbedded = (() => {
        try {
          return window.self !== window.top
        } catch {
          return true
        }
      })()

      params.set('player', '1')
      params.set('scene', sceneUrl)
      if (!params.has('transparent') && isEmbedded) {
        params.set('transparent', '1')
      }

      const targetUrl = '/?' + params.toString() + window.location.hash
      window.location.replace(targetUrl)
    </script>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d1116;
        color: #d8e1ea;
        font: 16px/1.5 system-ui, sans-serif;
      }
      a { color: #9ecbff; }
    </style>
  </head>
  <body>
    <p>Opening scene <a href="/?player=1&scene=${sceneUrl}&transparent=1">${sceneSlug}</a>...</p>
  </body>
</html>
`
}

async function fetchPublishedSceneCatalog() {
  const response = await fetch('/__publish/scenes')
  if (!response.ok) {
    throw new Error(`Failed to load published scene catalog: ${response.status}`)
  }

  const payload = (await response.json()) as { scenes?: string[] }
  return Array.isArray(payload.scenes) ? payload.scenes : []
}

function emitWebPublishDeploymentStatus(
  options: ExportWebPackageOptions | undefined,
  status: WebPublishDeploymentStatus,
) {
  options?.onDeploymentStatusChange?.(status)
}

function createDeploymentStatusMessage(
  phase: WebPublishDeploymentPhase,
  sceneSlug: string,
  gitCommitSha: string | null,
  fallback?: string,
) {
  if (fallback) {
    return fallback
  }

  if (phase === 'git-pushed') {
    return gitCommitSha
      ? `Scene "${sceneSlug}" pushed to GitHub as ${gitCommitSha}. Waiting for Vercel...`
      : `Scene "${sceneSlug}" pushed to GitHub. Waiting for Vercel...`
  }

  if (phase === 'checking') {
    return `Checking Vercel deployment for "${sceneSlug}"...`
  }

  if (phase === 'ready') {
    return `Scene "${sceneSlug}" is live on Vercel.`
  }

  if (phase === 'timeout') {
    return `Git push succeeded for "${sceneSlug}", but Vercel is still pending. Check Deployments in a minute.`
  }

  return `Failed to verify Vercel status for "${sceneSlug}".`
}

async function fetchWebPublishStatus(sceneSlug: string, signal?: AbortSignal) {
  const response = await fetch(`/__publish/web-package-status?sceneSlug=${encodeURIComponent(sceneSlug)}`, {
    signal,
  })

  const payload = (await response.json().catch(() => null)) as WebPublishStatusPayload | null
  if (!response.ok) {
    throw new Error(payload?.message ?? `Failed to check web publish status: ${response.status}`)
  }

  return payload ?? {}
}

function waitForWebPublishPolling(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', abortListener)
      resolve()
    }, delayMs)

    const abortListener = () => {
      window.clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', abortListener, { once: true })
  })
}

async function monitorWebPublishDeployment(
  sceneSlug: string,
  result: Pick<ExportWebPackageResult, 'prettySceneUrl' | 'publicSceneUrl' | 'deployOrigin' | 'gitCommitSha' | 'pushed'>,
  options?: ExportWebPackageOptions,
) {
  emitWebPublishDeploymentStatus(options, {
    phase: 'git-pushed',
    message: createDeploymentStatusMessage('git-pushed', sceneSlug, result.gitCommitSha),
    sceneSlug,
    prettySceneUrl: result.prettySceneUrl,
    publicSceneUrl: result.publicSceneUrl,
    deployOrigin: result.deployOrigin,
    gitCommitSha: result.gitCommitSha,
  })

  const maxAttempts = 18
  const initialDelayMs = result.pushed ? 2000 : 500
  const retryDelayMs = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForWebPublishPolling(attempt === 0 ? initialDelayMs : retryDelayMs, options?.signal)

    const payload = await fetchWebPublishStatus(sceneSlug, options?.signal)
    const phase = payload.status === 'ready' ? 'ready' : payload.status === 'error' ? 'error' : 'checking'
    const message = createDeploymentStatusMessage(phase, sceneSlug, result.gitCommitSha, payload.message)
    const nextStatus: WebPublishDeploymentStatus = {
      phase,
      message,
      sceneSlug,
      prettySceneUrl: payload.prettySceneUrl ?? result.prettySceneUrl,
      publicSceneUrl: payload.publicSceneUrl ?? result.publicSceneUrl,
      deployOrigin: payload.deployOrigin ?? result.deployOrigin,
      gitCommitSha: result.gitCommitSha,
    }

    emitWebPublishDeploymentStatus(options, nextStatus)
    if (phase === 'ready' || phase === 'error') {
      return
    }
  }

  emitWebPublishDeploymentStatus(options, {
    phase: 'timeout',
    message: createDeploymentStatusMessage('timeout', sceneSlug, result.gitCommitSha),
    sceneSlug,
    prettySceneUrl: result.prettySceneUrl,
    publicSceneUrl: result.publicSceneUrl,
    deployOrigin: result.deployOrigin,
    gitCommitSha: result.gitCommitSha,
  })
}

async function publishWebPackageToRemote(
  sceneSlug: string,
  replace: boolean,
  options?: ExportWebPackageOptions,
): Promise<ExportWebPackageResult> {
  const { scene, warnings: baseWarnings } = await buildPublishedScene()
  const sceneForPackage = clonePublishedScene(scene)
  const { warnings: packagingWarnings, assetMap, files } = await buildPackageAssetMap(sceneForPackage)
  rewriteSceneAssetUrls(sceneForPackage, assetMap)
  const zip = new JSZip()

  files.forEach((file) => {
    zip.file(file.relativePath, file.blob)
  })
  zip.file('scene.json', JSON.stringify(sceneForPackage, null, 2))
  zip.file('index.html', buildPublishedSceneIndexHtml(sceneSlug))
  zip.file('README.txt', buildPackageReadme())

  const archive = await zip.generateAsync({ type: 'blob' })
  const response = await fetch(`/__publish/web-package?sceneSlug=${encodeURIComponent(sceneSlug)}&replace=${replace ? '1' : '0'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: archive,
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string
        relativeSceneUrl?: string | null
        prettySceneUrl?: string | null
        publicSceneUrl?: string | null
        deployOrigin?: string | null
        gitCommitSha?: string | null
        pushed?: boolean
      }
    | null

  if (!response.ok) {
    throw new Error(payload?.message ?? `Failed to publish scene: ${response.status}`)
  }

  const filteredBaseWarnings = baseWarnings.filter(
    (warning) => !warning.includes('publish asset packaging is not wired yet'),
  )

  const result: ExportWebPackageResult = {
    warnings: [...filteredBaseWarnings, ...packagingWarnings],
    destination: 'remote',
    sceneSlug,
    relativeSceneUrl: payload?.relativeSceneUrl ?? `/scenes/${sceneSlug}/scene.json`,
    prettySceneUrl: payload?.prettySceneUrl ?? null,
    publicSceneUrl: payload?.publicSceneUrl ?? null,
    deployOrigin: payload?.deployOrigin ?? null,
    gitCommitSha: payload?.gitCommitSha ?? null,
    pushed: payload?.pushed ?? true,
  }

  void monitorWebPublishDeployment(sceneSlug, result, options).catch((error) => {
    if ((error as { name?: string })?.name === 'AbortError') {
      return
    }

    emitWebPublishDeploymentStatus(options, {
      phase: 'error',
      message:
        error instanceof Error
          ? `Failed to verify Vercel status for "${sceneSlug}": ${error.message}`
          : `Failed to verify Vercel status for "${sceneSlug}".`,
      sceneSlug,
      prettySceneUrl: result.prettySceneUrl,
      publicSceneUrl: result.publicSceneUrl,
      deployOrigin: result.deployOrigin,
      gitCommitSha: result.gitCommitSha,
    })
  })

  return result
}

async function requestSceneTarget() {
  const existingScenes = await fetchPublishedSceneCatalog()
  const rawValue = window.prompt(
    `Publish scene to GitHub as public/scenes/<name>.\nExisting scenes: ${existingScenes.join(', ') || 'none'}\nEnter a scene name.`,
    'demo-02',
  )

  if (rawValue == null) {
    return null
  }

  const trimmedValue = rawValue.trim()
  if (!trimmedValue) {
    return null
  }

  const sceneSlug = sanitizeSegment(trimmedValue)
  const replace = existingScenes.includes(sceneSlug)
    ? window.confirm(`Scene "${sceneSlug}" already exists on web. Replace it?`)
    : false

  if (existingScenes.includes(sceneSlug) && !replace) {
    return null
  }

  return {
    sceneSlug,
    replace,
  }
}

export async function exportWebPackage(
  _filename = 'scene-web-package.zip',
  options?: ExportWebPackageOptions,
): Promise<ExportWebPackageResult> {
  const target = await requestSceneTarget()
  if (!target) {
    return {
      warnings: [],
      destination: 'cancelled',
      sceneSlug: null,
      relativeSceneUrl: null,
      prettySceneUrl: null,
      publicSceneUrl: null,
      deployOrigin: null,
      gitCommitSha: null,
      pushed: false,
    }
  }

  return publishWebPackageToRemote(target.sceneSlug, target.replace, options)
}
