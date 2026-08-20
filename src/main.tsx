import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getHost } from './lib/host'
import { hasCustomWindowControls, windowControls } from './lib/windowControls'

// Lets CSS target the desktop build, where the app header is the title bar.
document.documentElement.dataset.host = getHost().kind

// The desktop window paints its own rounded shell, which has to square off when
// maximised — otherwise the corners clip the display.
if (hasCustomWindowControls()) {
  const setMaximized = (maximized: boolean) => {
    document.documentElement.dataset.maximized = String(maximized)
  }
  void windowControls.isMaximized().then((value) => setMaximized(Boolean(value)))
  windowControls.onMaximizedChanged(setMaximized)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
