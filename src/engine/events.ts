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
  | { type: 'branchCreated'; branch: string }
  | { type: 'branchSwitched'; branch: string }
  /** A push that updated (or created) a branch on GitNub. */
  | { type: 'branchPushed'; branch: string; created: boolean }
  | { type: 'pullRequestOpened'; number: number; branch: string }
  | { type: 'pullRequestReviewed'; number: number; approved: boolean }
  | { type: 'pullRequestMerged'; number: number; branch: string }
  | { type: 'branchUpdated'; number: number; branch: string }
  | { type: 'conflictsResolved'; number: number; branch: string }
  | { type: 'commitLabCompleted'; scenario: string; mode: 'guided' | 'free'; chapterId: string }
  | { type: 'remoteBranchDeleted'; branch: string }
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
