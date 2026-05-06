import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Command,
  GitBranch,
  Lock,
  Radio,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

const liveEvents = [
  { user: "Asha", action: "moved API contract review", time: "now", tone: "cyan" },
  { user: "Rohan", action: "commented on deployment checklist", time: "18s", tone: "blue" },
  { user: "Meera", action: "approved workspace invite", time: "42s", tone: "violet" },
]

const boardColumns = [
  {
    title: "Design",
    count: 4,
    tasks: ["Command palette polish", "Permission matrix pass"],
  },
  {
    title: "Build",
    count: 7,
    tasks: ["Realtime task stream", "Notification fanout"],
  },
  {
    title: "Ship",
    count: 3,
    tasks: ["Load test SSE route", "Reviewer demo workspace"],
  },
]

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <SaathiLogo className="size-9" priority />
            <div>
              <p className="text-lg font-bold leading-none">Saathi</p>
              <p className="saathi-label text-muted-foreground">Realtime ops</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#workspace" className="hover:text-foreground">Workspace</a>
            <a href="#signals" className="hover:text-foreground">Signals</a>
            <a href="#security" className="hover:text-foreground">Security</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Start now
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative border-b border-border/60">
        <div className="saathi-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto grid min-h-[760px] max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm text-primary">
              <Radio className="size-4 animate-pulse" />
              Live collaboration engine online
            </div>
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
              Saathi
              <span className="block text-primary">High-performance task collaboration</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Run shared workspaces, task boards, member permissions, and realtime notifications in one dense command surface built for teams that move fast.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  Create workspace
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">
                  Open dashboard
                  <Command className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["<50ms", "local UI feedback"],
                ["SSE", "live task stream"],
                ["Role", "workspace control"],
              ].map(([value, label]) => (
                <div key={label} className="saathi-panel-soft rounded-lg p-4">
                  <p className="font-mono text-2xl font-semibold text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="workspace" className="flex items-center">
            <div className="saathi-panel w-full rounded-xl p-4">
              <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-4">
                <div>
                  <p className="saathi-label text-primary">Command center</p>
                  <h2 className="mt-1 text-2xl font-semibold">Launch Workspace</h2>
                </div>
                <div className="flex -space-x-2">
                  {["AS", "RN", "MK", "JV"].map((name) => (
                    <span key={name} className="grid size-9 place-items-center rounded-full border border-background bg-[var(--surface-high)] text-xs font-semibold">
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {boardColumns.map((column) => (
                      <div key={column.title} className="rounded-lg border border-border/70 bg-background/50 p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="saathi-label text-muted-foreground">{column.title}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">{column.count}</span>
                        </div>
                        <div className="space-y-2">
                          {column.tasks.map((task) => (
                            <div key={task} className="rounded-md border border-border/60 bg-card p-3 text-sm">
                              <div className="mb-2 h-1.5 w-10 rounded-full bg-primary/70" />
                              {task}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="size-4 text-primary" />
                        <span className="font-semibold">Realtime sync active</span>
                      </div>
                      <span className="saathi-label text-primary">99.9%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-background">
                      <div className="h-full w-[86%] rounded-full bg-primary" />
                    </div>
                  </div>
                </div>

                <aside className="space-y-3">
                  {liveEvents.map((event) => (
                    <div key={`${event.user}-${event.time}`} className="rounded-lg border border-border/70 bg-background/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{event.user}</span>
                        <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{event.action}</p>
                    </div>
                  ))}
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="signals" className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-4 lg:px-8">
        {[
          [Activity, "Activity feed", "Commit-style event history for every task and workspace change."],
          [Bell, "Notification center", "Invites, assignments, and status changes land in one triage panel."],
          [ShieldCheck, "Permissions", "Owner and member controls stay explicit at workspace level."],
          [GitBranch, "Project boards", "High-density boards expose progress without hiding metadata."],
        ].map(([Icon, title, body]) => {
          const TypedIcon = Icon as typeof Activity
          return (
            <div key={title as string} className="saathi-panel-soft rounded-lg p-5">
              <TypedIcon className="mb-4 size-5 text-primary" />
              <h3 className="font-semibold">{title as string}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body as string}</p>
            </div>
          )
        })}
      </section>

      <section id="security" className="border-t border-border/60 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-xl border border-border/70 bg-[var(--surface-low)] p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Lock className="mt-1 size-5 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Built around private team workspaces</h2>
              <p className="mt-1 text-sm text-muted-foreground">Session-aware dashboard access, member controls, and durable workspace state are already part of this app.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="size-4" />
            Production-ready UI direction
          </div>
        </div>
      </section>
    </main>
  )
}
