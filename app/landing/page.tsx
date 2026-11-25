import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"
import { LiveFlow } from "@/components/live-flow"

const points = [
  ["Tasks unlock themselves", "Say what waits on what. Finished work moves the next task to Up next."],
  ["Agents work under a lease", "Agents claim ready tasks over MCP. If one crashes, its lease expires and the task comes back."],
  ["You stay in charge", "Work an agent hands back waits for your review before it counts as done."],
]

export default function LandingPage() {
  return (
    <main id="product" className="grid min-h-[100svh] bg-background text-foreground lg:grid-cols-[minmax(26rem,36rem)_minmax(0,1fr)]">
      <div className="flex min-h-[100svh] flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-8 border-border bg-card p-1" priority />
            <span className="saathi-display text-lg">Saathi</span>
          </Link>
          <Link href="/login" className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted">Sign in</Link>
        </div>
        <div className="flex flex-1 items-center py-12">
          <div className="mx-auto w-full max-w-md">
            <p className="saathi-label text-muted-foreground">Task coordination for people and agents</p>
            <h1 className="mt-3 text-5xl leading-[1.02] sm:text-6xl">
              Turn shared intent into <span className="text-primary">clear progress.</span>
            </h1>
            <div className="mt-8 flex flex-row flex-wrap items-center gap-2">
              <Button asChild size="lg">
                <Link href="/register">Create your workspace <ArrowRight className="size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="ghost"><Link href="/guide" className="whitespace-nowrap">See how it works</Link></Button>
            </div>
            <ul className="mt-10 space-y-4 border-t border-border pt-6">
              {points.map(([title, body]) => <li key={title}><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-sm leading-6 text-muted-foreground">{body}</p></li>)}
            </ul>
          </div>
        </div>
      </div>
      <aside aria-label="How Saathi coordinates work" className="relative hidden min-h-[100svh] flex-col justify-center gap-6 overflow-hidden border-l border-border bg-card/40 px-10 py-10 lg:flex">
        <p className="saathi-label text-muted-foreground">Live path</p>
        <LiveFlow className="h-auto max-h-[80svh] w-full" />
      </aside>
    </main>
  )
}
