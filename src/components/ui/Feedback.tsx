import { cn } from '../../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-10', className)}>
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-lime border-t-transparent" />
    </div>
  )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border py-10 px-4 text-center">
      <p className="font-display text-lg text-text-muted">{title}</p>
      {subtitle && <p className="text-sm text-text-muted/70 max-w-xs">{subtitle}</p>}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger animate-fade-in">
      {message}
    </div>
  )
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-success animate-fade-in">
      {message}
    </div>
  )
}
