import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const execFileAsync = promisify(execFile)
const DEFAULT_WEB_PUBLISH_DEPLOY_ORIGIN =
  process.env.WEB_PUBLISH_DEPLOY_ORIGIN?.trim().replace(/\/+$/, '') || 'https://webgl-viewer-jet.vercel.app'

function getViteCliEntry(rootDir: string) {
  return path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
}

function summarizeCommandOutput(output: string, maxLines = 18) {
  return output
    .split(/\r?\n/)
    .map((line: string) => line.trimEnd())
    .filter(Boolean)
    .slice(-maxLines)
    .join('\n')
}

function sanitizeSceneSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scene'
}

function createJsonResponse(statusCode: number, payload: unknown) {
  return {
    statusCode,
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
  }
}

async function listPublishedScenes(rootDir: string) {
  const scenesDir = path.join(rootDir, 'public', 'scenes')

  try {
    const entries = await fs.readdir(scenesDir, { withFileTypes: true })
    return entries
      .filter((entry: import('node:fs').Dirent) => entry.isDirectory())
      .map((entry: import('node:fs').Dirent) => entry.name)
      .sort((left: string, right: string) => left.localeCompare(right))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function readRequestBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function normalizeZipEntryPath(entryName: string) {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    return null
  }
  return normalized
}

async function unzipIntoDirectory(zipBuffer: Buffer, targetDirectory: string) {
  const zip = await JSZip.loadAsync(zipBuffer)
  const entries = Object.values(zip.files)

  for (const entry of entries) {
    if (entry.dir) {
      continue
    }

    const normalizedPath = normalizeZipEntryPath(entry.name)
    if (!normalizedPath) {
      throw new Error(`Unsafe zip entry path: ${entry.name}`)
    }

    const absolutePath = path.join(targetDirectory, normalizedPath)
    if (!absolutePath.startsWith(targetDirectory)) {
      throw new Error(`Zip entry escaped target directory: ${entry.name}`)
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    const content = await entry.async('nodebuffer')
    await fs.writeFile(absolutePath, content)
  }
}

async function runGit(rootDir: string, args: string[]) {
  return execFileAsync('git', args, { cwd: rootDir })
}

async function runProductionBuildCheck(rootDir: string) {
  try {
    await execFileAsync(process.execPath, [getViteCliEntry(rootDir), 'build'], {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string }
    const details = summarizeCommandOutput(`${failure.stdout ?? ''}\n${failure.stderr ?? ''}`)
    throw new Error(
      details
        ? `WEB publish stopped because production build failed.\n${details}`
        : failure.message
          ? `WEB publish stopped because production build failed.\n${failure.message}`
          : 'WEB publish stopped because production build failed.',
    )
  }
}

async function getCurrentGitBranch(rootDir: string) {
  const { stdout } = await runGit(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return stdout.trim() || 'main'
}

async function getCurrentGitCommitShortSha(rootDir: string) {
  const { stdout } = await runGit(rootDir, ['rev-parse', '--short', 'HEAD'])
  return stdout.trim() || null
}

async function getStagedFiles(rootDir: string) {
  const { stdout } = await runGit(rootDir, ['diff', '--cached', '--name-only'])
  return stdout
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean)
}

async function hasStagedChangesForPath(rootDir: string, relativePath: string) {
  try {
    await runGit(rootDir, ['diff', '--cached', '--quiet', '--', relativePath])
    return false
  } catch (error) {
    const exitCode = (error as { code?: number }).code
    if (exitCode === 1) {
      return true
    }
    throw error
  }
}

function buildDeploySceneUrls(sceneSlug: string, deployOrigin: string) {
  const normalizedOrigin = deployOrigin.replace(/\/+$/, '')
  return {
    deployOrigin: normalizedOrigin,
    publicSceneUrl: `${normalizedOrigin}/scenes/${sceneSlug}/scene.json`,
    prettySceneUrl: `${normalizedOrigin}/scenes/${sceneSlug}/`,
  }
}

function canonicalizeJsonText(source: string) {
  try {
    return JSON.stringify(JSON.parse(source))
  } catch {
    return source.replace(/\r\n/g, '\n').trim()
  }
}

function getPublishedSceneSchemaVersion(source: string) {
  try {
    const payload = JSON.parse(source) as { version?: unknown }
    return typeof payload.version === 'number' ? payload.version : null
  } catch {
    return null
  }
}

async function checkPublishedSceneDeployment(rootDir: string, sceneSlug: string, deployOrigin: string) {
  const localScenePath = path.join(rootDir, 'public', 'scenes', sceneSlug, 'scene.json')
  const { publicSceneUrl, prettySceneUrl } = buildDeploySceneUrls(sceneSlug, deployOrigin)

  if (!(await pathExists(localScenePath))) {
    return {
      status: 'error' as const,
      message: `Local scene "${sceneSlug}" does not exist.`,
      deployOrigin,
      publicSceneUrl,
      prettySceneUrl,
      localVersion: null,
      remoteVersion: null,
    }
  }

  const localSceneSource = await fs.readFile(localScenePath, 'utf8')
  const localVersion = getPublishedSceneSchemaVersion(localSceneSource)
  const remoteUrl = `${publicSceneUrl}?verify=${Date.now()}`

  try {
    const remoteResponse = await fetch(remoteUrl, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    if (remoteResponse.status === 404) {
      return {
        status: 'pending' as const,
        message: `Vercel has not published "${sceneSlug}" yet.`,
        deployOrigin,
        publicSceneUrl,
        prettySceneUrl,
        localVersion,
        remoteVersion: null,
      }
    }

    if (!remoteResponse.ok) {
      return {
        status: 'pending' as const,
        message: `Waiting for Vercel. Production scene check returned HTTP ${remoteResponse.status}.`,
        deployOrigin,
        publicSceneUrl,
        prettySceneUrl,
        localVersion,
        remoteVersion: null,
      }
    }

    const remoteSceneSource = await remoteResponse.text()
    const remoteVersion = getPublishedSceneSchemaVersion(remoteSceneSource)
    const matches = canonicalizeJsonText(localSceneSource) === canonicalizeJsonText(remoteSceneSource)

    if (matches) {
      return {
        status: 'ready' as const,
        message: `Scene "${sceneSlug}" is live on Vercel.`,
        deployOrigin,
        publicSceneUrl,
        prettySceneUrl,
        localVersion,
        remoteVersion,
      }
    }

    return {
      status: 'pending' as const,
      message:
        remoteVersion == null
          ? `Vercel is still serving a previous copy of "${sceneSlug}".`
          : `Vercel is still serving a previous copy of "${sceneSlug}" (remote schema v${remoteVersion}, local v${localVersion ?? '?'}).`,
      deployOrigin,
      publicSceneUrl,
      prettySceneUrl,
      localVersion,
      remoteVersion,
    }
  } catch {
    return {
      status: 'pending' as const,
      message: `Waiting for Vercel to respond for "${sceneSlug}".`,
      deployOrigin,
      publicSceneUrl,
      prettySceneUrl,
      localVersion,
      remoteVersion: null,
    }
  }
}

function createWebPublishPlugin(): Plugin {
  const rootDir = process.cwd()

  const handleRequest = async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const requestUrl = request.url ? new URL(request.url, 'http://localhost') : null
    if (!requestUrl) {
      return false
    }

    if (request.method === 'GET' && requestUrl.pathname === '/__publish/scenes') {
      const scenes = await listPublishedScenes(rootDir)
      const result = createJsonResponse(200, { scenes })
      response.statusCode = result.statusCode
      Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
      response.end(result.body)
      return true
    }

    if (request.method === 'POST' && requestUrl.pathname === '/__publish/web-package') {
      const rawSceneSlug = requestUrl.searchParams.get('sceneSlug') ?? ''
      const sceneSlug = sanitizeSceneSlug(rawSceneSlug)
      const replace = requestUrl.searchParams.get('replace') === '1'
      const scenesDir = path.join(rootDir, 'public', 'scenes')
      const targetDirectory = path.join(scenesDir, sceneSlug)
      const relativeSceneDirectory = path.posix.join('public', 'scenes', sceneSlug)
      const deploySceneUrls = buildDeploySceneUrls(sceneSlug, DEFAULT_WEB_PUBLISH_DEPLOY_ORIGIN)

      if (!sceneSlug) {
        const result = createJsonResponse(400, { message: 'A scene name is required.' })
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      }

      try {
        await runProductionBuildCheck(rootDir)

        const exists = await pathExists(targetDirectory)
        if (exists && !replace) {
          const result = createJsonResponse(409, {
            message: `Scene "${sceneSlug}" already exists. Publish again with replace enabled to overwrite it.`,
          })
          response.statusCode = result.statusCode
          Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
          response.end(result.body)
          return true
        }

        const requestBody = await readRequestBody(request)
        await fs.mkdir(scenesDir, { recursive: true })
        if (exists) {
          await fs.rm(targetDirectory, { recursive: true, force: true })
        }
        await fs.mkdir(targetDirectory, { recursive: true })
        await unzipIntoDirectory(requestBody, targetDirectory)

        await runGit(rootDir, ['add', '--', relativeSceneDirectory])
        const stagedFiles = await getStagedFiles(rootDir)
        const stagedOutsideTarget = stagedFiles.filter(
          (file: string) => !file.startsWith(`${relativeSceneDirectory}/`) && file !== relativeSceneDirectory,
        )
        if (stagedOutsideTarget.length) {
          throw new Error(
            `Publish stopped because unrelated staged files already exist: ${stagedOutsideTarget.join(', ')}.`,
          )
        }

        const hasChanges = await hasStagedChangesForPath(rootDir, relativeSceneDirectory)
        if (!hasChanges) {
          const gitCommitSha = await getCurrentGitCommitShortSha(rootDir)
          const result = createJsonResponse(200, {
            message: `Scene "${sceneSlug}" is already up to date.`,
            relativeSceneUrl: `/scenes/${sceneSlug}/scene.json`,
            pushed: false,
            gitCommitSha,
            ...deploySceneUrls,
          })
          response.statusCode = result.statusCode
          Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
          response.end(result.body)
          return true
        }

        const branch = await getCurrentGitBranch(rootDir)
        const commitMessage = `${replace ? 'Update' : 'Publish'} scene ${sceneSlug}`
        await runGit(rootDir, ['commit', '-m', commitMessage, '--', relativeSceneDirectory])
        await runGit(rootDir, ['push', 'origin', branch])
        const gitCommitSha = await getCurrentGitCommitShortSha(rootDir)

        const result = createJsonResponse(200, {
          message: `Scene "${sceneSlug}" published to GitHub.`,
          relativeSceneUrl: `/scenes/${sceneSlug}/scene.json`,
          pushed: true,
          gitCommitSha,
          ...deploySceneUrls,
        })
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to publish scene.'
        const result = createJsonResponse(500, { message })
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      }
    }

    if (request.method === 'GET' && requestUrl.pathname === '/__publish/web-package-status') {
      const rawSceneSlug = requestUrl.searchParams.get('sceneSlug') ?? ''
      const sceneSlug = sanitizeSceneSlug(rawSceneSlug)

      if (!sceneSlug) {
        const result = createJsonResponse(400, { message: 'A scene name is required.' })
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      }

      try {
        const result = createJsonResponse(
          200,
          await checkPublishedSceneDeployment(rootDir, sceneSlug, DEFAULT_WEB_PUBLISH_DEPLOY_ORIGIN),
        )
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to check Vercel publish status.'
        const result = createJsonResponse(500, { status: 'error', message })
        response.statusCode = result.statusCode
        Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value))
        response.end(result.body)
        return true
      }
    }

    return false
  }

  const attachMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      void handleRequest(request, response)
        .then((handled) => {
          if (!handled) {
            next()
          }
        })
        .catch(next)
    })
  }

  return {
    name: 'web-publish-plugin',
    configureServer(server) {
      attachMiddleware(server)
    },
    configurePreviewServer(server) {
      attachMiddleware(server)
    },
  }
}

export default defineConfig({
  plugins: [react(), createWebPublishPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (
            id.includes('@react-three/postprocessing') ||
            id.includes('node_modules/postprocessing/')
          ) {
            return 'postfx'
          }
          if (id.includes('@react-three/drei') || id.includes('three-stdlib')) {
            return 'drei'
          }
          if (
            id.includes('@react-three/fiber')
          ) {
            return 'fiber'
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/zustand/')
          ) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
