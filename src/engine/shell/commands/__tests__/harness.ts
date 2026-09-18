import { docsSite, T0 } from '../../../git/__fixtures__/docsSite'
import { createRemote } from '../../../git/repo'
import { plainText, type TerminalLine } from '../../../lines'
import { HOME, type CoreState } from '../../../state'
import { ECHO_LINES } from '../../prompt'
import { runLine } from '../../run'
import { buildRegistry } from '../index'

export const registry = buildRegistry<CoreState>({
  docs: {
    commandLine: {
      label: 'Command line crash course (MDN)',
      href: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Environment_setup/Command_line',
    },
  },
  hintFor: (state) => (state.git.local ? undefined : 'Copy the address from GitNub.'),
})

export const DOCS_URL = 'https://gitnub.com/inkwell/docs-site.git'

export function newState(): CoreState {
  const remotes = {
    'inkwell/docs-site': docsSite(),
    'inkwell/website': createRemote({
      slug: 'inkwell/website',
      cloneNote: "That's the marketing website, not the docs.",
      history: [
        {
          message: 'Launch',
          author: { name: 'Alex Chen', email: 'alex@inkwell.example' },
          timestamp: T0,
          tree: { 'index.html': '<h1>Hi</h1>\n' },
        },
      ],
    }),
  }
  return {
    clock: T0 + 3600,
    player: {},
    git: { config: {}, remotes },
    shell: { cwd: HOME, history: [], output: [] },
  }
}

export interface Session {
  state: CoreState
  /** Output of the last command, without the echoed prompt. */
  last: TerminalLine[]
  lastText: string
  ok: boolean
  effects: ReturnType<typeof runLine>['effects']
  events: ReturnType<typeof runLine>['events']
  run: (...lines: string[]) => Session
}

export function session(state: CoreState = newState()): Session {
  const self: Session = {
    state,
    last: [],
    lastText: '',
    ok: true,
    effects: [],
    events: [],
    run: (...lines) => {
      for (const input of lines) {
        const result = runLine(registry, self.state, input)
        self.state = result.state
        self.last = result.output.slice(ECHO_LINES)
        self.lastText = plainText(self.last)
        self.ok = result.events[0]?.type === 'command' ? result.events[0].ok : true
        self.effects = result.effects
        self.events = result.events
      }
      return self
    },
  }
  return self
}

/** A session that has cloned docs-site, set an identity and moved into the repo. */
export function inRepo(): Session {
  return session().run(
    `git clone ${DOCS_URL}`,
    'cd docs-site',
    'git config --global user.name "Ada Lovelace"',
    'git config --global user.email ada@inkwell.example'
  )
}
