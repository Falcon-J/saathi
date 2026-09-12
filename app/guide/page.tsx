import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Database,
  FileText,
  Grid2X2,
  List,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Target,
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
  summarize_workspace: { title: "Summarize the workspace", description: "Turn the current workspace context into a concise progress summary." },
  identify_attention: { title: "Find attention items", description: "Surface tasks that may need attention from their current status and timing." },
  draft_task: { title: "Draft a task", description: "Suggest one task with a title, details, priority, timing, and estimate for your review." },
}

const assistantLimits: Record<string, string> = {
  autonomous_mutation: "It will not change tasks or workspaces without your review and confirmation.",
  manage_members: "It will not invite or remove workspace members.",
  assign_tasks: "It will not assign work to people.",
  store_content: "Raw prompts, workspace context, and model responses are not stored by default.",
}

const workflowSteps = [
  { number: "01", icon: Target, title: "Start with an outcome", description: "Create a workspace manually, or describe the result you want when the optional assistant is enabled." },
  { number: "02", icon: List, title: "Focus on what is next", description: "Overview keeps Today, Next, and Completed visible without turning every visit into board administration." },
  { number: "03", icon: Grid2X2, title: "Use Board for detail", description: "Open Board when you need status, priority, due dates, ownership, search, import, or deletion." },
  { number: "04", icon: Users, title: "Move together", description: "Invite members and receive live workspace updates through the existing Redis and SSE collaboration flow." },
]

const requestExamples = [
  "What should we focus on next?",
  "Which tasks need attention?",
  "Draft a task for the launch brief",
]

export default function GuidePage() {
  const assistant = getAssistantGuide(isAiWorkspaceEnabled())
  const aiAvailable = assistant.availability === "available"

  return (
    <main className="saathi-shell min-h-screen bg-[#f7f7f4] text-[#12203a]">
      <header className="relative z-20">
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>
          <Button asChild variant="outline" size="sm" className="rounded-full bg-white/80">
            <Link href="/dashboard"><ArrowLeft className="size-4" />Back to workspace</Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e5e8e3]">
        <div className="absolute inset-0 hidden md:block">
          <Image src="/saathi-guide-hero.png" alt="" fill priority sizes="100vw" className="object-cover object-center" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f7f7f4] via-[#f7f7f4]/90 to-transparent md:w-[58%]" />
        </div>
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-5 pb-8 pt-8 sm:px-8 sm:pb-12 sm:pt-12 md:min-h-[340px] md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:gap-10 md:pb-16 md:pt-12 lg:min-h-[400px]">
          <div className="max-w-[31rem]">
            <p className="saathi-label text-primary">Product guide</p>
            <h1 className="mt-5 max-w-[25rem] text-5xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-6xl">
              Know what Saathi <span className="text-primary">can do.</span>
            </h1>
            <p className="mt-5 max-w-[28rem] text-base leading-7 text-[#53627a] sm:text-lg">
              Saathi keeps execution simple: decide the outcome, focus on today, and open the full board only when you need more control.
            </p>
          </div>
          <div className="relative h-64 overflow-hidden rounded-[2rem] border border-[#dce4dd] bg-[#e9f0e9] md:hidden">
            <Image src="/saathi-guide-hero.png" alt="A teammate reviewing a simple task board" fill sizes="calc(100vw - 2.5rem)" className="object-cover object-[66%_center]" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="core-flow-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="saathi-label text-primary">How Saathi works</p>
            <h2 id="core-flow-title" className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Core workflow</h2>
          </div>
          <p className="text-sm text-[#53627a]">A simple flow from outcome to progress.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map(({ number, icon: Icon, title, description }, index) => (
            <div key={title} className="relative">
              <Card className="h-full rounded-2xl border-[#dfe6e1] bg-white/65 p-5 shadow-none sm:p-6">
                <p className="text-xl font-semibold text-primary">{number}</p>
                <Icon className="mt-4 size-8 text-primary" strokeWidth={1.8} />
                <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#53627a]">{description}</p>
              </Card>
              {index < workflowSteps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 text-primary/60 lg:block" />}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-12 sm:px-8 sm:pb-16" aria-labelledby="assistant-title">
        <div>
          <p className="saathi-label text-primary">Your AI partner</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 id="assistant-title" className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Use the Saathi assistant</h2>
            <Badge className={aiAvailable ? "bg-[#e4f5e9] text-[#087c55] hover:bg-[#e4f5e9]" : "bg-[#ecefea] text-[#53627a] hover:bg-[#ecefea]"}>
              <span className={aiAvailable ? "mr-1.5 size-2 rounded-full bg-[#14a56f]" : "mr-1.5 size-2 rounded-full bg-[#8a958d]"} />
              {aiAvailable ? "Available" : "Optional · currently off"}
            </Badge>
          </div>
          <p className="mt-3 max-w-4xl text-base leading-7 text-[#53627a] sm:text-lg">
            The assistant provides grounded summaries, attention signals, and reviewable task drafts. Your workspace remains the source of truth, and approved changes stay visible to the team.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card id="assistant-actions" className="rounded-2xl border-0 bg-[#edf5f0] p-5 shadow-none sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-5 text-primary" />What it can do</h3>
            <div className="mt-5 space-y-2">
              {assistant.supportedActionIds.map((actionId) => {
                const action = assistantActions[actionId]
                return (
                  <div key={actionId} className="flex gap-3 rounded-xl bg-white/80 p-4">
                    <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p className="text-sm font-semibold">{action.title}</p><p className="mt-1 text-sm leading-5 text-[#53627a]">{action.description}</p></div>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card id="assistant-limits" className="rounded-2xl border-[#dfe6e1] bg-white/65 p-5 shadow-none sm:p-6">
              <h3 className="flex items-center gap-2 text-base font-semibold"><LockKeyhole className="size-5 text-primary" />Intentional limits</h3>
              <div className="mt-5 space-y-3">
                {assistant.unsupportedActionIds.map((actionId) => <div key={actionId} className="flex gap-3 text-sm leading-5 text-[#53627a]"><XCircle className="mt-0.5 size-4 shrink-0 text-[#e45c50]" /><span>{assistantLimits[actionId]}</span></div>)}
              </div>
            </Card>
            <Card className="rounded-2xl border-0 bg-[#edf5f0] p-5 shadow-none sm:p-6">
              <h3 className="flex items-center gap-2 text-base font-semibold"><Database className="size-5 text-primary" />What the assistant receives</h3>
              <ul className="mt-4 space-y-2 text-sm leading-5 text-[#53627a]">
                <li className="flex gap-2"><span className="text-primary">•</span><span>For planning: your goal text.</span></li>
                <li className="flex gap-2"><span className="text-primary">•</span><span>For advice: workspace name, summary, and compact task details.</span></li>
                <li className="flex gap-2"><span className="text-primary">•</span><span>Passwords, session cookies, credentials, and member email addresses are not included.</span></li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-12 sm:px-8 sm:pb-16" aria-labelledby="request-title">
        <p className="saathi-label text-primary">Try it yourself</p>
        <h2 id="request-title" className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Try requests like:</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {requestExamples.map((request) => <span key={request} className="inline-flex items-center gap-2 rounded-full border border-[#dfe6e1] bg-white/75 px-4 py-2.5 text-sm text-[#53627a]"><MessageCircle className="size-4 text-primary" />{request}</span>)}
        </div>
      </section>

      <section className="relative mx-5 mb-8 overflow-hidden rounded-[2rem] bg-[#edf1e9] sm:mx-8 lg:mx-auto lg:max-w-[1240px]">
        <div className="relative z-10 max-w-2xl px-6 py-8 sm:px-8 sm:py-10">
          <p className="saathi-label text-primary">Get back to work</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Ready to move work forward?</h2>
          <p className="mt-2 text-base text-[#53627a]">Return to your workspace and start with one clear next action.</p>
          <Button asChild className="mt-6 rounded-full"><Link href="/dashboard">Open workspace <ArrowRight className="size-4" /></Link></Button>
        </div>
        <div className="absolute -right-10 -top-16 hidden size-80 rounded-full bg-[#d9e7dc] lg:block" />
        <div className="absolute bottom-0 right-16 hidden h-36 w-28 rounded-t-[2rem] bg-[#c3d7c8] lg:block" />
        <div className="absolute bottom-0 right-36 hidden h-24 w-24 rounded-t-[1.5rem] bg-white/70 lg:block" />
      </section>
    </main>
  )
}
