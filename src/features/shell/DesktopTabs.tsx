import { lazy, Suspense, useRef, type KeyboardEvent } from 'react'
import { Route, Routes, useNavigate } from 'react-router'

import type { Tab } from '../../engine/events'
import { useGame } from '../../store'
import styles from './DesktopTabs.module.css'
import { TABS } from './tabs'

// CodeMirror is most of the bundle, and nobody needs it before they've cloned something.
const Editor = lazy(() => import('../editor/Editor'))
import { useTabRouteSync } from './useTabRouteSync'

function useUnreadCount(): number {
  return useGame((s) => {
    const { messages, readUpTo } = s.game.flack
    const perChannel = new Map<string, number>()
    for (const message of messages) {
      perChannel.set(message.channel, (perChannel.get(message.channel) ?? 0) + 1)
    }
    let unread = 0
    perChannel.forEach((count, channel) => {
      unread += Math.max(0, count - (readUpTo[channel] ?? 0))
    })
    return unread
  })
}

function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.placeholder}>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function DesktopTabs() {
  useTabRouteSync()
  const navigate = useNavigate()
  const activeTab = useGame((s) => s.game.ui.activeTab)
  const unlockedTabs = useGame((s) => s.game.ui.unlockedTabs)
  const unread = useUnreadCount()
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  const open = (tab: Tab) => {
    if (!unlockedTabs.includes(tab)) return
    navigate(TABS.find((info) => info.id === tab)!.path)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const available = TABS.filter((tab) => unlockedTabs.includes(tab.id))
    const index = available.findIndex((tab) => tab.id === activeTab)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % available.length
    if (event.key === 'ArrowLeft') next = (index - 1 + available.length) % available.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = available.length - 1
    const target = available[next]
    open(target.id)
    tabRefs.current[target.id]?.focus()
  }

  return (
    <div className={styles.desktop}>
      <div role="tablist" aria-label="Apps" className={styles.tablist} onKeyDown={onKeyDown}>
        {TABS.map((tab) => {
          const locked = !unlockedTabs.includes(tab.id)
          const selected = tab.id === activeTab
          const badge = tab.id === 'flack' && unread > 0 ? unread : undefined
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls="desktop-panel"
              aria-selected={selected}
              aria-disabled={locked || undefined}
              tabIndex={selected ? 0 : -1}
              title={locked ? "You'll unlock this soon" : undefined}
              className={styles.tab}
              data-tab={tab.id}
              onClick={() => open(tab.id)}
            >
              {locked && (
                <span aria-hidden="true" className={styles.lock}>
                  🔒
                </span>
              )}
              {tab.label}
              {locked && <span className={styles.srOnly}>, locked: you'll unlock this soon</span>}
              {badge !== undefined && (
                <>
                  <span className={styles.badge} aria-hidden="true">
                    {badge}
                  </span>
                  <span className={styles.srOnly}>, {badge} unread</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id="desktop-panel"
        aria-labelledby={`tab-${activeTab}`}
        className={styles.panel}
        data-skin={activeTab}
      >
        <Routes>
          <Route path="/flack/:channel?" element={<Placeholder title="Flack" />} />
          <Route path="/gitnub/*" element={<Placeholder title="GitNub" />} />
          <Route
            path="/editor/*"
            element={
              <Suspense fallback={<Placeholder title="Opening the editor…" />}>
                <Editor />
              </Suspense>
            }
          />
          <Route path="*" element={null} />
        </Routes>
      </div>
    </div>
  )
}
