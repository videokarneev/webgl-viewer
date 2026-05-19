import type { SceneGraphNode } from '../../store/editorStore'

export function getPublishNodeId(
  nodeId: string,
  sceneGraph: Record<string, SceneGraphNode>,
  cache: Map<string, string>,
): string {
  const cached = cache.get(nodeId)
  if (cached) {
    return cached
  }

  const node = sceneGraph[nodeId]
  if (!node) {
    cache.set(nodeId, nodeId)
    return nodeId
  }

  if (!node.parentId) {
    const rootId = `root:${node.id}`
    cache.set(nodeId, rootId)
    return rootId
  }

  const parent = sceneGraph[node.parentId]
  const parentId = getPublishNodeId(node.parentId, sceneGraph, cache)
  const siblingIndex = parent?.children.indexOf(nodeId) ?? 0
  const kind = node.type === 'material' ? 'material' : 'node'
  const publishId = `${parentId}/${kind}:${siblingIndex}`
  cache.set(nodeId, publishId)
  return publishId
}

export function buildPublishIdMap(sceneGraph: Record<string, SceneGraphNode>) {
  const cache = new Map<string, string>()
  Object.keys(sceneGraph).forEach((nodeId) => {
    getPublishNodeId(nodeId, sceneGraph, cache)
  })
  return cache
}
