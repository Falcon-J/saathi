import { cn } from '@/lib/utils'

/** Placeholder while content loads. Pulses only when motion is allowed. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('rounded-[var(--saathi-radius-control)] bg-muted motion-safe:animate-pulse', className)} {...props} />
}
