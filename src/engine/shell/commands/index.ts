import type { DocsLink } from '../../story/types'
import type { CoreState } from '../../state'
import { createRegistry, type Registry } from '../registry'
import { registerGitBranchCommands } from './gitBranch'
import { registerGitLocalCommands } from './gitLocal'
import { registerGitSetupCommands } from './gitSetup'
import { registerGitSyncCommands } from './gitSync'
import { registerShellCommands } from './shell'

export interface CommandOptions<S extends CoreState> {
  /** Links printed by `help`. */
  docs: { commandLine: DocsLink }
  /** The hint `hint` should print for the current step, if any. */
  hintFor?: (state: S) => string | undefined
}

/** Every command the terminal understands. */
export function buildRegistry<S extends CoreState>(options: CommandOptions<S>): Registry<S> {
  const registry = createRegistry<S>()
  registerShellCommands(registry, options)
  registerGitSetupCommands(registry)
  registerGitLocalCommands(registry)
  registerGitBranchCommands(registry)
  registerGitSyncCommands(registry)
  return registry
}

export { GIT_VERSION } from './gitSetup'
