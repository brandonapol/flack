import { describe, expect, it } from 'vitest'

import { HOME } from '../../../state'
import { GIT_VERSION } from '../index'
import { DOCS_URL, inRepo, session } from './harness'

describe('git, git --version, git help', () => {
  it('prints a curated usage listing only supported commands', () => {
    const s = session().run('git')
    expect(s.lastText).toMatch(/^usage: git \[-v \| --version\]/)
    expect(s.lastText).toContain('   clone      Clone a repository into a new directory')
    expect(s.lastText).toContain('   status     Show the working tree status')
    expect(s.lastText).toContain('   switch     Switch branches')
    expect(session().run('git --help').lastText).toContain('collaborate')
    expect(session().run('git help').lastText).toContain('collaborate')
  })

  it('prints a plausible version', () => {
    expect(session().run('git --version').lastText).toBe(`git version ${GIT_VERSION}`)
    expect(session().run('git version').lastText).toBe(`git version ${GIT_VERSION}`)
  })

  it('suggests the closest command for a typo', () => {
    expect(inRepo().run('git comit -m x').lastText).toContain(
      'The most similar command is\n\tcommit'
    )
  })
})

describe('git config', () => {
  it('sets and reads the identity', () => {
    const s = session().run(
      'git config --global user.name "Ada Lovelace"',
      'git config --global user.email "ada@inkwell.example"'
    )
    expect(s.state.git.config).toEqual({
      userName: 'Ada Lovelace',
      userEmail: 'ada@inkwell.example',
    })
    expect(s.lastText).toBe('')
    expect(s.run('git config user.name').lastText).toBe('Ada Lovelace')
  })

  it('prints nothing (and fails quietly) for an unset value, like Git', () => {
    const s = session().run('git config --global user.name')
    expect(s.lastText).toBe('')
    expect(s.ok).toBe(false)
  })

  it('lists config, including repo settings inside a repo', () => {
    const s = inRepo().run('git config --list')
    expect(s.lastText).toContain('user.name=Ada Lovelace')
    expect(s.lastText).toContain('remote.origin.url=https://gitnub.com/inkwell/docs-site.git')
    expect(s.lastText).toContain('branch.main.merge=refs/heads/main')
  })

  it('explains an unquoted name with more than one word', () => {
    const s = session().run('git config --global user.name Ada Lovelace')
    expect(s.lastText).toContain('error: wrong number of arguments, should be from 1 to 2')
    expect(s.lastText).toContain('git config --global user.name "Ada Lovelace"')
    expect(s.state.git.config).toEqual({})
  })

  it('flags a misspelt key without pretending it worked', () => {
    const s = session().run('git config --global user.nmae "Ada"')
    expect(s.lastText).toContain('it only reads `user.name`')
    expect(s.state.git.config).toEqual({})
  })

  it('needs --global outside a repo, and a section in the key', () => {
    expect(session().run('git config user.name "Ada"').lastText).toContain(
      'fatal: not in a git directory'
    )
    expect(session().run('git config name "Ada"').lastText).toBe(
      'error: key does not contain a section: name'
    )
  })
})

describe('git clone', () => {
  it('clones docs-site with realistic output, leaving tabs to the story', () => {
    const s = session().run(`git clone ${DOCS_URL}`)
    expect(s.state.git.local?.dir).toBe('docs-site')
    expect(s.last[0].text).toBe("Cloning into 'docs-site'...")
    expect(s.lastText).toMatch(/Receiving objects: 100% \(\d+\/\d+\), done\./)
    expect(s.effects).toEqual([])
    expect(s.ok).toBe(true)
  })

  it('accepts the address without .git or https://', () => {
    expect(
      session().run('git clone https://gitnub.com/inkwell/docs-site').state.git.local
    ).toBeDefined()
    expect(session().run('git clone gitnub.com/inkwell/docs-site/').state.git.local).toBeDefined()
  })

  it('refuses to clone twice', () => {
    const s = session().run(`git clone ${DOCS_URL}`, `git clone ${DOCS_URL}`)
    expect(s.lastText).toBe(
      "fatal: destination path 'docs-site' already exists and is not an empty directory."
    )
    expect(s.ok).toBe(false)
  })

  it('does not clone decoy repos', () => {
    const s = session().run('git clone https://gitnub.com/inkwell/website.git')
    expect(s.lastText).toBe("That's the marketing website, not the docs.")
    expect(s.state.git.local).toBeUndefined()
    expect(s.ok).toBe(false)
  })

  it('explains unknown repos, other hosts, SSH, placeholders and a missing URL', () => {
    expect(session().run('git clone https://gitnub.com/inkwell/nope.git').lastText).toContain(
      "fatal: repository 'https://gitnub.com/inkwell/nope.git/' not found"
    )
    expect(session().run('git clone https://github.com/inkwell/docs-site.git').lastText).toContain(
      'only gitnub.com addresses work'
    )
    expect(session().run('git clone git@gitnub.com:inkwell/docs-site.git').lastText).toContain(
      'Use the HTTPS address'
    )
    expect(session().run('git clone <url>').lastText).toContain('Replace <url>')
    expect(session().run('git clone').lastText).toContain(
      'fatal: You must specify a repository to clone.'
    )
  })

  it('clones from the home folder only', () => {
    const s = session()
    s.state = { ...s.state, shell: { ...s.state.shell, cwd: '/Users' } }
    expect(s.run(`git clone ${DOCS_URL}`).lastText).toContain('Run `cd ~` first')
    expect(s.state.shell.cwd).toBe('/Users')
    expect(s.state.git.local).toBeUndefined()
    void HOME
  })
})

describe('git remote and git branch', () => {
  it('git remote -v shows origin', () => {
    expect(inRepo().run('git remote -v').lastText).toBe(
      'origin\thttps://gitnub.com/inkwell/docs-site.git (fetch)\norigin\thttps://gitnub.com/inkwell/docs-site.git (push)'
    )
    expect(inRepo().run('git remote').lastText).toBe('origin')
  })

  it('git branch lists branches; -a adds remote-tracking ones', () => {
    expect(inRepo().run('git branch').lastText).toBe('* main')
    expect(inRepo().run('git branch -a').lastText).toBe(
      '* main\n  remotes/origin/HEAD -> origin/main\n  remotes/origin/main'
    )
  })

  it('needs a repo', () => {
    const s = session().run('git remote -v')
    expect(s.lastText).toContain(
      'fatal: not a git repository (or any of the parent directories): .git'
    )
    expect(s.lastText).toContain('Clone one from GitNub first')
    const cloned = session().run(`git clone ${DOCS_URL}`, 'git branch')
    expect(cloned.lastText).toContain('Try `cd docs-site` first')
  })

  it('never mentions trunk-based development', () => {
    const s = inRepo()
    for (const command of ['git', 'git branch', 'git branch new-thing', 'help']) {
      expect(s.run(command).lastText.toLowerCase()).not.toContain('trunk')
    }
  })
})
