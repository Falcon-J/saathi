import { cn } from '@/lib/utils'

export type TaskState = 'waiting' | 'ready' | 'in_progress' | 'awaiting_review' | 'done' | 'failed'

const styles: Record<TaskState, { label: string; className: string; mark: string }> = {
  waiting: { label: 'Waiting', className: 'bg-[var(--saathi-warning-soft)] text-[var(--saathi-warning)]', mark: '◌' },
  ready: { label: 'Ready', className: 'bg-accent text-accent-foreground', mark: '●' },
  in_progress: { label: 'In progress', className: 'bg-muted text-foreground', mark: '◐' },
  awaiting_review: { label: 'Awaiting review', className: 'bg-[var(--saathi-review-soft)] text-[var(--saathi-review)]', mark: '◑' },
  done: { label: 'Done', className: 'bg-[var(--saathi-success-soft)] text-[var(--saathi-success)]', mark: '✓' },
  failed: { label: 'Failed', className: 'bg-[var(--saathi-danger-soft)] text-[var(--saathi-danger)]', mark: '✕' },
}

/** The one way to show a task's state. Colour is never the only signal: each state also has a mark and a word. */
export function StatusChip({ state, className }: { state: TaskState; className?: string }) {
  const style = styles[state]
  return (
    <span data-slot="status-chip" data-state={state} className={cn('inline-flex h-6 items-center gap-1.5 rounded-[var(--saathi-radius-label)] px-2 font-mono text-xs font-medium', style.className, className)}>
      <span aria-hidden="true">{style.mark}</span>{style.label}
    </span>
  )
}

export const TASK_STATES = Object.keys(styles) as TaskState[]
