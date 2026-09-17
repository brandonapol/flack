const UNITS: Array<[number, string]> = [
  [60 * 60 * 24 * 365, 'year'],
  [60 * 60 * 24 * 30, 'month'],
  [60 * 60 * 24 * 7, 'week'],
  [60 * 60 * 24, 'day'],
  [60 * 60, 'hour'],
  [60, 'minute'],
]

/** "3 days ago", "yesterday", "just now", measured against the game's fake clock. */
export function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, now - timestamp)
  if (seconds < 60) return 'just now'
  for (const [size, unit] of UNITS) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size)
      if (unit === 'day' && count === 1) return 'yesterday'
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`
    }
  }
  return 'just now'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sep 14, 2026" */
export function shortDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

/** "9:05 AM" */
export function clockTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}
