import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { SaathiLogo } from "@/components/saathi-logo"
import { LiveFlow } from "@/components/live-flow"

/**
 * The layout every signed-out page shares with Sign in: a solid column for the
 * task at hand and, on large screens, the live path panel beside it.
 */
export function AuthShell({ eyebrow, title, description, backHref = "/", backLabel = "Back", children }: {
  eyebrow: string; title: string; description?: ReactNode; backHref?: string; backLabel?: string; children: ReactNode
}) {
  return <AuthFrame backHref={backHref} backLabel={backLabel}>
    <div>
      <p className="saathi-label text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-2 text-4xl leading-none text-foreground">{title}</h1>
      {description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
    {children}
  </AuthFrame>
}

/** The same frame for pages that bring their own heading. */
export function AuthFrame({ backHref = "/", backLabel = "Back", wide = false, children }: { backHref?: string; backLabel?: string; wide?: boolean; children: ReactNode }) {
  return (
    <main className="grid min-h-[100svh] bg-background text-foreground lg:grid-cols-[minmax(26rem,34rem)_minmax(0,1fr)]">
      <div className="flex min-h-[100svh] flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-8 border-border bg-card p-1" priority />
            <span className="saathi-display text-lg text-foreground">Saathi</span>
          </Link>
          <Link href={backHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </header>

        <div className="flex flex-1 items-center py-10">
          <section className={`mx-auto w-full ${wide ? "max-w-md" : "max-w-sm"}`}>
            {children}
          </section>
        </div>
      </div>
      <aside aria-label="How Saathi coordinates work" className="relative hidden min-h-[100svh] flex-col justify-center gap-6 overflow-hidden border-l border-border bg-card/40 px-10 py-10 lg:flex">
        <div className="max-w-xl">
          <p className="saathi-label text-muted-foreground">Live path</p>
          <p className="saathi-display mt-2 text-3xl leading-tight text-foreground">People and agents, one task graph.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Finished work unlocks the next task. Agents claim under a lease, so a crashed agent never holds work hostage.</p>
        </div>
        <LiveFlow className="h-auto max-h-[70svh] w-full" />
      </aside>
    </main>
  )
}
