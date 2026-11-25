import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { SaathiLogo } from "@/components/saathi-logo"

/**
 * The frame for signed-in pages outside the canvas (guide, connections,
 * archive, help): the same header and title treatment as Sign in, on a
 * readable single column.
 */
export function AppPage({ eyebrow, title, description, backHref = "/canvas", backLabel = "Back to workspace", actions, width = "max-w-4xl", children }: {
  eyebrow: string; title: string; description?: ReactNode; backHref?: string; backLabel?: string; actions?: ReactNode; width?: string; children: ReactNode
}) {
  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-7 border-border bg-card p-1" />
            <span className="saathi-display text-base">Saathi</span>
          </Link>
          <Link href={backHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} space-y-8 px-4 py-10 sm:px-6`}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div className="max-w-2xl">
            <p className="saathi-label text-muted-foreground">{eyebrow}</p>
            <h1 className="mt-2 text-4xl leading-none">{title}</h1>
            {description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  )
}
