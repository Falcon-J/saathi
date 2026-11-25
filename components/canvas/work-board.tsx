"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusChip, type TaskState } from "@/components/ui/status-chip"
import { normalizeEmail } from "@/lib/identity"
import { formatTaskDue } from "@/lib/task-time"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/lib/task-contract"
import type { NextWorkItem, NextWorkResult, TaskDependency } from "@/lib/next-work"

type Lane = { id: "next" | "progress" | "waiting" | "done"; title: string; hint: string; state: TaskState }
const LANES: Lane[] = [
  { id: "next", title: "Up next", hint: "Nothing blocks these. Start at the top.", state: "ready" },
  { id: "progress", title: "In progress", hint: "Someone, or an agent, is on it.", state: "in_progress" },
  { id: "waiting", title: "Waiting", hint: "Each one names what it waits on.", state: "waiting" },
  { id: "done", title: "Done", hint: "Finished work unlocks the next task.", state: "done" },
]
const DONE_PREVIEW = 8

/**
 * The human view of a workspace: the same task graph, read as lanes.
 * Each card answers "can I start it, who has it, and what is it waiting on"
 * in words, so nobody has to trace arrows to know what to do next.
 */
export function WorkBoard({ workspace, tasks, dependencies, readiness, selectedTaskId, canCreate, busy, onInspect, onCreate }: {
  workspace: Workspace; tasks: readonly Task[]; dependencies: readonly TaskDependency[]; readiness: NextWorkResult<Task>
  selectedTaskId?: string | null; canCreate: boolean; busy: boolean
  onInspect: (id: string) => void; onCreate: () => void
}) {
  const [showAllDone, setShowAllDone] = useState(false)
  const lanes = useMemo(() => {
    const unblocks = new Map<string, number>()
    for (const edge of dependencies) unblocks.set(edge.prerequisiteTaskId, (unblocks.get(edge.prerequisiteTaskId) ?? 0) + 1)
    const items = new Map<string, NextWorkItem<Task>>()
    for (const item of [...readiness.ready, ...readiness.waiting, ...readiness.completedInconsistencies]) items.set(item.task.id, item)
    const open = (task: Task) => !task.completed && task.status !== "done"
    const next: Task[] = [], progress: Task[] = [], waiting: Task[] = [], done: Task[] = []
    for (const task of tasks) {
      if (!open(task)) done.push(task)
      else if (task.status === "in-progress") progress.push(task)
      else if (items.get(task.id)?.readiness === "waiting") waiting.push(task)
      else next.push(task)
    }
    // Ready order already reflects priority; unblocking more work breaks ties.
    const rank = new Map(readiness.ready.map((item, index) => [item.task.id, index]))
    next.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || (unblocks.get(b.id) ?? 0) - (unblocks.get(a.id) ?? 0))
    return { next, progress, waiting, done, unblocks, items }
  }, [tasks, dependencies, readiness])

  const who = (task: Task) => {
    if (!task.assigneeEmail) return null
    return workspace.members.find(member => normalizeEmail(member.email) === normalizeEmail(task.assigneeEmail ?? ""))?.username || task.assigneeEmail
  }
  const detail = (task: Task, lane: Lane["id"]) => {
    const parts: string[] = []
    if (lane === "waiting") {
      const blockers = lanes.items.get(task.id)?.prerequisites.filter(item => item.status !== "done").map(item => item.title) ?? []
      if (blockers.length) parts.push("Waits on " + (blockers.length > 2 ? `${blockers.slice(0, 2).join(", ")} +${blockers.length - 2}` : blockers.join(", ")))
    }
    const count = lanes.unblocks.get(task.id) ?? 0
    if (lane !== "done" && count > 0) parts.push(`Unblocks ${count}`)
    const person = who(task)
    if (person) parts.push(person)
    else if (lane === "next") parts.push("Unassigned")
    const due = lane !== "done" ? formatTaskDue(task.dueAt, task.dueDate, workspace.timezone) : null
    if (due) parts.push(due)
    return parts.join(" · ")
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
    <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
      {LANES.map(lane => {
        const list = lanes[lane.id]
        const visible = lane.id === "done" && !showAllDone ? list.slice(0, DONE_PREVIEW) : list
        return <section key={lane.id} aria-labelledby={`lane-${lane.id}`} data-lane={lane.id} className="flex min-w-0 flex-col gap-3">
          <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
            <h2 id={`lane-${lane.id}`} className="saathi-display text-lg">{lane.title}</h2>
            <span className="font-mono text-xs text-muted-foreground" aria-label={`${list.length} tasks`}>{list.length}</span>
          </header>
          <p className="text-xs text-muted-foreground">{lane.hint}</p>
          {lane.id === "next" && canCreate && <Button variant="outline" size="sm" className="justify-start" onClick={onCreate} disabled={busy}><Plus className="size-4" />New task</Button>}
          <ul className="flex flex-col gap-2">
            {visible.map(task => <li key={task.id}>
              <button type="button" data-task-card={task.id} aria-current={selectedTaskId === task.id ? "true" : undefined} disabled={busy} onClick={() => onInspect(task.id)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:border-primary disabled:opacity-60">
                <span className={"block break-words text-sm font-semibold " + (lane.id === "done" ? "text-muted-foreground line-through decoration-1" : "text-foreground")}>{task.title}</span>
                <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusChip state={lane.state} />
                  <span className="min-w-0 font-mono text-xs text-muted-foreground">{detail(task, lane.id)}</span>
                </span>
              </button>
            </li>)}
          </ul>
          {list.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{lane.id === "next" ? "Nothing is ready. Finish a waiting task's blockers to unlock it." : lane.id === "progress" ? "Nobody has started anything yet." : lane.id === "waiting" ? "Nothing is blocked." : "No finished work yet."}</p>}
          {lane.id === "done" && list.length > DONE_PREVIEW && <Button variant="ghost" size="sm" onClick={() => setShowAllDone(value => !value)}>{showAllDone ? "Show fewer" : `Show all ${list.length}`}</Button>}
        </section>
      })}
    </div>
  </section>
}
