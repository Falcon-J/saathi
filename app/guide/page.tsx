import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleHelp,
  KanbanSquare,
  ListChecks,
  LockKeyhole,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react"
import { SaathiLogo } from "@/components/saathi-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { getAssistantGuide } from "@/lib/product-guide"

export const metadata: Metadata = {
  title: "How Saathi works",
  description: "Learn how to plan work, collaborate, and use the optional Saathi assistant.",
}

const assistantActions: Record<string, { title: string; description: string }> = {
  plan_workspace: { title: "Plan a workspace", description: "Turn one outcome into a focused workspace with 3–8 useful first steps." },
  add_task: { title: "Add a task", description: "Create one new task in the workspace you currently have open." },
  complete_task: { title: "Complete a task", description: "Mark one existing task complete using its current workspace context." },
  move_task: { title: "Move work", description: "Move one task between Today and Next so attention stays intentional." },
  rename_workspace: { title: "Rename the workspace", description: "Give the current workspace a clearer outcome-oriented name." },
}

const assistantLimits: Record<string, string> = {
  delete_content: "It will not delete tasks or workspaces.",
  manage_members: "It will not invite or remove workspace members.",
  assign_tasks: "It will not assign work to people.",
  run_multiple_changes: "Each instruction performs one supported change at a time.",
}

const workspaceSteps = [
  { icon: Sparkles, title: "Start with an outcome", description: "Create a workspace manually, or describe the result you want when the optional assistant is enabled." },
  { icon: ListChecks, title: "Focus on what is next", description: "Overview keeps Today, Next, and Completed visible without turning every visit into board administration." },
  { icon: KanbanSquare, title: "Use Board for detail", description: "Open Board when you need status, priority, due dates, ownership, search, import, or deletion." },
  { icon: Users, title: "Move together", description: "Invite members and receive live workspace updates through the existing Redis and SSE collaboration flow." },
]

export default function GuidePage() {
  const assistant = getAssistantGuide(isAiWorkspaceEnabled())
  const aiAvailable = assistant.availability === "available"

  return (
    <main className="saathi-dashboard min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <div><p className="font-semibold leading-none">Saathi</p><p className="mt-1 text-xs text-muted-foreground">Product guide</p></div>
          </Link>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard"><ArrowLeft className="size-4" />Back to workspace</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-3xl">
          <Badge variant="outline" className="bg-card"><CircleHelp className="mr-1.5 size-3.5 text-primary" />Available anytime</Badge>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">Know what Saathi can do.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Saathi keeps execution simple: decide the outcome, focus on today, and open the full board only when you need more control.
          </p>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2" aria-labelledby="core-flow-title">
          <h2 id="core-flow-title" className="sr-only">Core workflow</h2>
          {workspaceSteps.map(({ icon: Icon, title, description }, index) => (
            <Card key={title} className="rounded-[var(--saathi-radius-card)] p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step {index + 1}</p><h3 className="mt-1 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>
              </div>
            </Card>
          ))}
        </section>

        <section className="mt-12 overflow-hidden rounded-[var(--saathi-radius-container)] border border-border bg-card shadow-sm" aria-labelledby="assistant-title">
          <div className="border-b border-border bg-secondary/40 px-5 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></div><div><h2 id="assistant-title" className="text-2xl font-bold">Chat with the Saathi assistant</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The assistant translates plain-language intent into one bounded workspace change. Redis remains the source of truth.</p></div></div>
              <Badge className={aiAvailable ? "w-fit bg-[var(--saathi-success)] text-white" : "w-fit bg-secondary text-secondary-foreground"}>{aiAvailable ? "Available" : "Optional · currently off"}</Badge>
            </div>
          </div>

          <div className="grid gap-8 px-5 py-7 sm:px-8 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">What it can do</h3>
              <div className="mt-4 space-y-4">
                {assistant.supportedActionIds.map((actionId) => {
                  const action = assistantActions[actionId]
                  return <div key={actionId} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--saathi-success)]" /><div><p className="text-sm font-medium">{action.title}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{action.description}</p></div></div>
                })}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Intentional limits</h3>
              <div className="mt-4 space-y-3">
                {assistant.unsupportedActionIds.map((actionId) => <div key={actionId} className="flex gap-3 text-sm text-muted-foreground"><XCircle className="mt-0.5 size-4 shrink-0" /><span>{assistantLimits[actionId]}</span></div>)}
              </div>
              <div className="mt-6 rounded-lg border border-border bg-secondary/45 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4 text-primary" />What is shared with Groq</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">For planning: your goal text. For a command: workspace ID and name, plus compact task IDs, titles, statuses, and Today/Next buckets. Passwords, session cookies, Redis credentials, and member email addresses are not included.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-5 py-5 sm:px-8">
            <p className="text-sm font-medium">Try requests like:</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground"><span className="rounded-full bg-secondary px-3 py-1.5">“Add a task to draft the launch brief”</span><span className="rounded-full bg-secondary px-3 py-1.5">“Move the metrics review to Next”</span><span className="rounded-full bg-secondary px-3 py-1.5">“Mark the release checklist complete”</span></div>
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-4 rounded-[var(--saathi-radius-container)] bg-[#1d1d1f] px-6 py-7 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div><h2 className="text-xl font-semibold">Ready to move work forward?</h2><p className="mt-1 text-sm text-white/65">Return to your workspace and start with one clear next action.</p></div>
          <Button asChild className="w-fit bg-white text-[#1d1d1f] hover:bg-white/90"><Link href="/dashboard">Open workspace<ArrowRight className="size-4" /></Link></Button>
        </section>
      </div>
    </main>
  )
}
