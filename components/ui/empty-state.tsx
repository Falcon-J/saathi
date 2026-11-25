import { cn } from '@/lib/utils'

/** What to show when a view has nothing in it: say why, then offer the one action that fixes it. */
export function EmptyState({ title, description, action, className }: { title: string; description: string; action?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn('flex flex-col items-center gap-3 rounded-[var(--saathi-radius-container)] border border-dashed border-border px-6 py-10 text-center', className)}>
      <div aria-hidden="true" className="grid size-10 grid-cols-2 gap-0.5"><span className="bg-foreground" /><span /><span /><span className="bg-primary" /></div>
      <h3 className="saathi-display text-lg">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}
