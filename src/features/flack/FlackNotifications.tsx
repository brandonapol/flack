import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { FlackMessage } from '../../engine/game'
import { useGame } from '../../store'
import { Avatar } from '../shared/Avatar'
import styles from './FlackNotifications.module.css'

const SHOW_MS = 6000

/** A small bubble when a message arrives while you're looking at something else. */
export function FlackNotifications() {
  const messages = useGame((s) => s.game.flack.messages)
  const characters = useGame((s) => s.config.characters)
  const channels = useGame((s) => s.config.channels)
  const activeTab = useGame((s) => s.game.ui.activeTab)
  const activeChannel = useGame((s) => s.game.flack.activeChannel)
  const navigate = useNavigate()

  const [shown, setShown] = useState<FlackMessage>()
  const seen = useRef(messages.length)

  useEffect(() => {
    const fresh = messages.slice(seen.current)
    seen.current = messages.length
    const latest = [...fresh].reverse().find((message) => message.from !== 'player')
    if (!latest) return
    if (activeTab === 'flack' && activeChannel === latest.channel) return
    setShown(latest)
    const timer = setTimeout(() => setShown(undefined), SHOW_MS)
    return () => clearTimeout(timer)
  }, [messages, activeTab, activeChannel])

  if (!shown) return null
  const character = characters[shown.from]
  const channel = channels.find((candidate) => candidate.id === shown.channel)

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.toast}
        onClick={() => {
          setShown(undefined)
          navigate(`/flack/${shown.channel}`)
        }}
      >
        <Avatar name={character?.name ?? shown.from} character={character} size={28} square />
        <span className={styles.body}>
          <span className={styles.title}>
            {character?.name ?? shown.from}
            {channel?.kind === 'channel' ? ` in #${channel.name}` : ''}
          </span>
          <span className={styles.text}>{shown.text}</span>
        </span>
      </button>
    </div>
  )
}
