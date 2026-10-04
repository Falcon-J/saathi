"use client"

import { useEffect, useState } from "react"
import { getArchivedWorkspaces, type Workspace } from "@/app/actions/workspaces"
import { getTasks } from "@/app/tasks/actions"
import type { Task } from "@/lib/task-contract"
import { toTaskEditorDraft } from "@/lib/task-draft"
import { ActivityHistory } from "@/components/activity-history"
import { TaskEditorDialog } from "@/components/task-list"
import { Button } from "@/components/ui/button"

export function ArchiveHistory() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState("")
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskId, setTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setWorkspaceError(null)
    void getArchivedWorkspaces().then(result => {
      if (!active) return
      if (result.workspaces) {
        setWorkspaces(result.workspaces)
        setWorkspaceId(current => result.workspaces!.some(workspace => workspace.id === current) ? current : result.workspaces![0]?.id ?? "")
      } else {
        setWorkspaces([])
        setWorkspaceId("")
        setWorkspaceError(result.error ?? "Unable to load archived workspaces.")
      }
    }).catch(() => {
      if (active) setWorkspaceError("Unable to load archived workspaces. Please try again.")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  useEffect(() => {
    let active = true
    setTasks([])
    setTaskId(null)
    setTaskError(null)
    if (!workspaceId) { setTasksLoading(false); return }
    setTasksLoading(true)
    void getTasks(workspaceId).then(result => {
      if (!active) return
      if (result.tasks) setTasks(result.tasks)
      else setTaskError(result.error ?? "Unable to load archived tasks.")
    }).catch(() => {
      if (active) setTaskError("Unable to load archived tasks. Please try again.")
    }).finally(() => { if (active) setTasksLoading(false) })
    return () => { active = false }
  }, [workspaceId, revision])

  const workspace = workspaces.find(item => item.id === workspaceId)
  const task = tasks.find(item => item.id === taskId) ?? null
  return <div className="space-y-6">
    <Button variant="outline" disabled={loading || tasksLoading} onClick={() => { setTaskId(null); setRevision(value => value + 1) }}>Refresh archive</Button>
    {loading ? <p role="status">Loading archived workspaces…</p> : workspaceError ? <p role="alert">{workspaceError}</p> : workspaces.length === 0 ? <p>No archived workspaces yet.</p> : <>
      <div className="space-y-2">
        <label htmlFor="archive-workspace" className="text-sm font-medium">Archived workspace</label>
        <select id="archive-workspace" value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-3">
          {workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {workspace?.summary && <p className="text-sm text-muted-foreground">{workspace.summary}</p>}
      </div>
      <section aria-label="Archived tasks" className="space-y-3">
        <h2 className="text-lg font-semibold">Tasks</h2>
        {tasksLoading ? <p role="status">Loading archived tasks…</p> : taskError ? <p role="alert">{taskError}</p> : tasks.length === 0 ? <p>No tasks in this workspace.</p> : <ul className="space-y-2">
          {tasks.map(item => <li key={item.id}><button type="button" onClick={() => setTaskId(item.id)} className="w-full rounded-lg border border-border p-4 text-left hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
            <span className="font-medium">{item.title}</span><span className="ml-3 text-sm text-muted-foreground">{item.completed ? "Completed" : "Open"}</span>
          </button></li>)}
        </ul>}
      </section>
      {workspace && <ActivityHistory key={workspace.id} workspaceId={workspace.id} refreshSignal={revision} />}
      <TaskEditorDialog task={task} draft={task ? toTaskEditorDraft(task) : null} canEdit={false} canComment={false} error={null} isSaving={false} members={workspace?.members ?? []} onDraftChange={() => {}} onClose={() => setTaskId(null)} onSubmit={event => event.preventDefault()} />
    </>}
  </div>
}
