import type { GameState } from '../game'

export function templateVars(state: GameState): Record<string, string> {
  const name = state.player.name?.trim() || 'you'
  const firstName = name.split(/\s+/)[0]
  const slug =
    firstName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my'
  return {
    'player.name': name,
    'player.firstName': firstName,
    /** Safe for branch names: `ada-team-list`. */
    'player.slug': slug,
    'player.email': state.git.config.userEmail ?? `${slug}@inkwell.example`,
  }
}

/** Fills `{{player.name}}`-style placeholders. Unknown placeholders are left as they are. */
export function interpolate(template: string, state: GameState): string {
  const vars = templateVars(state)
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match)
}
