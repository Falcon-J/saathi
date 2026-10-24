"use client"

import { useEffect, useRef, useState } from "react"
import { TaskList } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { useTaskBoard } from "@/hooks/use-task-board"
import { useNotifications } from "@/hooks/use-notifications"
import { getTaskById, toggleTask, deleteTask, updateTask } from "@/app/tasks/actions"
import { getMutationError } from "@/lib/mutation-result"
import type { Task, TaskUpdate } from "@/lib/task-contract"
import type { Workspace } from "@/app/actions/workspaces"
import type { RealtimeEvent } from "@/lib/realtime"

type BoardProps = {
  workspace: Workspace
  currentUserEmail: string
  refreshSignal: number
  openTaskId: string | null
  commentRefreshEvent: RealtimeEvent | null
  focusQuickAdd: number
  onAddTask: (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => Promise<unknown>
}
export function WorkspaceBoard({ workspace, currentUserEmail, refreshSignal, openTaskId, commentRefreshEvent, focusQuickAdd, onAddTask }: BoardProps) {
  const board = useTaskBoard(workspace.id, refreshSignal)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRetry, setDetailRetry] = useState(0)
  const { error: notifyError } = useNotifications()
  const detailRef = useRef<Task | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!openTaskId) { detailRef.current = null; return }
    async function read() {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const result = await getTaskById(workspace.id, openTaskId!)
        if (cancelled) return
        if ("error" in result) { setDetailError(result.error || "Unable to open task."); return }
        detailRef.current = result.task
        setDetailTask(result.task)
      } catch { if (!cancelled) setDetailError("Unable to open task. Try again.") }
      finally { if (!cancelled) setDetailLoading(false) }
    }
    void read()
    return () => { cancelled = true }
  }, [workspace.id, openTaskId, detailRetry])

  const knownTask = (id: string) => board.tasks.find(task => task.id === id) ?? (detailRef.current?.id === id ? detailRef.current : null)
  const completeWrite = async (work: () => Promise<unknown>) => {
    try {
      const result = await work()
      const message = getMutationError(result)
      if (message) notifyError("Task not updated", message)
      await board.reload()
      return result
    } catch {
      const result = { error: "Unable to confirm the change. Refresh tasks before retrying." }
      notifyError("Task not updated", result.error)
      await board.reload()
      return result
    }
  }
  return <>
    {board.error && <div role="alert" className="m-4 rounded-lg border border-border p-4"><p>{board.error}</p><Button variant="outline" className="mt-2" onClick={() => void board.reload()}>Try again</Button></div>}
    {detailLoading && <p role="status" className="px-4 pt-3 text-sm text-muted-foreground">Opening task…</p>}
    {detailError && <div role="alert" className="p-4"><p>{detailError}</p><Button variant="outline" onClick={() => setDetailRetry(value => value + 1)}>Try opening task again</Button></div>}
    <TaskList tasks={board.tasks} loading={board.loading} members={workspace.members} currentUserEmail={currentUserEmail} workspaceOwnerId={workspace.ownerId} timeZone={workspace.timezone} openTaskId={openTaskId} detailTask={detailTask} commentRefreshEvent={commentRefreshEvent} focusQuickAdd={focusQuickAdd}
      paging={board} onReviewBoard={async () => { if (!await board.reload()) throw new Error("Tasks unavailable") }}
      onAddTask={async (...args) => { const result = await onAddTask(...args); if (!getMutationError(result)) await board.reload(); return result }}
      onToggleTask={id => completeWrite(() => { const task = knownTask(id); return task ? toggleTask(id, task.version ?? task.updatedAt) : Promise.resolve({ error: "Task unavailable. Refresh tasks." }) })}
      onDeleteTask={id => completeWrite(() => { const task = knownTask(id); return task ? deleteTask(id, task.version ?? task.updatedAt) : Promise.resolve({ error: "Task unavailable. Refresh tasks." }) })}
      onEditTask={(id: string, updates: TaskUpdate, expected?: number | string) => completeWrite(() => {
        const task = knownTask(id)
        return task ? updateTask(id, updates, expected ?? task.version ?? task.updatedAt) : Promise.resolve({ error: "Task unavailable. Refresh tasks." })
      })} />
  </>
}
