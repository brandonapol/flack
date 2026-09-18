import { HashRouter, Route, Routes } from 'react-router'

import { GameStoreProvider, type GameStore } from '../../store'
import { CheatSheet } from '../instructions'
import { Layout } from './Layout'

export function App({ store }: { store: GameStore }) {
  return (
    <GameStoreProvider store={store}>
      <HashRouter>
        <Routes>
          {/* The cheat sheet is its own page: printable, and nothing else in the way. */}
          <Route path="/cheat-sheet" element={<CheatSheet />} />
          <Route path="*" element={<Layout />} />
        </Routes>
      </HashRouter>
    </GameStoreProvider>
  )
}
