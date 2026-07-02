import { type InterfaceElementActionState } from '../../../store/editorStore'

export function getInterfaceElementRuntimeAction(entry: {
  action?: InterfaceElementActionState
  url?: string
  openInNewTab?: boolean
}): InterfaceElementActionState {
  if (entry.action) {
    return entry.action
  }

  return {
    type: entry.url ? 'openUrl' : 'none',
    url: entry.url ?? '',
    target: entry.openInNewTab === false ? 'sameFrame' : 'newTab',
  }
}

export function runInterfaceElementAction(action: InterfaceElementActionState) {
  if (action.type !== 'openUrl' || !action.url) {
    return
  }

  if (action.target === 'newTab') {
    window.open(action.url, '_blank', 'noopener,noreferrer')
    return
  }

  window.location.href = action.url
}
