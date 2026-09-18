import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createGameConfig } from './content'
import { App } from './features/shell/App'
import { createGameStore } from './store'
import './index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing #root element')
}

const store = createGameStore({ config: createGameConfig(), search: window.location.search })
// Saves are debounced; don't lose the last few moments to a reload or a closed tab.
window.addEventListener('pagehide', () => store.getState().flushSave())

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>
)
