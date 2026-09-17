import type { Tab } from '../../engine/events'

export interface TabInfo {
  id: Tab
  label: string
  /** Route the tab opens at when clicked. */
  path: string
}

export const TABS: TabInfo[] = [
  { id: 'flack', label: 'Flack', path: '/flack' },
  { id: 'gitnub', label: 'GitNub', path: '/gitnub' },
  { id: 'editor', label: 'Editor', path: '/editor' },
]

export function tabForPath(pathname: string): Tab | undefined {
  const first = pathname.split('/').filter(Boolean)[0]
  return TABS.find((tab) => tab.id === first)?.id
}

export function pathForTab(tab: Tab): string {
  return TABS.find((info) => info.id === tab)!.path
}
