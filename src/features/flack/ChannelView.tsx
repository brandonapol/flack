import { useLayoutEffect, useMemo, useRef } from 'react'

import type { FlackMessage } from '../../engine/game'
import type { Character } from '../../engine/story/types'
import { useGame } from '../../store'
import { Avatar } from '../shared/Avatar'
import { Markdown } from '../shared/Markdown'
import { clockTime } from '../shared/time'
import { AskRobin } from './AskRobin'
import styles from './Flack.module.css'

/** Messages from the same person within this many fake seconds are grouped under one heading. */
const GROUP_WINDOW = 300

export function ChannelView({ channelId }: { channelId: string }) {
  const channel = useGame((s) => s.config.channels.find((candidate) => candidate.id === channelId))
  const characters = useGame((s) => s.config.characters)
  const playerName = useGame((s) => s.game.player.name)
  // Selectors must return a stable value, so filtering happens after selecting.
  const allMessages = useGame((s) => s.game.flack.messages)
  const allTyping = useGame((s) => s.typing)
  const messages = useMemo(
    () => allMessages.filter((message) => message.channel === channelId),
    [allMessages, channelId]
  )
  const typing = useMemo(
    () => allTyping.filter((entry) => entry.channel === channelId),
    [allTyping, channelId]
  )
  const dispatch = useGame((s) => s.dispatch)
  // Point at the reply buttons only when there are some to press.
  const awaitingReply = messages.some((message) => message.quickReplies && !message.repliedWith)
  const isMentorChannel = useGame((s) => s.config.mentor?.channel === channelId)
  const endRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, typing.length])

  const who = (from: string): { name: string; character?: Character } =>
    from === 'player'
      ? { name: playerName?.trim() || 'You' }
      : { name: characters[from]?.name ?? from, character: characters[from] }

  return (
    <section
      className={styles.channel}
      aria-label={
        channel?.kind === 'dm' ? `Messages with ${channel.name}` : `#${channel?.name ?? channelId}`
      }
    >
      <header className={styles.channelHeader}>
        <h2 className={styles.channelTitle}>
          {channel?.kind === 'channel' && <span aria-hidden="true">#</span>}
          {channel?.name ?? channelId}
        </h2>
        {channel?.topic && <p className={styles.topic}>{channel.topic}</p>}
      </header>

      <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && <p className={styles.empty}>No messages yet.</p>}
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const grouped =
            previous?.from === message.from && message.time - previous.time < GROUP_WINDOW
          return (
            <Message
              key={message.id}
              message={message}
              grouped={grouped}
              {...who(message.from)}
              onReply={(replyId) =>
                dispatch({ type: 'flackReply', messageId: message.id, replyId })
              }
              onOpenLab={(scenario) => dispatch({ type: 'openCommitLab', scenario })}
            />
          )
        })}
        {typing.map((entry) => (
          <p key={entry.from} className={styles.typing}>
            <span className={styles.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {who(entry.from).name} is typing…
          </p>
        ))}
        <div ref={endRef} />
      </div>

      {isMentorChannel && <AskRobin />}

      <div className={styles.composer}>
        <input
          className={styles.composerInput}
          placeholder={
            awaitingReply
              ? 'Use the reply buttons above'
              : 'No typing needed here: follow the step on the left'
          }
          aria-label="Message box (disabled in this tutorial)"
          disabled
        />
      </div>
    </section>
  )
}

interface MessageProps {
  message: FlackMessage
  name: string
  character?: Character
  grouped: boolean
  onReply: (replyId: string) => void
  onOpenLab: (scenario: string) => void
}

function Message({ message, name, character, grouped, onReply, onOpenLab }: MessageProps) {
  return (
    <article className={grouped ? styles.messageGrouped : styles.message}>
      <div className={styles.messageAvatar}>
        {!grouped && <Avatar name={name} character={character} size={36} square />}
      </div>
      <div className={styles.messageBody}>
        {!grouped && (
          <p className={styles.messageMeta}>
            <strong
              className={styles.messageAuthor}
              style={character ? { color: character.color } : undefined}
            >
              {name}
            </strong>
            <span className={styles.messageTime}>{clockTime(message.time)}</span>
          </p>
        )}
        <Markdown source={message.text} className={styles.messageText} inline />
        {message.lab && (
          <div className={styles.replies}>
            <button type="button" className={styles.reply} onClick={() => onOpenLab(message.lab!)}>
              Try it in the Commit Lab
            </button>
          </div>
        )}
        {message.quickReplies && !message.repliedWith && (
          <div className={styles.replies}>
            {message.quickReplies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                className={styles.reply}
                onClick={() => onReply(reply.id)}
              >
                {reply.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
