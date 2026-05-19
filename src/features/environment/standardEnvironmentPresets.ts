export type StandardEnvironmentPreset = {
  id: string
  label: string
  url: string
  kind: 'hdri' | 'panorama'
}

export const STANDARD_ENVIRONMENT_PRESETS: StandardEnvironmentPreset[] = [
  {
    id: 'standard-environment:studio',
    label: 'Studio',
    url: '/textures/Studio.exr',
    kind: 'hdri',
  },
  {
    id: 'standard-environment:city-night-lights',
    label: 'City Night Lights',
    url: '/textures/City_Night_Lights.hdr',
    kind: 'hdri',
  },
]

export const DEFAULT_STANDARD_ENVIRONMENT_PRESET = STANDARD_ENVIRONMENT_PRESETS[0]

export function getStandardEnvironmentPresetById(id: string) {
  return STANDARD_ENVIRONMENT_PRESETS.find((preset) => preset.id === id) ?? null
}

export function getStandardEnvironmentPresetByUrl(url: string | null | undefined) {
  if (!url) {
    return null
  }

  return STANDARD_ENVIRONMENT_PRESETS.find((preset) => preset.url === url) ?? null
}
