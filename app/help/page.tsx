import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, CheckSquare, HelpCircle, LifeBuoy, Search, Send, Sparkles, Users } from "lucide-react"
import { SaathiLogo } from "@/components/saathi-logo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Help center | Saathi",
  description: "Learn how to plan, collaborate, and move work forward with Saathi.",
}

const topics = [
  { icon: Sparkles, title: "Getting started", description: "Set up your account and get moving.", href: "/guide" },
  { icon: Users, title: "Workspaces", description: "Organize teams, projects, and people.", href: "/guide#core-flow-title" },
  { icon: CheckSquare, title: "Tasks", description: "Plan, assign, and track work.", href: "/tasks" },
  { icon: Send, title: "Invitations", description: "Bring your team on board.", href: "/guide#limits" },
  { icon: Users, title: "Real-time collaboration", description: "Work together in one place.", href: "/guide#core-flow-title" },
  { icon: Sparkles, title: "AI assistance", description: "Use AI to plan, write, and get unstuck.", href: "/guide#assistant-title" },
]

export default function HelpPage() {
  return (
    <main className="saathi-dashboard min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Saathi home"><SaathiLogo className="size-9" priority /><span className="font-semibold">Saathi</span></Link>
          <label className="hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/45 px-3 py-2 text-sm text-muted-foreground md:flex"><Search className="size-4" /><input aria-label="Search help articles" placeholder="Search help articles, guides, or topics..." className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" /></label>
          <Button asChild variant="outline" size="sm"><Link href="/guide">Product guide<ArrowRight className="size-4" /></Link></Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:py-10">
        <aside className="hidden rounded-[var(--saathi-radius-card)] border border-border bg-card p-4 lg:block">
          <p className="saathi-label text-primary">Help center</p>
          <nav className="mt-4 space-y-1 text-sm"><a className="block rounded-lg bg-accent px-3 py-2 font-medium text-primary" href="#topics">Browse topics</a><a className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary" href="#support">Contact support</a></nav>
        </aside>

        <div>
          <section className="relative overflow-hidden rounded-[var(--saathi-radius-container)] border border-border bg-card px-6 py-10 sm:px-10 sm:py-12">
            <div className="relative z-10 max-w-xl"><p className="saathi-label text-primary">Help center</p><h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">How can we help you?</h1><p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">Learn how Saathi helps you turn ideas into meaningful work, together.</p><label className="mt-7 flex max-w-xl items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground"><Search className="size-4" /><input aria-label="Search guides, tutorials, or answers" placeholder="Search for guides, tutorials, or answers..." className="min-w-0 flex-1 bg-transparent outline-none" /></label></div>
            <div className="pointer-events-none absolute -right-8 -top-10 hidden size-64 rounded-full bg-primary/10 blur-3xl sm:block" /><div className="pointer-events-none absolute bottom-[-6rem] right-12 hidden size-72 rotate-12 rounded-[3rem] bg-accent sm:block" />
          </section>

          <section id="topics" className="mt-8" aria-labelledby="topics-title"><div className="flex items-end justify-between"><div><p className="saathi-label text-primary">Explore</p><h2 id="topics-title" className="mt-2 text-2xl font-semibold tracking-tight">Browse by topic</h2></div><HelpCircle className="size-6 text-primary" /></div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{topics.map(({ icon: Icon, title, description, href }) => <Link key={title} href={href} className="group"><Card className="h-full rounded-[var(--saathi-radius-card)] p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--saathi-shadow-card)]"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" /></span><ArrowRight className="size-4 text-primary opacity-0 transition group-hover:opacity-100" /></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></Card></Link>)}</div></section>

          <section id="support" className="mt-8 flex flex-col gap-5 rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><LifeBuoy className="size-5" /></span><div><h2 className="font-semibold">Need more help?</h2><p className="mt-1 text-sm text-muted-foreground">Visit our help center or contact support.</p></div></div><Button asChild variant="outline"><Link href="mailto:support@saathi.app">Open support<ArrowRight className="size-4" /></Link></Button></section>
        </div>
      </div>
      <div className="mx-auto max-w-[1240px] px-4 pb-8 text-center text-xs text-muted-foreground sm:px-6 lg:px-8"><BookOpen className="mr-1 inline size-3.5" />Saathi keeps your work focused and your next step clear.</div>
    </main>
  )
}
