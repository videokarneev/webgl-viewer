import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { PublishedPlayerApp } from './app/PublishedPlayerApp'
import './styles.css'

const searchParams = new URL(window.location.href).searchParams
const isPublishedPlayer = searchParams.get('player') === '1'
const isTransparentPublishedPlayer = isPublishedPlayer && searchParams.get('transparent') === '1'
const embedBackgroundParam = searchParams.get('bg')
const embedBackground = embedBackgroundParam
  ? embedBackgroundParam.startsWith('#')
    ? embedBackgroundParam
    : `#${embedBackgroundParam}`
  : 'transparent'
const resolvedEmbedBackground = /^#[0-9a-f]{6}$/i.test(embedBackground) ? embedBackground : 'transparent'

if (isTransparentPublishedPlayer) {
  document.documentElement.classList.add('player-transparent')
  document.body.classList.add('player-transparent')
  document.documentElement.style.background = resolvedEmbedBackground
  document.body.style.background = resolvedEmbedBackground
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.style.background = resolvedEmbedBackground
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    {isPublishedPlayer ? <PublishedPlayerApp /> : <App />}
  </React.StrictMode>,
)
