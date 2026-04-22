import type { SceneConfig } from '../../store/editorStore'

export async function readSceneConfigFile(file: File): Promise<SceneConfig> {
  const text = await file.text()
  return JSON.parse(text) as SceneConfig
}

