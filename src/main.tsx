import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installChunkReloadHandler } from './lib/reloadOnChunkError'

// Veralteter Tab nach einem Deploy → einmal automatisch neu laden.
installChunkReloadHandler()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the service worker only in production builds so dev/demo never
// serves stale content. Enables install-to-home-screen for events.
// The app is served from a sub-path on GitHub Pages (/partner-csm/), so the
// worker URL must follow BASE_URL — an absolute '/sw.js' 404s there and the
// registration silently never happens.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
