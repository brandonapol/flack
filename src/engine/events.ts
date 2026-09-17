export type Tab = 'flack' | 'gitnub' | 'editor'

/**
 * Things that happened, which story steps check their goals against. Goals receive the state
 * *after* the event, so most goals look at the event type and then inspect state.
 */
export type GameEvent =
  | {
      type: 'command'
      /** `git` for all git subcommands; the subcommand is `argv[1]`. */
      name: string
      argv: string[]
      /** False when the command printed an error or refused to act. */
      ok: boolean
    }
  | { type: 'fileSaved'; path: string }
  | { type: 'fileOpened'; path: string }
  | { type: 'tabOpened'; tab: Tab }
  | { type: 'channelOpened'; channel: string }
  | { type: 'repoViewed'; slug: string }
  | { type: 'cloneUrlCopied'; slug: string }
  | { type: 'flackReply'; messageId: string; replyId: string }
  | { type: 'flackMessage'; messageId: string; channel: string; from: string }
  | { type: 'mentorQuestionAsked'; questionId: string }
  | { type: 'remoteUpdated'; slug: string; branch: string; author: string }
  /** Fired when a step becomes current, so goals already satisfied by state complete at once. */
  | { type: 'stepEntered'; stepId: string }
