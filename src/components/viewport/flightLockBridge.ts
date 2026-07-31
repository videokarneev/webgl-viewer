const FLIGHT_LOCK_REQUEST_EVENT = 'webgl-viewer:flight-lock-request'
const FLIGHT_EXIT_REQUEST_EVENT = 'webgl-viewer:flight-exit-request'
let flightUnlockSuppressionUntil = 0
let flightUnlockFullscreenRestoreUntil = 0

export function subscribeFlightLock(handler: () => void) {
  window.addEventListener(FLIGHT_LOCK_REQUEST_EVENT, handler)
  return () => {
    window.removeEventListener(FLIGHT_LOCK_REQUEST_EVENT, handler)
  }
}

export function requestFlightLock() {
  window.dispatchEvent(new Event(FLIGHT_LOCK_REQUEST_EVENT))
}

export function subscribeFlightExit(handler: () => void) {
  window.addEventListener(FLIGHT_EXIT_REQUEST_EVENT, handler)
  return () => {
    window.removeEventListener(FLIGHT_EXIT_REQUEST_EVENT, handler)
  }
}

export function requestFlightExit() {
  window.dispatchEvent(new Event(FLIGHT_EXIT_REQUEST_EVENT))
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
