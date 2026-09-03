import type { TaskUpdate } from "@/app/tasks/contract"
import { localDateTimeToIso, toLocalDate, toLocalTime } from "./task-time.ts"

type EditableTask = {
  title: string
  description?: string
  priority: "low" | "medium" | "high"
  dueDate?: string
  dueAt?: string
  estimatedMinutes?: number
  status?: "todo" | "in-progress" | "done"
  completed?: boolean
  assigneeEmail?: string
}

export type TaskEditorDraft = {
  title: string
  description: string
  priority: "low" | "medium" | "high"
  dueDate: string
  dueTime: string
  estimatedMinutes: string
  status: "todo" | "in-progress" | "done"
  assigneeEmail: string
}

export function toTaskEditorDraft(task: EditableTask): TaskEditorDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dueDate: task.dueDate ?? toLocalDate(task.dueAt),
    dueTime: toLocalTime(task.dueAt),
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    status: task.status ?? (task.completed ? "done" : "todo"),
    assigneeEmail: task.assigneeEmail ?? "",
  }
}

export function buildTaskUpdate(task: EditableTask, draft: TaskEditorDraft): TaskUpdate {
  const currentDraft = toTaskEditorDraft(task)
  const updates: TaskUpdate = {}

  if (draft.title !== currentDraft.title) updates.title = draft.title
  if (draft.description !== currentDraft.description) updates.description = draft.description
  if (draft.priority !== currentDraft.priority) updates.priority = draft.priority
  if (draft.dueDate !== currentDraft.dueDate || draft.dueTime !== currentDraft.dueTime) {
    updates.dueDate = draft.dueDate
    updates.dueAt = draft.dueTime ? localDateTimeToIso(draft.dueDate, draft.dueTime) : undefined
  }
  if (draft.estimatedMinutes !== currentDraft.estimatedMinutes) {
    updates.estimatedMinutes = draft.estimatedMinutes ? Number(draft.estimatedMinutes) : undefined
  }
  if (draft.status !== currentDraft.status) updates.status = draft.status
  if (draft.assigneeEmail !== currentDraft.assigneeEmail) updates.assigneeEmail = draft.assigneeEmail

  return updates
}
