"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusChip, type TaskState } from "@/components/ui/status-chip"
import { normalizeEmail } from "@/lib/identity"
import { formatTaskDue } from "@/lib/task-time"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/lib/task-contract"
import type { NextWorkItem, NextWorkResult, TaskDependency } from "@/lib/next-work"
import { getAgentActivity } from "@/app/actions/coordination"
import { initials } from "./workspace-sidebar"

type Lane = { id: "next" | "progress" | "review" | "waiting" | "done"; title: string; hint: string; state: TaskState; empty: string }
const LANES: Lane[] = [
  { id: "next", title: "Up next", hint: "Nothing blocks these. Start at the top.", state: "ready", empty: "Nothing is ready. Finish a waiting task's blockers to unlock it." },
  { id: "progress", title: "In progress", hint: "Someone, or an agent, is on it.", state: "in_progress", empty: "Nobody has started anything yet." },
  { id: "review", title: "Needs review", hint: "Agent work waiting for your call.", state: "awaiting_review", empty: "No agent work is waiting for you." },
  { id: "waiting", title: "Waiting", hint: "Each one names what it waits on.", state: "waiting", empty: "Nothing is blocked." },
  { id: "done", title: "Done", hint: "Finished work unlocks the next task.", state: "done", empty: "No finished work yet." },
]
const PRIORITY: Record<Task["priority"], string> = { high: "High", medium: "Medium", low: "Low" }
const DONE_PREVIEW = 8

/**
 * The human view of a workspace: the same task graph, read as lanes.
 * Each card answers "can I start it, who has it, and what is it waiting on"
 * in words, so nobody has to trace arrows to know what to do next.
 */
export function WorkBoard({ workspace, tasks, dependencies, readiness, selectedTaskId, canCreate, busy, refreshSignal = 0, onInspect, onCreate, onReview }: {
  workspace: Workspace; tasks: readonly Task[]; dependencies: readonly TaskDependency[]; readiness: NextWorkResult<Task>
  selectedTaskId?: string | null; canCreate: boolean; busy: boolean; refreshSignal?: number
  onInspect: (id: string) => void; onCreate: () => void; onReview?: () => void
}) {
  const [showAllDone, setShowAllDone] = useState(false)
  // Agent hand-backs live on runs, not tasks. A task with a run awaiting review moves to its own lane.
  const [review, setReview] = useState<{ workspaceId: string; runs: Map<string, string> } | null>(null)
  useEffect(() => {
    let current = true
    void getAgentActivity(workspace.id).then(result => {
      if (!current || !result.runs) return
      const runs = new Map<string, string>()
      for (const run of result.runs) if (run.state === "awaiting_review" && run.task?.id) runs.set(run.task.id, run.clientId || "An agent")
      setReview({ workspaceId: workspace.id, runs })
    }).catch(() => { /* The lane stays empty; the Agents panel reports load errors. */ })
    return () => { current = false }
  }, [workspace.id, refreshSignal])
  const reviewRuns = review?.workspaceId === workspace.id ? review.runs : null
  const lanes = useMemo(() => {
    const unblocks = new Map<string, number>()
    for (const edge of dependencies) unblocks.set(edge.prerequisiteTaskId, (unblocks.get(edge.prerequisiteTaskId) ?? 0) + 1)
    const items = new Map<string, NextWorkItem<Task>>()
    for (const item of [...readiness.ready, ...readiness.waiting, ...readiness.completedInconsistencies]) items.set(item.task.id, item)
    const open = (task: Task) => !task.completed && task.status !== "done"
    const next: Task[] = [], progress: Task[] = [], review: Task[] = [], waiting: Task[] = [], done: Task[] = []
    for (const task of tasks) {
      if (!open(task)) done.push(task)
      else if (reviewRuns?.has(task.id)) review.push(task)
      else if (task.status === "in-progress") progress.push(task)
      else if (items.get(task.id)?.readiness === "waiting") waiting.push(task)
      else next.push(task)
    }
    // Ready order already reflects priority; unblocking more work breaks ties.
    const rank = new Map(readiness.ready.map((item, index) => [item.task.id, index]))
    next.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || (unblocks.get(b.id) ?? 0) - (unblocks.get(a.id) ?? 0))
    return { next, progress, review, waiting, done, unblocks, items }
  }, [tasks, dependencies, readiness, reviewRuns])

  const who = (task: Task) => {
    if (!task.assigneeEmail) return null
    return workspace.members.find(member => normalizeEmail(member.email) === normalizeEmail(task.assigneeEmail ?? ""))?.username || task.assigneeEmail
  }
  const note = (task: Task, lane: Lane["id"]) => {
    if (lane === "review") return `${reviewRuns?.get(task.id) ?? "An agent"} handed this back`
    if (lane !== "waiting") return null
    const blockers = lanes.items.get(task.id)?.prerequisites.filter(item => item.status !== "done").map(item => item.title) ?? []
    return blockers.length ? "Waits on " + (blockers.length > 2 ? `${blockers.slice(0, 2).join(", ")} +${blockers.length - 2}` : blockers.join(", ")) : null
  }

  if (tasks.length === 0) return <section aria-label="Workspace board" className="grid h-full place-items-center p-6">
    <div className="max-w-md space-y-4 text-center">
      <p className="saathi-label text-muted-foreground">Empty workspace</p>
      <h2 className="saathi-display text-2xl">Add the first task</h2>
      <p className="text-sm leading-6 text-muted-foreground">Write each piece of work as a task, then say what waits on what. Saathi works out what can start now, for you and for your agents.</p>
      {canCreate && <Button onClick={onCreate} disabled={busy}><Plus className="size-4" />New task</Button>}
    </div>
  </section>

  return <section aria-label="Workspace board" className="h-full overflow-y-auto">
    <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(12rem,1fr))]">
      {LANES.map(lane => {
        const list = lanes[lane.id]
        const visible = lane.id === "done" && !showAllDone ? list.slice(0, DONE_PREVIEW) : list
        return <section key={lane.id} aria-labelledby={`lane-${lane.id}`} data-lane={lane.id} className="flex min-w-0 flex-col gap-3">
          <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
            <h2 id={`lane-${lane.id}`} className="saathi-display text-lg">{lane.title}</h2>
            <span className="font-mono text-xs text-muted-foreground" aria-label={`${list.length} tasks`}>{list.length}</span>
          </header>
          <p className="text-xs text-muted-foreground">{lane.hint}</p>
          {lane.id === "review" && onReview && list.length > 0 && <Button variant="outline" size="sm" className="justify-start" onClick={onReview} disabled={busy}><Bot className="size-4" />Review in Agent runs</Button>}
          <ul className="flex flex-col gap-2">
            {visible.map(task => {
              const person = who(task), count = lane.id === "done" ? 0 : lanes.unblocks.get(task.id) ?? 0, detail = note(task, lane.id)
              const due = lane.id !== "done" ? formatTaskDue(task.dueAt, task.dueDate, workspace.timezone) : null
              return <li key={task.id}>
                <button type="button" data-task-card={task.id} aria-current={selectedTaskId === task.id ? "true" : undefined} disabled={busy} onClick={() => onInspect(task.id)}
                  className="flex w-full flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:border-primary disabled:opacity-60">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusChip state={lane.state} />
                    {lane.id !== "done" && task.priority === "high" && <span className="inline-flex h-6 items-center rounded-[var(--saathi-radius-label)] bg-[var(--saathi-danger-soft)] px-2 font-mono text-xs text-[var(--saathi-danger)]">{PRIORITY.high}</span>}
                    {lane.id === "review" && <span className="inline-flex h-6 items-center gap-1 rounded-[var(--saathi-radius-label)] bg-muted px-2 font-mono text-xs text-foreground"><Bot className="size-3" aria-hidden="true" />Agent</span>}
                    {count > 0 && <span className="font-mono text-xs text-muted-foreground">Unblocks {count}</span>}
                  </span>
                  <span className={"block break-words text-sm font-semibold leading-5 " + (lane.id === "done" ? "text-muted-foreground line-through decoration-1" : "text-foreground")}>{task.title}</span>
                  {detail && <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>}
                  <span className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {person ? <><span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground">{initials(person)}</span><span className="truncate">{person}</span></>
                        : lane.id === "next" ? <span>Unassigned</span> : null}
                    </span>
                    {due && <span className="shrink-0">{due}</span>}
                  </span>
                </button>
              </li>
            })}
          </ul>
          {list.length === 0 && <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">{lane.empty}</p>}
          {lane.id === "done" && list.length > DONE_PREVIEW && <Button variant="ghost" size="sm" onClick={() => setShowAllDone(value => !value)}>{showAllDone ? "Show fewer" : `Show all ${list.length}`}</Button>}
        </section>
      })}
    </div>
  </section>
}
