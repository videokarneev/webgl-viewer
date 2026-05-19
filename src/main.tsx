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
  document.documentElement.style.backgroundColor = resolvedEmbedBackground
  document.body.style.backgroundColor = resolvedEmbedBackground
  document.documentElement.style.backgroundImage = 'none'
  document.body.style.backgroundImage = 'none'
  document.documentElement.style.colorScheme = 'normal'
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.style.background = resolvedEmbedBackground
    appElement.style.backgroundColor = resolvedEmbedBackground
    appElement.style.backgroundImage = 'none'
  }

  const transparentStyle = document.createElement('style')
  transparentStyle.id = 'published-player-transparent-reset'
  transparentStyle.textContent = `
    :root.player-transparent,
    html.player-transparent,
    html.player-transparent body,
    body.player-transparent,
    html.player-transparent #app,
    html.player-transparent main {
      background: ${resolvedEmbedBackground} !important;
      background-color: ${resolvedEmbedBackground} !important;
      background-image: none !important;
    }
  `
  document.head.appendChild(transparentStyle)
}

if (!isTransparentPublishedPlayer) {
  const staleTransparentStyle = document.getElementById('published-player-transparent-reset')
  if (staleTransparentStyle) {
    staleTransparentStyle.remove()
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    {isPublishedPlayer ? <PublishedPlayerApp /> : <App />}
  </React.StrictMode>,
)
