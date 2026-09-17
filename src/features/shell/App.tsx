import { HashRouter } from 'react-router'

import { GameStoreProvider, type GameStore } from '../../store'
import { Layout } from './Layout'

export function App({ store }: { store: GameStore }) {
  return (
    <GameStoreProvider store={store}>
      <HashRouter>
        <Layout />
      </HashRouter>
    </GameStoreProvider>
  )
}
