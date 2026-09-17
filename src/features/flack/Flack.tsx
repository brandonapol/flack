import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useGame } from '../../store'
import { ChannelView } from './ChannelView'
import styles from './Flack.module.css'
import { Sidebar } from './Sidebar'

export function Flack() {
  const channels = useGame((s) => s.config.channels)
  const configuredDefault = useGame((s) => s.config.defaultChannel)
  const activeChannel = useGame((s) => s.game.flack.activeChannel)
  const dispatch = useGame((s) => s.dispatch)
  const navigate = useNavigate()
  const routeChannel = useParams().channel

  const known = channels.some((channel) => channel.id === routeChannel)
  const fallback =
    configuredDefault ??
    channels.find((channel) => channel.kind === 'channel')?.id ??
    channels[0].id
  const current = known ? routeChannel! : (activeChannel ?? fallback)

  // Keep the URL, the active channel and "read up to here" in step.
  useEffect(() => {
    if (!known) navigate(`/flack/${current}`, { replace: true })
  }, [known, current, navigate])

  useEffect(() => {
    dispatch({ type: 'openChannel', channel: current })
  }, [current, dispatch])

  return (
    <div className={styles.flack}>
      <Sidebar current={current} onOpen={(channel) => navigate(`/flack/${channel}`)} />
      <ChannelView channelId={current} />
    </div>
  )
}
