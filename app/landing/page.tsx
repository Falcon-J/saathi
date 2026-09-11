import Link from "next/link"
import { ArrowRight, BarChart3, ListChecks, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen">
      <header className="bg-transparent">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#product" className="hover:text-foreground">Product</Link><Link href="#features" className="hover:text-foreground">Features</Link><span className="cursor-not-allowed text-muted-foreground/60" aria-disabled="true" title="Pricing is not available yet">Pricing</span><Link href="/guide" className="hover:text-foreground">Guide</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-foreground"><Link href="/login">Sign in</Link></Button>
            <Button asChild className="hidden rounded-full sm:inline-flex"><Link href="/register">Get started <span className="sr-only">Create an account</span></Link></Button>
          </div>
        </div>
      </header>

      <section id="product" className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <p className="saathi-label text-primary">FROM INTENTION TO EXECUTION</p>
          <p className="sr-only">A focused workspace for teams to plan clearly, move together, and finish what matters.</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-7xl">
            Make progress<br />visible.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground sm:text-xl">
            A focused workspace for teams to plan clearly, move together, and finish what matters.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/register">Create your workspace
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/guide">Explore the guide <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </div>

        <section className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(circle_at_58%_38%,#ddf4ee_0%,#f7f7f4_62%,transparent_76%)] p-5 sm:p-8" aria-label="Saathi collaborative workspace preview">
          <div className="absolute right-[-8%] top-[8%] size-64 rounded-full bg-[#bfe9df]/60 blur-3xl" />
          <div className="relative z-10 mt-8 overflow-hidden rounded-2xl border border-[#c9d8d5] bg-white shadow-[var(--saathi-shadow-float)] sm:mt-4">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Workspace overview</span><span>5 tasks</span></div>
            <div className="grid grid-cols-[92px_minmax(0,1fr)] divide-x divide-border sm:grid-cols-[92px_minmax(0,1fr)_112px]">
              <div className="space-y-3 bg-[#f4faf8] p-3 text-xs text-muted-foreground"><p className="font-semibold text-primary">Overview</p><p>Board</p><p>Team</p><p>Settings</p></div>
              <div className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Acme Product</p><p className="text-lg font-semibold">What needs your attention?</p></div><span className="rounded-md bg-[#dff4ee] px-2 py-1 text-xs font-medium text-primary">5 tasks</span></div><div className="space-y-2"><div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs"><span className="size-2 rounded-full bg-[#ef8a74]" /><span className="flex-1">Finalize product messaging</span><span className="rounded bg-[#fff0e7] px-1.5 py-0.5 text-[#b9533f]">Today</span></div><div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs"><span className="size-2 rounded-full bg-primary" /><span className="flex-1">Prepare launch plan</span><span className="rounded bg-[#dff4ee] px-1.5 py-0.5 text-primary">Next</span></div><div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs"><span className="size-2 rounded-full bg-[#9cb6aa]" /><span className="flex-1">Review customer feedback</span><span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">Later</span></div></div></div>
              <div className="hidden space-y-4 bg-[#fbfcfb] p-4 text-xs sm:block"><p className="font-semibold">Activity</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Priya</span> completed a task</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Rohan</span> moved work</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Meera</span> added a comment</p></div>
            </div>
          </div>
          <div className="absolute bottom-5 left-6 rounded-full border border-primary/20 bg-white/90 px-3 py-1.5 text-xs font-medium text-primary shadow-sm sm:bottom-8 sm:left-10">Clear next step →</div>
        </section>
      </section>

      <section id="features" className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: ListChecks, title: "Clear next steps", copy: "Turn ideas into actionable plans with clarity." },
            { icon: UsersRound, title: "Shared ownership", copy: "Keep everyone aligned and accountable." },
            { icon: BarChart3, title: "Visible progress", copy: "See what’s moving, what’s next, and what’s done." },
          ].map(({ icon: Icon, title, copy }) => (
            <article key={title} className="flex gap-3 border-r-0 border-border last:border-0 md:border-r md:px-5 md:first:pl-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
