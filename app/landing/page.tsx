import Link from "next/link"
import { ArrowRight, CheckCircle2, ListChecks, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

const boardColumns = [
  {
    title: "To do",
    tone: "border-t-[#007aff]",
    tasks: ["Shape the launch plan", "Write onboarding copy"],
  },
  {
    title: "In progress",
    tone: "border-t-[#ff9f0a]",
    tasks: ["Design the first flow", "Invite the team"],
  },
  {
    title: "Done",
    tone: "border-t-[#34c759]",
    tasks: ["Set up the workspace", "Define the first milestone"],
  },
]

const benefits = [
  { icon: UsersRound, title: "Work together", copy: "Keep ownership and the next step visible to everyone." },
  { icon: ListChecks, title: "Stay focused", copy: "Use a small board to turn plans into clear work." },
  { icon: CheckCircle2, title: "Move with confidence", copy: "See progress without adding process overhead." },
]

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
            <Link href="#product" className="hover:text-foreground">Product</Link><Link href="#features" className="hover:text-foreground">Features</Link><span className="cursor-not-allowed text-muted-foreground/60" aria-disabled="true" title="Pricing is not available yet">Pricing</span><Link href="/guide" className="hover:text-foreground">About</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-foreground"><Link href="/login">Sign in</Link></Button>
            <Button asChild className="hidden rounded-full sm:inline-flex"><Link href="/register">Get started <span className="sr-only">Create an account</span></Link></Button>
          </div>
        </div>
      </header>

      <section id="product" className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="max-w-xl">
          <p className="saathi-label text-primary">From intention to execution</p>
          <p className="sr-only">Move work forward. A focused workspace for teams that build together.</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em] text-foreground sm:text-6xl lg:text-7xl">
            A better way<br />to work <span className="text-primary">together.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground sm:text-xl">
            Saathi is an outcome driven collaborative workspace for individuals and teams. Plan, assign, track and ship — all in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/register">Get started for free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Start with one workspace, one board, and the work that matters now.</p>
        </div>

        <section className="relative overflow-hidden rounded-[var(--saathi-radius-container)] border border-border bg-card/70 p-3 shadow-[0_12px_32px_rgb(29_29_31/0.08)] sm:p-5" aria-label="Saathi board preview">
          <div className="relative z-10">
          <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <SaathiLogo className="size-8" />
              <div>
                <p className="font-semibold">Product launch</p>
                <p className="text-xs text-muted-foreground">A shared board for your team</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--saathi-success)]">
              <span className="size-2 rounded-full bg-[var(--saathi-success)]" />
              Live
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {boardColumns.map((column) => (
              <article key={column.title} className={`min-w-0 rounded-[var(--saathi-radius-card)] border border-border border-t-[3px] ${column.tone} bg-background p-3`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{column.tasks.length}</span>
                </div>
                <div className="space-y-2">
                  {column.tasks.map((task, index) => (
                    <div key={task} className="rounded-[var(--saathi-radius-control)] border border-border bg-card p-3 text-sm shadow-[0_1px_2px_rgb(29_29_31/0.04)]">
                      <div className="flex items-start gap-2">
                        {column.title === "Done" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--saathi-success)]" /> : <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border" />}
                        <span>{task}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{index === 0 ? "Today" : "This week"}</span>
                        <span className="size-5 rounded-full bg-secondary" aria-hidden="true" />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div></div>
        </section>
      </section>

      <section id="features" className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          {benefits.map(({ icon: Icon, title, copy }) => (
            <article key={title} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
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
