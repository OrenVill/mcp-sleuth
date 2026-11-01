import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getHost } from './lib/host'
import { windowControls } from './lib/windowControls'

// Lets CSS target the desktop build, where the app header is the title bar.
document.documentElement.dataset.host = getHost().kind

const electronPlatform = (
  window as unknown as { mcpDetective?: { platform?: string } }
).mcpDetective?.platform
if (electronPlatform) {
  document.documentElement.dataset.platform = electronPlatform
}

// The desktop window paints its own rounded shell, which has to square off when
// maximised — otherwise the corners clip the display. Linux uses custom IPC
// controls; Windows uses native snap/maximize but the same CSS hook.
if (getHost().kind === 'electron') {
  const setMaximized = (maximized: boolean) => {
    document.documentElement.dataset.maximized = String(maximized)
  }
  void windowControls.isMaximized().then((value) => setMaximized(Boolean(value)))
  windowControls.onMaximizedChanged(setMaximized)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// A rejected promise with no handler used to vanish silently; an MCP call that
// fails outside a try/catch left the UI stuck with no clue why.
window.addEventListener('unhandledrejection', (event) => {
  console.error('detective: unhandled rejection', event.reason)
})

window.addEventListener('error', (event) => {
  console.error('detective: uncaught error', event.error ?? event.message)
})
