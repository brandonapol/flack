import { useEffect } from 'react'

/**
 * While `active`, remembers what had focus before; when it stops being active (or unmounts),
 * puts focus back there, so closing a dialog doesn't drop a keyboard user at the top of the page.
 * Call it before any effect that moves focus into the dialog.
 */
export function useRestoreFocus(active = true) {
  useEffect(() => {
    if (!active) return
    const returnTo = document.activeElement
    return () => {
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus()
    }
  }, [active])
}
