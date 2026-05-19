import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { PublishedPlayerApp } from './app/PublishedPlayerApp'
import './styles.css'

const searchParams = new URL(window.location.href).searchParams
const isPublishedPlayer = searchParams.get('player') === '1'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    {isPublishedPlayer ? <PublishedPlayerApp /> : <App />}
  </React.StrictMode>,
)
