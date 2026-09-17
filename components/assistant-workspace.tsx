"use client"

import { AlertTriangle, ArrowRight, CheckCircle2, ListTodo, Sparkles } from "lucide-react"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/app/tasks/actions"
import { WorkspaceAdvisor } from "@/components/workspace-advisor"
import { confirmWorkspaceAdvisorDraft } from "@/app/actions/workspace-advisor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatTaskDue, todayCalendarDate } from "@/lib/task-time"
import { groupTasksForOverview } from "@/lib/task-overview"

type AssistantWorkspaceProps = {
  workspace: Workspace
  tasks: Task[]
  aiEnabled: boolean
  onRefreshTasks: () => Promise<unknown>
  onOpenTask: (taskId: string) => void
  onOpenWorkspace: () => void
}

export function AssistantWorkspace({ workspace, tasks, aiEnabled, onRefreshTasks, onOpenTask, onOpenWorkspace }: AssistantWorkspaceProps) {
  const groups = groupTasksForOverview(tasks, todayCalendarDate(workspace.timezone))
  const openTasks = tasks.filter((task) => !task.completed && task.status !== "done").length

  const confirmDraft = async (draft: Parameters<typeof confirmWorkspaceAdvisorDraft>[1], idempotencyKey: string) => {
    const result = await confirmWorkspaceAdvisorDraft(workspace.id, draft, idempotencyKey)
    if (!result.error) await onRefreshTasks()
    return result
  }

  return (
    <section className="space-y-5" aria-label="Assistant workspace">
      <Card className="overflow-hidden rounded-[var(--saathi-radius-container)] border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <CardHeader className="border-b border-primary/10 px-5 py-6 sm:px-8 sm:py-8">
          <p className="saathi-label flex items-center gap-2 text-primary"><Sparkles className="size-4" />Assistant mode</p>
          <CardTitle className="mt-2 max-w-2xl text-3xl tracking-[-0.05em] sm:text-4xl">Turn intention into reviewed work.</CardTitle>
          <CardDescription className="mt-2 max-w-2xl text-sm leading-6">Ask about {workspace.name}, shape the next step, and confirm every change before it becomes part of the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-5 py-5 sm:px-8 sm:py-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/80 p-4"><ListTodo className="size-4 text-primary" /><p className="mt-3 text-2xl font-semibold tracking-tight">{openTasks}</p><p className="mt-1 text-xs text-muted-foreground">Open work</p></div>
            <div className="rounded-xl border border-[var(--saathi-warning)]/30 bg-[var(--saathi-warning)]/5 p-4"><AlertTriangle className="size-4 text-[var(--saathi-warning)]" /><p className="mt-3 text-2xl font-semibold tracking-tight">{groups.overdue.length}</p><p className="mt-1 text-xs text-muted-foreground">Needs attention</p></div>
            <div className="rounded-xl border border-border bg-background/80 p-4"><CheckCircle2 className="size-4 text-[var(--saathi-success)]" /><p className="mt-3 text-2xl font-semibold tracking-tight">{groups.completed.length}</p><p className="mt-1 text-xs text-muted-foreground">Completed</p></div>
          </div>
          {aiEnabled ? (
            <WorkspaceAdvisor workspaceId={workspace.id} timeZone={workspace.timezone} onConfirmDraft={confirmDraft} />
          ) : (
            <div className="rounded-xl border border-border bg-secondary/35 p-5">
              <p className="text-sm font-semibold">Assistant unavailable</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">AI assistance is disabled for this workspace. Your tasks and collaboration controls remain available in Workspace mode.</p>
              <Button type="button" variant="outline" onClick={onOpenWorkspace} className="mt-4 bg-card">Open Workspace <ArrowRight className="size-4" /></Button>
            </div>
          )}
        </CardContent>
      </Card>

      {groups.overdue.length > 0 && (
        <Card className="rounded-[var(--saathi-radius-container)] border-[var(--saathi-warning)]/30">
          <CardHeader className="px-5 py-5 sm:px-7">
            <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="size-4 text-[var(--saathi-warning)]" />Needs attention</CardTitle>
            <CardDescription>Overdue work from the authoritative workspace task list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 px-5 pb-5 sm:px-7 sm:pb-7">
            {groups.overdue.slice(0, 3).map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg border-b border-border/70 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatTaskDue(task.dueAt, task.dueDate, workspace.timezone) ?? "Deadline passed"}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenTask(task.id)}>Open task <ArrowRight className="size-3.5" /></Button>
              </div>
            ))}
            {groups.overdue.length > 3 && <p className="pt-3 text-xs text-muted-foreground">{groups.overdue.length - 3} more attention item{groups.overdue.length - 3 === 1 ? "" : "s"} available in Workspace mode.</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div><p className="text-sm font-semibold">Need detailed control?</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Open the Board, task details, Team, Settings, or Activity without duplicating their logic here.</p></div>
        <Button type="button" onClick={onOpenWorkspace} className="shrink-0">Open Workspace <ArrowRight className="size-4" /></Button>
      </div>
    </section>
  )
}
