import { cn } from '@/lib/utils'

/** Label, control, then one line of help or one error. The error replaces the hint and is announced. */
export function Field({ id, label, hint, error, required, className, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div data-slot="field" className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}{required && <span aria-hidden="true" className="text-muted-foreground"> *</span>}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
