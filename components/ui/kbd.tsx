import { cn } from '@/lib/utils'

/** A keyboard key, for shortcut hints. */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd" className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--saathi-radius-label)] border border-border border-b-2 bg-card px-1.5 font-mono text-xs text-muted-foreground', className)} {...props} />
}
