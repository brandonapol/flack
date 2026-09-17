import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useGame } from '../../store'
import { pathForTab, tabForPath } from './tabs'

/**
 * Keeps the URL and `ui.activeTab` in step. The URL wins when the learner navigates (tab click,
 * back button, deep link); the game wins when the story switches tabs (e.g. `open team.md`).
 * A locked tab in the URL is replaced by the active tab.
 */
export function useTabRouteSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = useGame((s) => s.game.ui.activeTab)
  const unlockedTabs = useGame((s) => s.game.ui.unlockedTabs)
  const dispatch = useGame((s) => s.dispatch)
  const lastActiveTab = useRef(activeTab)

  // The story moved to another tab: follow it.
  useEffect(() => {
    if (lastActiveTab.current === activeTab) return
    lastActiveTab.current = activeTab
    if (tabForPath(location.pathname) !== activeTab) navigate(pathForTab(activeTab))
  }, [activeTab, location.pathname, navigate])

  // The URL changed: open that tab if we can, otherwise put the URL back.
  useEffect(() => {
    const routeTab = tabForPath(location.pathname)
    if (!routeTab) {
      navigate(pathForTab(lastActiveTab.current), { replace: true })
    } else if (!unlockedTabs.includes(routeTab)) {
      navigate(pathForTab(lastActiveTab.current), { replace: true })
    } else if (routeTab !== lastActiveTab.current) {
      lastActiveTab.current = routeTab
      dispatch({ type: 'openTab', tab: routeTab })
    }
  }, [location.pathname, unlockedTabs, dispatch, navigate])
}
