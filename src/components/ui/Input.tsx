import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface FieldWrapProps {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrapProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    return (
      <label className="block">
        {label && <span className="mb-1.5 block text-sm text-text-muted">{label}</span>}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full h-11 rounded-xl bg-surface-2 border border-border px-3.5 text-text placeholder:text-text-muted/60',
            'focus:outline-none focus:border-lime/60 focus:ring-2 focus:ring-lime/20 transition-colors',
            error && 'border-danger/60',
            className
          )}
          {...props}
        />
        {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
        {hint && !error && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
      </label>
    )
  }
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrapProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    return (
      <label className="block">
        {label && <span className="mb-1.5 block text-sm text-text-muted">{label}</span>}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'w-full min-h-[88px] rounded-xl bg-surface-2 border border-border px-3.5 py-2.5 text-text placeholder:text-text-muted/60',
            'focus:outline-none focus:border-lime/60 focus:ring-2 focus:ring-lime/20 transition-colors',
            error && 'border-danger/60',
            className
          )}
          {...props}
        />
        {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
        {hint && !error && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
      </label>
    )
  }
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrapProps>(
  ({ className, label, error, hint, id, children, ...props }, ref) => {
    return (
      <label className="block">
        {label && <span className="mb-1.5 block text-sm text-text-muted">{label}</span>}
        <select
          ref={ref}
          id={id}
          className={cn(
            'w-full h-11 rounded-xl bg-surface-2 border border-border px-3.5 text-text',
            'focus:outline-none focus:border-lime/60 focus:ring-2 focus:ring-lime/20 transition-colors',
            error && 'border-danger/60',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
        {hint && !error && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
      </label>
    )
  }
)
Select.displayName = 'Select'
