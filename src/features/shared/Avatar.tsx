import type { Character } from '../../engine/story/types'
import styles from './Avatar.module.css'
import { initialsOf } from './initials'

interface AvatarProps {
  name: string
  character?: Character
  size?: number
  square?: boolean
}

/** Initials on a colour. Decorative: the name is always shown or announced next to it. */
export function Avatar({ name, character, size = 32, square }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: character?.color ?? 'var(--text-muted)',
        borderRadius: square ? 6 : '50%',
      }}
    >
      {character?.initials ?? initialsOf(name)}
    </span>
  )
}
