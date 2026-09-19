import { useState } from 'react'
import { useNavigate } from 'react-router'

import { currentChapter, currentStep, shouldPulseHint } from '../../engine/story/runner'
import { interpolate } from '../../engine/story/template'
import { useGame } from '../../store'
import { LabFigureView } from '../commit-lab'
import { Markdown } from '../shared/Markdown'
import { ConfirmButton } from './ConfirmButton'
import { DayOneComplete } from './DayOneComplete'
import { Graduation } from './Graduation'
import styles from './Instructions.module.css'
import { InstructionsText } from './InstructionsText'
import { endsMilestone } from './progress'
import { StepList } from './StepList'
import { WhereAreMyChanges } from './WhereAreMyChanges'

export function Instructions() {
  const game = useGame((s) => s.game)
  const config = useGame((s) => s.config)
  const dispatch = useGame((s) => s.dispatch)
  const restartChapter = useGame((s) => s.restartChapter)
  const resetEverything = useGame((s) => s.resetEverything)
  const navigate = useNavigate()
  const [introOpen, setIntroOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const chapter = currentChapter(config, game)
  const step = currentStep(config, game)
  const story = game.story
  const fill = (text: string) => interpolate(text, game)

  if (!chapter) return <div className={styles.panel} />

  const numbered = config.chapters.filter((candidate) => candidate.milestone !== 'bonus')
  const number = config.chapters.findIndex((candidate) => candidate.id === chapter.id) + 1
  // The chapter that closes Day one: the next one (if any) belongs to a later milestone.
  const endsDayOne = chapter.milestone === 'day-one' && endsMilestone(config, chapter.id)
  const endsSync = chapter.milestone === 'keeping-in-sync' && endsMilestone(config, chapter.id)
  const done = story.completedSteps.length + story.skippedSteps.length
  const progress = Math.round((done / chapter.steps.length) * 100)
  const lastCompleted = chapter.steps.find(
    (candidate) => candidate.id === story.completedSteps[story.completedSteps.length - 1]
  )
  const hints = step?.hints ?? []
  const shownHints = hints.slice(0, story.hintsShown)
  const mentorChannel = config.mentor?.channel

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className={styles.chapterNumber}>
          {chapter.milestone === 'bonus'
            ? 'Bonus chapter'
            : `Chapter ${number} of ${numbered.length}`}
        </p>
        <h1 className={styles.chapterTitle}>{fill(chapter.title)}</h1>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Chapter progress"
        >
          <span className={styles.progressBar} style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className={styles.scroll}>
        {chapter.intro && (
          <section className={styles.intro}>
            <button
              type="button"
              className={styles.introToggle}
              aria-expanded={introOpen}
              onClick={() => setIntroOpen(!introOpen)}
            >
              <span aria-hidden="true">{introOpen ? '▾' : '▸'}</span> The story so far
            </button>
            {introOpen && <InstructionsText source={fill(chapter.intro)} />}
          </section>
        )}

        <StepList
          steps={chapter.steps}
          stepIndex={story.stepIndex}
          completed={story.completedSteps}
          skipped={story.skippedSteps}
          interpolate={fill}
        />

        {endsDayOne && story.phase !== 'playing' ? (
          <DayOneComplete />
        ) : endsSync && story.phase !== 'playing' ? (
          <Graduation />
        ) : chapter.milestone === 'bonus' && story.phase !== 'playing' ? (
          <section className={styles.card} aria-label="Bonus complete">
            <h2 className={styles.cardTitle}>Bonus complete 🧰</h2>
            <p>Three ways out of “I think I broke something”:</p>
            <ul className={styles.summary}>
              {chapter.summary.map((point) => (
                <li key={point}>
                  <Markdown source={fill(point)} inline />
                </li>
              ))}
            </ul>
          </section>
        ) : story.phase === 'complete' ? (
          <section className={styles.card} aria-label="Chapter complete">
            <h2 className={styles.cardTitle}>Chapter complete 🎉</h2>
            <ul className={styles.summary}>
              {chapter.summary.map((point) => (
                <li key={point}>
                  <Markdown source={fill(point)} inline />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.primary}
              onClick={() => dispatch({ type: 'continueStory' })}
            >
              Keep going
            </button>
          </section>
        ) : (
          step && (
            <section className={styles.card} aria-label="What to do now">
              {lastCompleted?.afterNote && (
                <p className={styles.afterNote}>
                  <strong>What just happened:</strong>{' '}
                  <Markdown source={fill(lastCompleted.afterNote)} inline />
                </p>
              )}
              <h2 className={styles.cardTitle}>{fill(step.title)}</h2>
              <InstructionsText source={fill(step.body)} />
              {step.figure && <LabFigureView figure={step.figure} />}

              {shownHints.map((hint, index) => (
                <div key={index} className={styles.hint}>
                  <strong>Hint {index + 1}:</strong>
                  <InstructionsText source={fill(hint)} />
                </div>
              ))}

              {story.solutionShown && step.solution && (
                <div className={styles.solution}>
                  <p className={styles.solutionLabel}>Do this:</p>
                  {[step.solution].flat().map((command) => (
                    <InstructionsText key={command} source={'`' + fill(command) + '`'} />
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                {story.hintsShown < hints.length && (
                  <button
                    type="button"
                    className={shouldPulseHint(game) ? styles.pulse : styles.action}
                    onClick={() => dispatch({ type: 'showHint' })}
                  >
                    {story.hintsShown === 0 ? 'Hint' : 'Another hint'}
                  </button>
                )}
                {step.solution && !story.solutionShown && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => dispatch({ type: 'revealSolution' })}
                  >
                    Show me
                  </button>
                )}
                {mentorChannel && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => navigate(`/flack/${mentorChannel}`)}
                  >
                    Ask Robin
                  </button>
                )}
                {step.optional && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => dispatch({ type: 'skipStep' })}
                  >
                    Skip this step
                  </button>
                )}
              </div>

              {step.docs && step.docs.length > 0 && (
                <p className={styles.docs}>
                  <span aria-hidden="true">📖 </span>
                  {step.docs.map((link, index) => (
                    <span key={link.href}>
                      {index > 0 && ' · '}
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label} ↗
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </section>
          )
        )}

        {/* From Chapter 2 on, once there's a repository to look into. */}
        {number >= 3 && (
          <WhereAreMyChanges
            finished={
              story.phase !== 'playing' ||
              chapter.steps.slice(story.stepIndex).every((candidate) => candidate.optional)
            }
          />
        )}
      </div>

      <footer className={styles.footer}>
        <ConfirmButton
          label="Restart chapter"
          question="Start this chapter again?"
          confirmLabel="Restart"
          onConfirm={restartChapter}
        />
        <button
          type="button"
          className={styles.footerButton}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Chapters
        </button>
        <ConfirmButton
          label="Reset everything"
          question="Erase all progress and start over?"
          confirmLabel="Reset"
          onConfirm={resetEverything}
        />
        {menuOpen && (
          <ul className={styles.chapterMenu} aria-label="Chapters">
            {config.chapters.map((candidate, index) => {
              const playable =
                index === 0 || story.completedChapters.includes(config.chapters[index - 1].id)
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={styles.chapterMenuItem}
                    disabled={!playable}
                    aria-current={candidate.id === chapter.id ? 'true' : undefined}
                    onClick={() => {
                      setMenuOpen(false)
                      dispatch({ type: 'startChapter', chapterId: candidate.id })
                    }}
                  >
                    {candidate.milestone === 'bonus'
                      ? `Bonus: ${candidate.title}`
                      : `${index + 1}. ${candidate.title}`}
                    {!playable && <span className={styles.srOnly}> (not unlocked yet)</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </footer>
    </div>
  )
}
