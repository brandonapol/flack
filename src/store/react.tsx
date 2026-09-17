import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'

import type { GameStore, GameStoreState } from './gameStore'

const GameStoreContext = createContext<GameStore | null>(null)

export function GameStoreProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>
}

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext)
  if (!store) throw new Error('useGameStore must be used inside <GameStoreProvider>')
  return store
}

/** Subscribe to part of the store. Keep selectors narrow so panels only re-render when needed. */
export function useGame<T>(selector: (state: GameStoreState) => T): T {
  return useStore(useGameStore(), selector)
}

export function useDispatch(): GameStoreState['dispatch'] {
  return useGame((state) => state.dispatch)
}
