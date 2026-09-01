import type { TaskUpdate } from "@/app/tasks/contract"

type EditableTask = {
  title: string
  description?: string
  priority: "low" | "medium" | "high"
  dueDate?: string
  status?: "todo" | "in-progress" | "done"
  completed?: boolean
  assigneeEmail?: string
}

export type TaskEditorDraft = {
  title: string
  description: string
  priority: "low" | "medium" | "high"
  dueDate: string
  status: "todo" | "in-progress" | "done"
  assigneeEmail: string
}

export function toTaskEditorDraft(task: EditableTask): TaskEditorDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dueDate: task.dueDate ?? "",
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
  if (draft.dueDate !== currentDraft.dueDate) updates.dueDate = draft.dueDate
  if (draft.status !== currentDraft.status) updates.status = draft.status
  if (draft.assigneeEmail !== currentDraft.assigneeEmail) updates.assigneeEmail = draft.assigneeEmail

  return updates
}
