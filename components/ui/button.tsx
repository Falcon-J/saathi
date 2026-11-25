import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

/**
 * One button for the whole app.
 * - default: the single main action on a surface (violet). Use at most one per view.
 * - outline / secondary: every other action.
 * - ghost: toolbar and inline actions.
 * - destructive: only for actions that remove data.
 * Heights: sm 32px, default 40px, lg 44px. On touch screens every size grows to 44px.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--saathi-radius-control)] text-sm font-semibold transition-[color,background-color,border-color,box-shadow] duration-[var(--saathi-duration-fast)] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive pointer-coarse:min-h-11",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[var(--saathi-brand-hover)]',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:ring-destructive',
        outline: 'border border-border bg-card text-foreground hover:border-[var(--saathi-line-strong)] hover:bg-muted',
        secondary: 'bg-muted text-foreground hover:bg-[var(--saathi-hover)]',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 px-6 has-[>svg]:px-4',
        icon: 'size-10',
        'icon-sm': 'size-8 pointer-coarse:min-w-11',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner, keeps the label, and blocks repeat clicks. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? children : <>{loading && <Spinner aria-hidden="true" role={undefined} aria-label={undefined} />}{children}</>}
    </Comp>
  )
}

export { Button, buttonVariants }
