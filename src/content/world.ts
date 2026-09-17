import { createRemote, type HistoryEntry } from '../engine/git/repo'
import type { FileTree, RemoteRepo } from '../engine/git/types'
import { characters } from './characters'

/** Monday 14 September 2026, 09:00 UTC: the learner's first day. */
export const WORLD_START = Date.UTC(2026, 8, 14, 9, 0, 0) / 1000

const DAY = 86400

export const DOCS_SITE = 'inkwell/docs-site'
export const WEBSITE = 'inkwell/website'
export const OLD_WIKI = 'inkwell/old-wiki'

export const DOCS_SITE_URL = `https://gitnub.com/${DOCS_SITE}.git`

const person = (id: keyof typeof characters) => ({
  name: characters[id].name,
  email: characters[id].email,
})

// ---------------------------------------------------------------- docs-site files

export const README_V1 = `# Inkwell Docs

The source for docs.inkwell.example: everything our customers read about Inkwell.

Every page is a Markdown file in the \`docs/\` folder.
`

export const README = `# Inkwell Docs

The source for docs.inkwell.example: everything our customers read about Inkwell.

## How this repo works

- Every page is a Markdown file in the \`docs/\` folder.
- Make a branch for your change, commit it, and push the branch to GitNub.
- Open a pull request. Someone on the docs team reviews it.
- When it's approved, click **Squash and merge**. Your change is live on \`main\`.

New here? Add your name to \`team.md\`, then say hi in #docs-team on Flack.
`

export const TEAM_MD = `# Docs team

Add your name to the bottom of the list to say hi!

- Jordan Lee
- Robin Okafor
`

/** "documentaion" is the typo Alex fixes in Chapter 5. */
export const WELCOME_TYPO = 'documentaion'

export const WELCOME_MD = `# Welcome to Inkwell

Inkwell helps teams write, review and publish ${WELCOME_TYPO} together.

## Where to start

- New to Inkwell? Read the quick tour.
- Setting up a team? See the admin guide.
`

/** "recieve" is the typo the learner fixes in Chapter 6. */
export const STYLE_GUIDE_TYPO = 'recieve'

/** Alex and the learner both reword this sentence in the Chapter 8 bonus round. */
export const STYLE_GUIDE_VOICE_SENTENCE =
  "Write the way you'd explain something to a smart friend who is in a hurry."

export const STYLE_GUIDE_MD = `# Inkwell style guide

How we write at Inkwell. When in doubt, keep it short and kind.

## Voice

${STYLE_GUIDE_VOICE_SENTENCE}
Use "you", keep sentences short, and skip the jargon.

## Formatting

- Use sentence case for headings.
- Put button and menu names in **bold**: click **Save**.
- Put commands and file names in \`code\`.
- Stick to one idea per paragraph, so readers ${STYLE_GUIDE_TYPO} it clearly.

## Team tips

- Read your page out loud before you publish it.
- Link to a page instead of copying it.
`

/**
 * Coarse section tags for the Commit Lab (#40): two scripted commits conflict when they touch the
 * same tag. Keep these in step with the file contents above.
 */
export const SECTIONS = {
  readme: 'readme',
  teamList: 'team:list',
  welcomeIntro: 'welcome:intro',
  welcomeStart: 'welcome:start',
  styleGuideVoice: 'style-guide:voice',
  styleGuideFormatting: 'style-guide:formatting',
  styleGuideTips: 'style-guide:tips',
} as const

export type SectionTag = (typeof SECTIONS)[keyof typeof SECTIONS]

// ---------------------------------------------------------------- history

function docsSiteHistory(): HistoryEntry[] {
  const v1: FileTree = { 'README.md': README_V1, 'docs/welcome.md': WELCOME_MD }
  const v2: FileTree = { ...v1, 'docs/style-guide.md': STYLE_GUIDE_MD }
  const v3: FileTree = { ...v2, 'team.md': TEAM_MD }
  const v4: FileTree = { ...v3, 'README.md': README }
  return [
    {
      message: 'Start the docs site',
      author: person('jordan'),
      timestamp: WORLD_START - 30 * DAY,
      tree: v1,
    },
    {
      // Squash-merged pull requests: one tidy commit each, titled "<PR title> (#n)".
      message:
        'Add a style guide (#1)\n\n* Draft the style guide\n* Add team tips\n* Fix heading case',
      author: person('robin'),
      timestamp: WORLD_START - 21 * DAY,
      tree: v2,
    },
    {
      message: 'Add a team list (#2)',
      author: person('jordan'),
      timestamp: WORLD_START - 14 * DAY,
      tree: v3,
    },
    {
      message:
        'Explain branches and pull requests in the README (#3)\n\n* Describe the review flow\n* Point new people at team.md',
      author: person('robin'),
      timestamp: WORLD_START - 3 * DAY,
      tree: v4,
    },
  ]
}

export function createDocsSite(): RemoteRepo {
  return createRemote({
    slug: DOCS_SITE,
    description: 'Inkwell product documentation',
    history: docsSiteHistory(),
  })
}

function createWebsite(): RemoteRepo {
  return createRemote({
    slug: WEBSITE,
    description: 'Marketing site for inkwell.example',
    history: [
      {
        message: 'Launch the new homepage',
        author: person('alex'),
        timestamp: WORLD_START - 6 * DAY,
        tree: {
          'README.md': '# inkwell.example\n\nThe marketing website. Docs live in docs-site.\n',
          'index.html': '<h1>Inkwell</h1>\n',
        },
      },
    ],
  })
}

function createOldWiki(): RemoteRepo {
  return createRemote({
    slug: OLD_WIKI,
    description: 'The old internal wiki. Archived: everything moved to docs-site.',
    archived: true,
    history: [
      {
        message: 'Archive the wiki',
        author: person('jordan'),
        timestamp: WORLD_START - 400 * DAY,
        tree: { 'README.md': '# Old wiki\n\nArchived. See inkwell/docs-site.\n' },
      },
    ],
  })
}

export function createRemotes(): Record<string, RemoteRepo> {
  return Object.fromEntries(
    [createDocsSite(), createWebsite(), createOldWiki()].map((repo) => [repo.slug, repo])
  )
}
