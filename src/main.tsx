import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getHost } from './lib/host'

// Lets CSS target the desktop build — the app header doubles as the title bar there.
document.documentElement.dataset.host = getHost().kind

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
