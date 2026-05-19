import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { PublishedPlayerApp } from './app/PublishedPlayerApp'
import './styles.css'

const searchParams = new URL(window.location.href).searchParams
const isPublishedPlayer = searchParams.get('player') === '1'
const isTransparentPublishedPlayer = isPublishedPlayer && searchParams.get('transparent') === '1'

if (isTransparentPublishedPlayer) {
  document.documentElement.classList.add('player-transparent')
  document.body.classList.add('player-transparent')
  const appElement = document.getElementById('app')
  if (appElement) {
    appElement.style.background = 'transparent'
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    {isPublishedPlayer ? <PublishedPlayerApp /> : <App />}
  </React.StrictMode>,
)
