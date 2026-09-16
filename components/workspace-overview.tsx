"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, CalendarDays, Check, Circle, Clock3, Plus, Target } from "lucide-react"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { groupTasksForOverview } from "@/lib/task-overview"
import { formatCalendarDate, formatTaskDue, todayCalendarDate } from "@/lib/task-time"
import { ActivityHistory } from "@/components/activity-history"
import { WorkspaceAdvisor } from "@/components/workspace-advisor"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"

type WorkspaceOverviewProps = {
  workspace: Workspace
  tasks: Task[]
  loading: boolean
  onToggleTask: (taskId: string) => Promise<unknown>
  onOpenTask: (taskId: string) => void
  onAddTask: (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => Promise<unknown>
  onOpenBoard: () => void
  focusQuickAdd?: number
  title?: React.ReactNode
  commandBar?: React.ReactNode
  realtimeSignal?: number
}

function TaskRow({ task, onToggleTask, onOpenTask }: { task: Task; onToggleTask: (taskId: string) => Promise<unknown>; onOpenTask: (taskId: string) => void }) {
  const done = task.completed || task.status === "done"

  return (
    <div className="relative flex min-h-14 items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => void onToggleTask(task.id)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={`grid size-8 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${done ? "bg-[var(--saathi-success)]/12 text-[var(--saathi-success)]" : "text-muted-foreground hover:bg-secondary hover:text-primary"}`}
      >
        {done ? <Check className="size-4" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpenTask(task.id)}
          className={`text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-[15px] ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
          aria-label={`Open ${task.title} task`}
        >
          {task.title}
        </button>
        {(task.dueAt || task.dueDate || task.estimatedMinutes) && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {task.estimatedMinutes && <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{task.estimatedMinutes}m</span>}
            {formatTaskDue(task.dueAt, task.dueDate) && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatTaskDue(task.dueAt, task.dueDate)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskSection({ title, tasks, empty, onToggleTask, onOpenTask }: { title: string; tasks: Task[]; empty: string; onToggleTask: (taskId: string) => Promise<unknown>; onOpenTask: (taskId: string) => void }) {
  const headingId = `overview-${title.toLowerCase()}`
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 id={headingId} className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <p className="py-6 text-sm text-muted-foreground">{empty}</p>
        : tasks.map((task) => <TaskRow key={task.id} task={task} onToggleTask={onToggleTask} onOpenTask={onOpenTask} />)}
    </section>
  )
}

export function WorkspaceOverview({ workspace, tasks, loading, onToggleTask, onOpenTask, onAddTask, onOpenBoard, focusQuickAdd, title, commandBar, realtimeSignal }: WorkspaceOverviewProps) {
  const groups = groupTasksForOverview(tasks, todayCalendarDate(workspace.timezone))
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [addingTask, setAddingTask] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const quickAddInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusQuickAdd) quickAddInputRef.current?.focus()
  }, [focusQuickAdd])

  const handleQuickAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const titleValue = newTaskTitle.trim()
    if (!titleValue || addingTask) return

    setAddingTask(true)
    setAddError(null)
    const result = await onAddTask(titleValue)
    if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
      setAddError(result.error)
    } else {
      setNewTaskTitle("")
    }
    setAddingTask(false)
  }

  return (
    <section id="project-board" className="scroll-mt-32 rounded-[var(--saathi-radius-container)] border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary"><Target className="size-4" />Your progress</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-2xl font-bold tracking-tight sm:text-3xl">{title ?? workspace.name}</div>
              {workspace.targetAt && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Target {formatCalendarDate(workspace.targetAt, "UTC")}</span>}
            </div>
            {workspace.summary && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{workspace.summary}</p>}
          </div>
          <div className="w-full max-w-48">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Progress</span><span>{groups.completion}%</span></div>
            <Progress value={groups.completion} className="h-2" />
          </div>
        </div>
      </header>
      <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4"><p className="text-2xl font-semibold tracking-tight">{groups.today.length}</p><p className="mt-1 text-xs text-muted-foreground">Due today</p></div>
          <div className="rounded-xl border border-border bg-background p-4"><p className="text-2xl font-semibold tracking-tight">{groups.next.length}</p><p className="mt-1 text-xs text-muted-foreground">Coming next</p></div>
          <div className="rounded-xl border border-border bg-background p-4"><p className="text-2xl font-semibold tracking-tight">{groups.completed.length}</p><p className="mt-1 text-xs text-muted-foreground">Completed</p></div>
        </div>
        {isAiWorkspaceEnabled() && <WorkspaceAdvisor workspaceId={workspace.id} onAddTask={onAddTask} />}
        <form onSubmit={handleQuickAdd} className="rounded-xl border border-primary/20 bg-[var(--saathi-surface-wash)] p-4">
          <p className="mb-3 text-sm font-semibold">What needs to move forward?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Add something to do today"
              aria-label="New task title"
              ref={quickAddInputRef}
              maxLength={200}
              disabled={addingTask}
              className="bg-card"
            />
            <Button type="submit" disabled={!newTaskTitle.trim() || addingTask}>
              <Plus className="size-4" />{addingTask ? "Adding…" : "Add task"}
            </Button>
          </div>
          {addError && <p role="alert" className="mt-2 text-sm text-destructive">{addError}</p>}
        </form>
        {loading ? (
          <div role="status" className="space-y-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-secondary" />)}
          </div>
        ) : (
          <>
            <TaskSection title="Today" tasks={groups.today} empty="Nothing needs your attention today." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
            <TaskSection title="Next" tasks={groups.next} empty="Future work will appear here when it has a later date." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
            <TaskSection title="Completed" tasks={groups.completed} empty="Completed work will collect here." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
          </>
        )}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/35 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Need task details?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Use Board for status, priority, due dates, assignees, search, and CSV import.</p>
          </div>
          <Button type="button" variant="outline" onClick={onOpenBoard} className="shrink-0 bg-card">
            Open Board <ArrowRight className="size-4" />
          </Button>
        </div>
        {commandBar}
        <ActivityHistory workspaceId={workspace.id} refreshSignal={realtimeSignal} />
      </div>
    </section>
  )
}
