import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initOffline } from './lib/offline'

initOffline()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// In the iPad / iPhone app, fade out the launch screen once the app has drawn its first screen.
requestAnimationFrame(() => { try { window.Capacitor?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 300 }) } catch { /* not in the app */ } })
