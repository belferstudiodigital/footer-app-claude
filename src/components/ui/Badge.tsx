import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Tone = 'neutral' | 'lime' | 'success' | 'warning' | 'danger' | 'muted'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/8 text-text border border-white/10',
  lime: 'bg-lime/15 text-lime border border-lime/30',
  success: 'bg-success/15 text-success border border-success/30',
  warning: 'bg-warning/15 text-warning border border-warning/30',
  danger: 'bg-danger/15 text-danger border border-danger/30',
  muted: 'bg-transparent text-text-muted border border-border',
}

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ className, tone = 'neutral', ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
