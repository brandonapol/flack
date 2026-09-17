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

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>
)
