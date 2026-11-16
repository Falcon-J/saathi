"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NextWorkView } from "@/components/next-work-view"
import { normalizeEmail } from "@/lib/identity"
import { formatTaskDue } from "@/lib/task-time"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/lib/task-contract"
import type { NextWorkResult, TaskDependency } from "@/lib/next-work"
import type { CanvasReadiness } from "@/features/canvas/model"

export type TaskPanelGroup = CanvasReadiness | null
const labels: Record<CanvasReadiness, string> = { ready: "Ready", waiting: "Waiting", completed: "Done", completed_inconsistent: "Review" }

export function CanvasTaskPanel({ workspace, tasks, dependencies, readiness, selectedTask, group, onGroupChange, onInspect, onBack, onEdit, onCreate, onComplete,
  canCreate, canEdit, canComplete, busy, currentUserEmail, refreshSignal, onChanged }: {
  workspace: Workspace; tasks: readonly Task[]; dependencies: readonly TaskDependency[]; readiness: NextWorkResult<Task>
  selectedTask: Task | null; group: TaskPanelGroup; onGroupChange: (group: TaskPanelGroup) => void
  onInspect: (id: string) => void; onBack: () => void; onEdit: (id: string) => void; onCreate: () => void; onComplete: () => void
  canCreate: boolean; canEdit: boolean; canComplete: boolean; busy: boolean; currentUserEmail: string; refreshSignal: number; onChanged: () => Promise<unknown>
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(50)
  const [inspectingPrerequisites, setInspectingPrerequisites] = useState(false)
  const byId = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])
  const state = useMemo(() => {
    const result = new Map(tasks.map(task => [task.id, "completed" as CanvasReadiness]))
    for (const item of [...readiness.ready, ...readiness.waiting, ...readiness.completedInconsistencies]) result.set(item.task.id, item.readiness)
    return result
  }, [tasks, readiness])
  const assignee = (task: Task) => workspace.members.find(member => normalizeEmail(member.email) === normalizeEmail(task.assigneeEmail ?? ""))?.username || task.assigneeEmail || "Unassigned"
  const text = query.trim().toLocaleLowerCase()
  const filtered = tasks.filter(task => (!group || state.get(task.id) === group) && `${task.title} ${task.description ?? ""} ${assignee(task)}`.toLocaleLowerCase().includes(text))
  if (selectedTask) {
    const prerequisites = dependencies.filter(edge => edge.dependentTaskId === selectedTask.id).map(edge => byId.get(edge.prerequisiteTaskId)).filter((task): task is Task => Boolean(task))
    const dependents = dependencies.filter(edge => edge.prerequisiteTaskId === selectedTask.id).map(edge => byId.get(edge.dependentTaskId)).filter((task): task is Task => Boolean(task))
    const waiting = prerequisites.filter(task => !task.completed && task.status !== "done")
    return <section aria-label="Task summary" className="space-y-5 p-4">
      <div className="flex items-start justify-between gap-2"><h2 className="min-w-0 break-words text-xl font-semibold">{selectedTask.title}</h2><Button variant="ghost" size="sm" className="shrink-0" onClick={onBack}>All tasks</Button></div>
      <p className="text-sm text-muted-foreground">{labels[state.get(selectedTask.id) ?? "completed"]}</p>
      {selectedTask.description && <p className="whitespace-pre-wrap break-words text-sm">{selectedTask.description}</p>}
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 text-sm"><dt className="text-muted-foreground">Assignee</dt><dd className="break-words">{assignee(selectedTask)}</dd><dt className="text-muted-foreground">Due</dt><dd>{formatTaskDue(selectedTask.dueAt, selectedTask.dueDate, workspace.timezone) || "No date"}</dd></dl>
      {waiting.length > 0 && <section aria-label="Waiting for" className="space-y-2 rounded-lg bg-secondary p-3"><h4 className="text-sm font-medium">Waiting for</h4>{waiting.map(task => <Button key={task.id} variant="link" className="h-auto whitespace-normal p-0 text-left" aria-label={`Open prerequisite ${task.title}`} onClick={() => onInspect(task.id)}><span>{task.title}<span className="block text-xs text-foreground">{assignee(task)}</span></span></Button>)}</section>}
      {dependents.length > 0 && <section aria-label="Needed by" className="space-y-2"><h4 className="text-sm font-medium">Needed by</h4>{dependents.map(task => <Button key={task.id} variant="link" className="h-auto whitespace-normal p-0 text-left" aria-label={`Open dependent ${task.title}`} onClick={() => onInspect(task.id)}><span>{task.title}<span className="block text-xs text-foreground">{assignee(task)}</span></span></Button>)}</section>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onEdit(selectedTask.id)} disabled={busy}>{canEdit ? "Edit task" : "Details"}</Button>{canComplete && !selectedTask.completed && selectedTask.status !== "done" && <Button onClick={onComplete} disabled={busy} className="disabled:opacity-100">Mark done</Button>}</div>
      <details onToggle={event => setInspectingPrerequisites(event.currentTarget.open)}><summary className="cursor-pointer py-3 text-sm">Prerequisites</summary>{inspectingPrerequisites && <NextWorkView key={`${workspace.id}:${selectedTask.id}`} inspectorOnly initialTaskId={selectedTask.id} workspace={workspace} currentUserEmail={currentUserEmail} refreshSignal={refreshSignal} onOpenTask={onInspect} onChanged={onChanged} />}</details>
    </section>
  }
  return <section aria-label="Workspace tasks" className="space-y-3 p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">Tasks</h2>{canCreate && <Button size="sm" onClick={onCreate} disabled={busy}>New task</Button>}</div>
    <label className="sr-only" htmlFor="canvas-task-group">Filter tasks</label><select id="canvas-task-group" aria-label="Filter tasks" className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm" value={group ?? "all"} onChange={event => { setPage(50); onGroupChange(event.target.value === "all" ? null : event.target.value as CanvasReadiness) }}><option value="all">All tasks</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <Input aria-label="Search workspace tasks" placeholder="Search tasks" value={query} onChange={event => { setQuery(event.target.value); setPage(50) }} />
    <div className="divide-y divide-border">{filtered.slice(0, page).map(task => <Button key={task.id} variant="ghost" data-task-row={task.id} aria-label={`Open ${task.title}`} className="h-auto min-h-16 w-full justify-start whitespace-normal rounded-none px-1 py-3 text-left" disabled={busy} onClick={() => onInspect(task.id)}><span className="min-w-0"><span className="block break-words font-medium">{task.title}</span><span className="mt-1 block text-xs text-muted-foreground">{labels[state.get(task.id) ?? "completed"]} · {assignee(task)}</span></span></Button>)}</div>
    {filtered.length === 0 && <p role="status" className="py-4 text-sm text-muted-foreground">No matching tasks.</p>}
    {filtered.length > page && <Button variant="outline" className="w-full" onClick={() => setPage(value => value + 50)}>Show more tasks</Button>}
  </section>
}
