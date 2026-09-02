"use client"

import { useState } from "react"
import { CalendarDays, Check, Circle, Clock3, Plus } from "lucide-react"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { groupTasksForOverview } from "@/lib/task-overview"

type WorkspaceOverviewProps = {
  workspace: Workspace
  tasks: Task[]
  loading: boolean
  onToggleTask: (taskId: string) => Promise<unknown>
  onAddTask: (title: string) => Promise<unknown>
  title?: React.ReactNode
  commandBar?: React.ReactNode
}

function displayDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
}

function TaskRow({ task, onToggleTask }: { task: Task; onToggleTask: (taskId: string) => Promise<unknown> }) {
  const done = task.completed || task.status === "done"
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => void onToggleTask(task.id)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={`grid size-8 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${done ? "bg-[var(--saathi-success)]/12 text-[var(--saathi-success)]" : "text-muted-foreground hover:bg-secondary hover:text-primary"}`}
      >
        {done ? <Check className="size-4" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium sm:text-[15px] ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</p>
        {(task.dueDate || task.estimatedMinutes) && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {task.estimatedMinutes && <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{task.estimatedMinutes}m</span>}
            {task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{displayDate(task.dueDate)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskSection({ title, tasks, empty, onToggleTask }: { title: string; tasks: Task[]; empty: string; onToggleTask: (taskId: string) => Promise<unknown> }) {
  const headingId = `overview-${title.toLowerCase()}`
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 id={headingId} className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <p className="py-6 text-sm text-muted-foreground">{empty}</p>
        : tasks.map((task) => <TaskRow key={task.id} task={task} onToggleTask={onToggleTask} />)}
    </section>
  )
}

export function WorkspaceOverview({ workspace, tasks, loading, onToggleTask, onAddTask, title, commandBar }: WorkspaceOverviewProps) {
  const groups = groupTasksForOverview(tasks)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [addingTask, setAddingTask] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl font-bold tracking-tight sm:text-3xl">{title ?? workspace.name}</div>
              {workspace.targetDate && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Target {displayDate(workspace.targetDate)}</span>}
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
        <form onSubmit={handleQuickAdd} className="rounded-lg border border-border bg-secondary/35 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Add something to do today"
              aria-label="New task title"
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
            <TaskSection title="Today" tasks={groups.today} empty="Nothing needs your attention today." onToggleTask={onToggleTask} />
            <TaskSection title="Next" tasks={groups.next} empty="Future work will appear here when it has a later date." onToggleTask={onToggleTask} />
            <TaskSection title="Completed" tasks={groups.completed} empty="Completed work will collect here." onToggleTask={onToggleTask} />
          </>
        )}
        {commandBar}
      </div>
    </section>
  )
}
