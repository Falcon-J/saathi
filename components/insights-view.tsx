"use client"

import { useEffect, useState } from "react"
import { Activity, BarChart3, CheckCircle2, Clock3, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { WorkspaceUsage } from "@/lib/usage"

export function InsightsView({ workspaceId, connected }: { workspaceId: string; connected: boolean }) {
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void fetch(`/api/usage?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { usage?: WorkspaceUsage; error?: string }
        if (!response.ok || !body.usage) throw new Error(body.error ?? "Unable to load insights")
        if (active) setUsage(body.usage)
      })
      .catch((caughtError) => { if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load insights") })
    return () => { active = false }
  }, [workspaceId])

  const cards = usage ? [
    { label: "Tasks created", value: usage.taskCreated, icon: CheckCircle2, tone: "text-primary" },
    { label: "Tasks completed", value: usage.taskCompleted, icon: Activity, tone: "text-[var(--saathi-success)]" },
    { label: "Members added", value: usage.memberAdded, icon: Users, tone: "text-primary" },
    { label: "Contributors", value: usage.contributors, icon: BarChart3, tone: "text-primary" },
  ] : []

  return <section className="space-y-5" aria-labelledby="insights-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="saathi-label text-primary">Workspace health</p><h2 id="insights-title" className="mt-2 text-3xl font-semibold tracking-tight">Realtime &amp; usage insights</h2><p className="mt-2 text-sm text-muted-foreground">Live activity, workspace usage, and system health for this workspace.</p></div><span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${connected ? "bg-[var(--saathi-success)]/10 text-[var(--saathi-success)]" : "bg-secondary text-muted-foreground"}`}><span className={`size-2 rounded-full ${connected ? "bg-[var(--saathi-success)]" : "bg-muted-foreground"}`} />{connected ? "Connected" : "Offline"}</span></div>
    {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="rounded-[var(--saathi-radius-card)]"><CardContent className="flex items-center gap-3 p-5"><span className={`grid size-10 place-items-center rounded-xl bg-accent ${tone}`}><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>)}</div><div className="grid gap-5 lg:grid-cols-2"><Card className="rounded-[var(--saathi-radius-card)]"><CardHeader><CardTitle className="text-lg">Workspace usage</CardTitle></CardHeader><CardContent className="space-y-5">{usage ? <><Metric label="Tasks" value={usage.taskCreated} max={Math.max(usage.taskCreated, 1)} /><Metric label="Members added" value={usage.memberAdded} max={Math.max(usage.memberAdded, 1)} /><Metric label="Contributors" value={usage.contributors} max={Math.max(usage.contributors, 1)} /></> : <p className="text-sm text-muted-foreground">Loading usage…</p>}</CardContent></Card><Card className="rounded-[var(--saathi-radius-card)]"><CardHeader><CardTitle className="text-lg">Recent activity</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3 rounded-lg bg-secondary/45 p-4 text-sm text-muted-foreground"><Clock3 className="size-5 text-primary" />Activity is sourced from the workspace event log.</div></CardContent></Card></div></>}
  </section>
}

function Metric({ label, value, max }: { label: string; value: number; max: number }) {
  return <div><div className="mb-2 flex items-center justify-between text-sm"><span>{label}</span><span className="font-medium">{value}</span></div><Progress value={Math.min((value / max) * 100, 100)} className="h-2" /></div>
}
