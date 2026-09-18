import { describe, expect, it } from 'vitest'

import { HOME } from '../../../state'
import { DOCS_URL, inRepo, session } from './harness'

describe('help', () => {
  it('groups commands, dims git commands that need a repo, and links a beginner reference', () => {
    const s = session().run('help')
    expect(s.lastText).toContain('Moving around')
    expect(s.lastText).toContain('Looking at files')
    expect(s.lastText).toContain('Git')
    expect(s.lastText).toContain('developer.mozilla.org')
    expect(s.last.find((l) => l.text.includes('git status'))?.tone).toBe('muted')
    expect(s.last.find((l) => l.text.includes('git clone'))?.tone).toBeUndefined()
    s.run(`git clone ${DOCS_URL}`, 'help')
    expect(s.last.find((l) => l.text.includes('git status'))?.tone).toBeUndefined()
  })
})

describe('hint', () => {
  it('prints the current hint and asks the game to show it', () => {
    const s = session().run('hint')
    expect(s.lastText).toBe('💡 Hint: Copy the address from GitNub.')
    expect(s.effects).toEqual([{ type: 'showHint' }])
  })

  it('says so when there are no hints', () => {
    expect(inRepo().run('hint').lastText).toContain('No hints for this step')
  })
})

describe('clear, history, pwd', () => {
  it('clear empties the screen', () => {
    expect(session().run('pwd', 'clear').state.shell.output).toEqual([])
  })

  it('history numbers previous commands', () => {
    expect(session().run('pwd', 'ls', 'history').lastText).toBe(
      '    1  pwd\n    2  ls\n    3  history'
    )
  })

  it('pwd prints the full path', () => {
    expect(session().run('pwd').lastText).toBe(HOME)
    expect(inRepo().run('cd docs', 'pwd').lastText).toBe(`${HOME}/docs-site/docs`)
  })
})

describe('ls', () => {
  it('lists folders and files, hiding dotfiles unless -a', () => {
    expect(session().run('ls').lastText).toBe('')
    const s = inRepo()
    expect(s.run('ls').lastText).toBe('README.md  docs  team.md')
    expect(s.last[0].spans?.find((span) => span.text === 'docs')?.tone).toBe('meta')
    expect(s.run('ls -a').lastText).toBe('.  ..  .git  README.md  docs  team.md')
    expect(s.run('ls docs').lastText).toBe('welcome.md')
    expect(s.run('ls team.md').lastText).toBe('team.md')
  })

  it('-la shows a long listing', () => {
    const text = inRepo().run('ls -la').lastText
    expect(text).toMatch(/^total \d+/)
    expect(text).toMatch(/drwxr-xr-x .* \.git$/m)
    expect(text).toMatch(/-rw-r--r-- .* team\.md$/m)
  })

  it('reports missing paths and bad options', () => {
    const s = inRepo().run('ls nope')
    expect(s.lastText).toBe("ls: cannot access 'nope': No such file or directory")
    expect(s.ok).toBe(false)
    expect(s.run('ls -z').lastText).toContain('ls: invalid option -- z')
  })
})

describe('cd', () => {
  it('moves around and changes the prompt', () => {
    const s = session().run(`git clone ${DOCS_URL}`, 'cd docs-site/docs')
    expect(s.state.shell.cwd).toBe(`${HOME}/docs-site/docs`)
    s.run('cd ../..')
    expect(s.state.shell.cwd).toBe(HOME)
    s.run('cd docs-site', 'cd')
    expect(s.state.shell.cwd).toBe(HOME)
    s.run('cd docs-site', 'cd ~')
    expect(s.state.shell.cwd).toBe(HOME)
  })

  it('explains missing folders and files', () => {
    const s = session().run('cd docs-site')
    expect(s.lastText).toBe('bash: cd: docs-site: No such file or directory')
    expect(s.ok).toBe(false)
    expect(inRepo().run('cd team.md').lastText).toBe('bash: cd: team.md: Not a directory')
  })
})

describe('cat', () => {
  it('prints a working file', () => {
    expect(inRepo().run('cat team.md').lastText).toBe(
      '# Docs team\n\nAdd your name to the bottom of the list to say hi!\n\n- Jordan Lee\n- Robin Okafor'
    )
  })

  it('shows unsaved-but-saved edits exactly as the editor saved them', () => {
    const s = inRepo()
    s.state = {
      ...s.state,
      git: {
        ...s.state.git,
        local: {
          ...s.state.git.local!,
          working: { ...s.state.git.local!.working, 'team.md': 'hi\n' },
        },
      },
    }
    expect(s.run('cat team.md').lastText).toBe('hi')
  })

  it('explains directories, missing files and a missing argument', () => {
    const s = inRepo()
    expect(s.run('cat docs').lastText).toBe('cat: docs: Is a directory')
    expect(s.run('cat nope.md').lastText).toBe('cat: nope.md: No such file or directory')
    expect(s.run('cat').lastText).toContain('cat needs a file name')
    expect(s.ok).toBe(false)
  })
})

describe('open and code', () => {
  it('open a file in the editor', () => {
    const s = inRepo().run('open team.md')
    expect(s.effects).toEqual([{ type: 'openFile', path: 'team.md' }])
    expect(s.run('cd docs', 'code welcome.md').effects).toEqual([
      { type: 'openFile', path: 'docs/welcome.md' },
    ])
    expect(s.run('code .').effects).toEqual([{ type: 'openTab', tab: 'editor' }])
  })

  it('refuse missing files and files outside the repo', () => {
    const s = inRepo().run('open nope.md')
    expect(s.lastText).toBe('The file ~/docs-site/nope.md does not exist.')
    expect(s.effects).toEqual([])
    expect(s.run('open .git/HEAD').lastText).toContain('only open files inside the repo')
  })

  it('explain when the editor is still locked', () => {
    const s = inRepo()
    s.state = { ...s.state, ui: { unlockedTabs: ['flack'] } } as typeof s.state
    expect(s.run('open team.md').lastText).toContain('isn’t unlocked yet')
    expect(s.effects).toEqual([])
  })
})

describe('fallbacks', () => {
  it('npm, pip and friends get an honest answer, not a nonsense suggestion', () => {
    for (const tool of ['npm install', 'pip install requests', 'python3 build.py']) {
      const s = session().run(tool)
      expect(s.lastText).toContain('command not found')
      expect(s.lastText).toContain('nothing to install')
      expect(s.lastText).not.toContain('Did you mean')
    }
  })

  it('terminal editors point at the Editor tab', () => {
    const s = inRepo().run('vim team.md')
    expect(s.lastText).toContain('you edit files in the Editor tab instead of `vim`')
    expect(s.effects).toEqual([{ type: 'openFile', path: 'team.md' }])
    expect(s.run('nano').effects).toEqual([{ type: 'openTab', tab: 'editor' }])
  })

  it('file-changing commands do nothing', () => {
    const s = inRepo()
    const before = s.state.git.local
    for (const command of ['rm team.md', 'sudo rm -rf /', 'mv a b', 'mkdir x', 'touch x']) {
      s.run(command)
      expect(s.lastText).toMatch(/isn’t needed in this tutorial, so nothing was changed/)
      expect(s.ok).toBe(false)
    }
    expect(s.state.git.local).toBe(before)
  })

  it('unknown commands and typos get friendly replies', () => {
    expect(session().run('foo').lastText).toBe(
      'bash: foo: command not found\nTry `help`, or ask Robin in Flack.'
    )
    expect(session().run('gti status').lastText).toContain('Did you mean `git`?')
    expect(session().run('sl').lastText).toContain('Did you mean')
  })
})
