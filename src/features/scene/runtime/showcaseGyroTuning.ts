export interface ShowcaseGyroTuning {
  side: number
  tiltX: number
  tiltY: number
  travel: number
  smooth: number
}

export const DEFAULT_SHOWCASE_GYRO_TUNING: ShowcaseGyroTuning = {
  side: 1,
  tiltX: 1,
  tiltY: 1,
  travel: 1,
  smooth: 1,
}

const STORAGE_KEY = 'webgl-viewer:showcase-gyro-tuning'
const TUNING_EVENT = 'webgl-viewer:showcase-gyro-tuning-change'

let currentTuning: ShowcaseGyroTuning | null = null

function clampTuningValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 2.5) : fallback
}

function normalizeTuning(value: Partial<ShowcaseGyroTuning> | null | undefined): ShowcaseGyroTuning {
  return {
    side: clampTuningValue(value?.side, DEFAULT_SHOWCASE_GYRO_TUNING.side),
    tiltX: clampTuningValue(value?.tiltX, DEFAULT_SHOWCASE_GYRO_TUNING.tiltX),
    tiltY: clampTuningValue(value?.tiltY, DEFAULT_SHOWCASE_GYRO_TUNING.tiltY),
    travel: clampTuningValue(value?.travel, DEFAULT_SHOWCASE_GYRO_TUNING.travel),
    smooth: clampTuningValue(value?.smooth, DEFAULT_SHOWCASE_GYRO_TUNING.smooth),
  }
}

function readStoredTuning() {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOWCASE_GYRO_TUNING
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return normalizeTuning(stored ? JSON.parse(stored) : null)
  } catch {
    return DEFAULT_SHOWCASE_GYRO_TUNING
  }
}

function writeStoredTuning(tuning: ShowcaseGyroTuning) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning))
  } catch {
    // Storage can be unavailable in embedded/private contexts; runtime tuning still works in memory.
  }
}

function notifyTuningChanged(tuning: ShowcaseGyroTuning) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<ShowcaseGyroTuning>(TUNING_EVENT, { detail: tuning }))
}

export function getShowcaseGyroTuning() {
  if (!currentTuning) {
    currentTuning = readStoredTuning()
  }

  return currentTuning
}

export function setShowcaseGyroTuning(patch: Partial<ShowcaseGyroTuning>) {
  const nextTuning = normalizeTuning({
    ...getShowcaseGyroTuning(),
    ...patch,
  })
  currentTuning = nextTuning
  writeStoredTuning(nextTuning)
  notifyTuningChanged(nextTuning)
  return nextTuning
}

export function resetShowcaseGyroTuning() {
  currentTuning = DEFAULT_SHOWCASE_GYRO_TUNING
  writeStoredTuning(currentTuning)
  notifyTuningChanged(currentTuning)
  return currentTuning
}

export function subscribeToShowcaseGyroTuning(listener: (tuning: ShowcaseGyroTuning) => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<ShowcaseGyroTuning>).detail
    listener(normalizeTuning(detail))
  }
  window.addEventListener(TUNING_EVENT, handleChange)
  return () => window.removeEventListener(TUNING_EVENT, handleChange)
}

export function shouldShowShowcaseGyroTuningPanel() {
  if (typeof window === 'undefined') {
    return false
  }

  const params = new URL(window.location.href).searchParams
  return params.get('gyroTune') === '1' || params.get('gyroTune') === 'true'
}
