import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getHost } from './lib/host'

// Lets CSS target the desktop build, where the app header is the title bar.
document.documentElement.dataset.host = getHost().kind

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
