import { useGame } from '../../store'
import { Avatar } from '../shared/Avatar'
import styles from './Flack.module.css'

export function Sidebar({
  current,
  onOpen,
}: {
  current: string
  onOpen: (channel: string) => void
}) {
  const channels = useGame((s) => s.config.channels)
  const characters = useGame((s) => s.config.characters)
  const messages = useGame((s) => s.game.flack.messages)
  const readUpTo = useGame((s) => s.game.flack.readUpTo)

  const unreadIn = (id: string) =>
    Math.max(0, messages.filter((message) => message.channel === id).length - (readUpTo[id] ?? 0))

  const section = (kind: 'channel' | 'dm', title: string) => {
    const items = channels.filter((channel) => channel.kind === kind)
    if (items.length === 0) return null
    return (
      <>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <ul className={styles.channelList} role="list">
          {items.map((channel) => {
            const unread = unreadIn(channel.id)
            const character = channel.characterId ? characters[channel.characterId] : undefined
            return (
              <li key={channel.id}>
                <button
                  type="button"
                  className={styles.channelButton}
                  aria-current={channel.id === current ? 'true' : undefined}
                  data-unread={unread > 0 ? 'true' : undefined}
                  onClick={() => onOpen(channel.id)}
                >
                  {kind === 'channel' ? (
                    <span aria-hidden="true" className={styles.hash}>
                      #
                    </span>
                  ) : (
                    <Avatar name={channel.name} character={character} size={18} square />
                  )}
                  <span className={styles.channelName}>{channel.name}</span>
                  {unread > 0 && (
                    <>
                      <span className={styles.unread} aria-hidden="true">
                        {unread}
                      </span>
                      <span className={styles.srOnly}>, {unread} unread</span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  return (
    <nav className={styles.sidebar} aria-label="Channels">
      <div className={styles.workspace}>
        <span className={styles.workspaceIcon} aria-hidden="true">
          I
        </span>
        <span>
          <strong className={styles.workspaceName}>Inkwell</strong>
        </span>
      </div>
      {section('channel', 'Channels')}
      {section('dm', 'Direct messages')}
    </nav>
  )
}
