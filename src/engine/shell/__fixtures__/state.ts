import { docsSite, T0 } from '../../git/__fixtures__/docsSite'
import { clone } from '../../git/repo'
import { HOME, type CoreState } from '../../state'

export function freshState(): CoreState {
  const remote = docsSite()
  return {
    clock: T0,
    player: {},
    git: { config: {}, remotes: { [remote.slug]: remote } },
    shell: { cwd: HOME, history: [], output: [] },
  }
}

export function clonedState(cwd = HOME): CoreState {
  const state = freshState()
  return {
    ...state,
    git: { ...state.git, local: clone(state.git.remotes['inkwell/docs-site']) },
    shell: { ...state.shell, cwd },
  }
}
