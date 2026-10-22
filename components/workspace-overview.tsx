"use client"

import { ArrowRight, CalendarDays, Check, Circle, Clock3, Target } from "lucide-react"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { TaskQuickAdd } from "@/components/task-quick-add"
import { Progress } from "@/components/ui/progress"
import { groupTasksForOverview } from "@/lib/task-overview"
import { formatCalendarDate, formatTaskDue, todayCalendarDate } from "@/lib/task-time"
import { useTaskPermissions } from "@/hooks/usePermissions"

type WorkspaceOverviewProps = {
  workspace: Workspace
  currentUserEmail: string
  tasks: Task[]
  loading: boolean
  onToggleTask: (taskId: string) => Promise<unknown>
  onOpenTask: (taskId: string) => void
  onAddTask: (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => Promise<unknown>
  onOpenBoard: () => void
  onReviewBoard: () => Promise<void>
  focusQuickAdd?: number
  title?: React.ReactNode
  commandBar?: React.ReactNode
}

function TaskRow({ task, timeZone, workspace, currentUserEmail, onToggleTask, onOpenTask }: { task: Task; timeZone: string; workspace: Workspace; currentUserEmail: string; onToggleTask: (taskId: string) => Promise<unknown>; onOpenTask: (taskId: string) => void }) {
  const done = task.completed || task.status === "done"
  const permissions = useTaskPermissions(currentUserEmail, workspace, task)

  return (
    <div className="relative flex min-h-14 items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
      <button
        type="button"
        disabled={!permissions.canToggle}
        onClick={() => { if (permissions.canToggle) void onToggleTask(task.id) }}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={`grid size-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${done ? "bg-[var(--saathi-success)]/12 text-[var(--saathi-success)]" : "text-muted-foreground hover:bg-secondary hover:text-primary"}`}
      >
        {done ? <Check className="size-4" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpenTask(task.id)}
          className={`max-w-full break-words text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-[15px] ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
          aria-label={`Open ${task.title} task`}
        >
          {task.title}
        </button>
        {(task.dueAt || task.dueDate || task.estimatedMinutes) && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {task.estimatedMinutes && <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{task.estimatedMinutes}m</span>}
            {formatTaskDue(task.dueAt, task.dueDate, timeZone) && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{formatTaskDue(task.dueAt, task.dueDate, timeZone)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskSection({ title, tasks, timeZone, workspace, currentUserEmail, empty, onToggleTask, onOpenTask }: { title: string; tasks: Task[]; timeZone: string; workspace: Workspace; currentUserEmail: string; empty: string; onToggleTask: (taskId: string) => Promise<unknown>; onOpenTask: (taskId: string) => void }) {
  const headingId = `overview-${title.toLowerCase()}`
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 id={headingId} className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <p className="py-6 text-sm text-muted-foreground">{empty}</p>
        : tasks.map((task) => <TaskRow key={task.id} task={task} timeZone={timeZone} workspace={workspace} currentUserEmail={currentUserEmail} onToggleTask={onToggleTask} onOpenTask={onOpenTask} />)}
    </section>
  )
}

export function WorkspaceOverview({ workspace, currentUserEmail, tasks, loading, onToggleTask, onOpenTask, onAddTask, onOpenBoard, onReviewBoard, focusQuickAdd, title, commandBar }: WorkspaceOverviewProps) {
  const groups = groupTasksForOverview(tasks, todayCalendarDate(workspace.timezone), workspace.timezone)
  return (
    <section id="project-board" aria-busy={loading} className="scroll-mt-32 rounded-[var(--saathi-radius-container)] border border-border bg-card shadow-sm">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary"><Target className="size-4" />Your progress</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {title}
              {workspace.targetAt && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Target {formatCalendarDate(workspace.targetAt, "UTC")}</span>}
            </div>
            {workspace.summary && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{workspace.summary}</p>}
          </div>
          {!loading && <div className="w-full max-w-48">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Progress</span><span>{groups.completion}%</span></div>
            <Progress value={groups.completion} className="h-2" />
          </div>}
        </div>
      </header>
      <div className="space-y-5 px-4 py-4 sm:px-6">
        {!loading && <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{groups.overdue.length}</strong> overdue</span>
          <span><strong className="text-foreground">{groups.today.length}</strong> due today</span>
          <span><strong className="text-foreground">{groups.next.length}</strong> coming next</span>
          <span><strong className="text-foreground">{groups.completed.length}</strong> completed</span>
        </div>}
        <TaskQuickAdd onAddTask={onAddTask} onReviewBoard={onReviewBoard} focusRequest={focusQuickAdd} />
        {loading ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">Loading tasks…</span>
            {[1, 2, 3].map((item) => <div key={item} aria-hidden="true" className="h-14 animate-pulse rounded-lg bg-secondary" />)}
          </div>
        ) : (
          <>
            {groups.overdue.length > 0 && <TaskSection title="Overdue" tasks={groups.overdue} timeZone={workspace.timezone} workspace={workspace} currentUserEmail={currentUserEmail} empty="No overdue work." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />}
            <TaskSection title="Today" tasks={groups.today} timeZone={workspace.timezone} workspace={workspace} currentUserEmail={currentUserEmail} empty="Nothing needs your attention today." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
            <TaskSection title="Next" tasks={groups.next} timeZone={workspace.timezone} workspace={workspace} currentUserEmail={currentUserEmail} empty="Future work will appear here when it has a later date." onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
            <details className="border-t border-border pt-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Completed ({groups.completed.length})</summary>
              <div className="mt-3"><TaskSection title="Completed" tasks={groups.completed} timeZone={workspace.timezone} workspace={workspace} currentUserEmail={currentUserEmail} empty="Completed work will collect here." onToggleTask={onToggleTask} onOpenTask={onOpenTask} /></div>
            </details>
          </>
        )}
        <Button type="button" variant="link" onClick={onOpenBoard} className="h-auto p-0">View all tasks <ArrowRight className="size-4" /></Button>
        {commandBar}
      </div>
    </section>
  )
}
