let lockFlightControls: (() => void) | null = null
let flightUnlockSuppressionUntil = 0
let flightUnlockFullscreenRestoreUntil = 0

export function registerFlightLock(handler: (() => void) | null) {
  lockFlightControls = handler
}

export function requestFlightLock() {
  lockFlightControls?.()
}

export function markFlightUnlockForEscape() {
  const suppressionUntil = performance.now() + 500
  flightUnlockSuppressionUntil = suppressionUntil
  flightUnlockFullscreenRestoreUntil = suppressionUntil
}

export function consumeFlightUnlockForEscape() {
  if (performance.now() > flightUnlockSuppressionUntil) {
    return false
  }

  flightUnlockSuppressionUntil = 0
  return true
}

export function consumeFlightUnlockFullscreenRestore() {
  if (performance.now() > flightUnlockFullscreenRestoreUntil) {
    return false
  }

  flightUnlockFullscreenRestoreUntil = 0
  return true
}
