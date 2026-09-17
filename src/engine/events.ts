/**
 * Things that happened, which story steps check their goals against. The shell and git commands
 * emit `command` events; the story engine (#6) adds events for clicks, saves and chat replies.
 */
export type GameEvent = {
  type: 'command'
  /** `git` for all git subcommands; the subcommand is `argv[1]`. */
  name: string
  argv: string[]
  /** False when the command printed an error or refused to act. */
  ok: boolean
}
