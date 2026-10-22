"use client"

import { useEffect, useState, useMemo, memo, useRef, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { TaskQuickAdd } from "@/components/task-quick-add"
import { CheckCircle2, Circle, Trash2, Loader2, Users, Edit2, Calendar, Flag, Clock, AlertCircle, SquarePen } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { TaskFilter } from "@/components/task-filter"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useTaskPermissions } from "@/hooks/usePermissions"
import type { Member } from "@/app/actions/workspaces"
import type { Task, TaskStatus, TaskUpdate } from "@/lib/task-contract"
import { getMutationError } from "@/lib/mutation-result"
import { buildTaskUpdate, toTaskEditorDraft, type TaskEditorDraft } from "@/lib/task-draft"
import { formatTaskDue } from "@/lib/task-time"
import { TaskComments } from "@/components/task-comments"
import type { RealtimeEvent } from "@/lib/realtime"

export interface BoardPaging {
  filters: import("@/lib/task-page").TaskPageInput
  changeFilters: (filters: import("@/lib/task-page").TaskPageInput) => void
  aggregates: import("@/lib/task-page").TaskAggregates | null
  nextCursor: string | null
  loadingMore: boolean
  loadMore: () => Promise<void>
}

interface TaskListProps {
  paging?: BoardPaging
  detailTask?: Task | null
  tasks: Task[]
  loading: boolean
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  timeZone: string
  onAddTask: (title: string, description?: string, priority?: 'low' | 'medium' | 'high', dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => Promise<unknown>
  onToggleTask: (id: string) => Promise<unknown>
  onDeleteTask: (id: string) => Promise<unknown>
  onEditTask: (taskId: string, updates: TaskUpdate, expectedVersion?: number | string) => Promise<unknown>
  openTaskId?: string | null
  commentRefreshEvent?: RealtimeEvent | null
  focusQuickAdd?: number
  onReviewBoard?: () => Promise<void>
}

export const TaskList = memo(function TaskList({
  tasks,
  loading,
  members,
  currentUserEmail,
  workspaceOwnerId,
  timeZone,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  openTaskId,
  commentRefreshEvent,
  focusQuickAdd,
  onReviewBoard,
  paging,
  detailTask,
}: TaskListProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const editorPermissions = useTaskPermissions(
    currentUserEmail,
    { id: editingTask?.workspaceId ?? "", ownerId: workspaceOwnerId },
    editingTask ?? undefined,
  )
  const [editingDraft, setEditingDraft] = useState<TaskEditorDraft | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null)
  const [localSearchQuery, setSearchQuery] = useState("")
  const [localSelectedAssignee, setSelectedAssignee] = useState<string | null>(null)
  const [localSelectedStatus, setSelectedStatus] = useState<"all" | "active" | "completed">("all")
  const [localSelectedPriority, setSelectedPriority] = useState<"all" | "low" | "medium" | "high">("all")
  const searchQuery = paging ? paging.filters.search ?? "" : localSearchQuery
  const selectedAssignee = paging ? paging.filters.assigneeEmail ?? null : localSelectedAssignee
  const selectedStatus = paging ? paging.filters.status ?? "all" : localSelectedStatus
  const selectedPriority = paging ? paging.filters.priority ?? "all" : localSelectedPriority
  const openedTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!openTaskId) {
      openedTaskIdRef.current = null
      return
    }
    if (openedTaskIdRef.current === openTaskId) return
    const task = tasks.find((item) => item.id === openTaskId) ?? (detailTask?.id === openTaskId ? detailTask : null)
    if (!task) return
    openedTaskIdRef.current = openTaskId
    setEditingTask(task)
    setEditingDraft(toTaskEditorDraft(task))
    setEditError(null)
  }, [openTaskId, tasks, detailTask])

  const filteredTasks = useMemo(() => {
    if (paging) return tasks
    return tasks.filter((task) => {
      // Search filter
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !task.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }

      // Status filter
      if (selectedStatus === "active" && task.completed) {
        return false
      }
      if (selectedStatus === "completed" && !task.completed) {
        return false
      }

      // Assignee filter
      if (selectedAssignee && task.assigneeEmail !== selectedAssignee) {
        return false
      }

      // Priority filter
      if (selectedPriority !== "all" && task.priority !== selectedPriority) {
        return false
      }

      return true
    })
  }, [tasks, searchQuery, selectedStatus, selectedAssignee, selectedPriority, paging])

  const handleToggleTask = async (taskId: string) => {
    setOperatingTaskId(taskId)
    try {
      await onToggleTask(taskId)
    } finally {
      setOperatingTaskId(null)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    setOperatingTaskId(taskId)
    try {
      await onDeleteTask(taskId)
    } finally {
      setDeleteConfirm(null)
      setOperatingTaskId(null)
    }
  }

  const handleEditTask = async (taskId: string, taskUpdates: TaskUpdate) => {
    setOperatingTaskId(taskId)
    try {
      await onEditTask(taskId, taskUpdates)
    } finally {
      setOperatingTaskId(null)
    }
  }

  const openEditor = (task: Task) => {
    setEditingTask(task)
    setEditingDraft(toTaskEditorDraft(task))
    setEditError(null)
  }

  const closeEditor = () => {
    if (editingTask && operatingTaskId === editingTask.id) return
    setEditingTask(null)
    setEditingDraft(null)
    setEditError(null)
  }

  const updateEditingDraft = (changes: Partial<TaskEditorDraft>) => {
    setEditingDraft((draft) => draft ? { ...draft, ...changes } : draft)
  }

  const saveEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTask || !editingDraft || !editorPermissions.canEdit) return

    const title = editingDraft.title.trim()
    if (!title) {
      setEditError("Task title is required.")
      return
    }

    if (editingDraft.estimatedMinutes) {
      const estimate = Number(editingDraft.estimatedMinutes)
      if (!Number.isInteger(estimate) || estimate < 1 || estimate > 1440) {
        setEditError("Estimate must be a whole number between 1 and 1440 minutes.")
        return
      }
    }
    if (editingDraft.dueTime && !editingDraft.dueDate) {
      setEditError("Choose a due date before adding a due time.")
      return
    }

    const updates = buildTaskUpdate(editingTask, { ...editingDraft, title })
    if (Object.keys(updates).length === 0) {
      closeEditor()
      return
    }

    setEditError(null)
    setOperatingTaskId(editingTask.id)
    try {
      const result = await onEditTask(editingTask.id, updates, editingTask.version ?? editingTask.updatedAt)
      const mutationError = getMutationError(result)
      if (mutationError) {
        setEditError(mutationError)
        return
      }
      closeEditor()
    } finally {
      setOperatingTaskId(null)
    }
  }

  const getMemberName = (memberId: string | null) => {
    if (!memberId) return "Unassigned"
    const member = members.find((m) => m.id === memberId)
    return member ? member.username : "Unknown"
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/30'
      case 'medium': return 'bg-[color-mix(in_srgb,var(--saathi-warning)_10%,transparent)] text-[var(--saathi-warning)] border-[var(--saathi-warning)]/30'
      case 'low': return 'bg-[color-mix(in_srgb,var(--saathi-success)_10%,transparent)] text-[var(--saathi-success)] border-[var(--saathi-success)]/30'
      default: return 'bg-secondary text-muted-foreground border-border'
    }
  }

  const getPriorityIcon = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return <AlertCircle className="w-3 h-3" />
      case 'medium': return <Flag className="w-3 h-3" />
      case 'low': return <Circle className="w-3 h-3" />
      default: return <Flag className="w-3 h-3" />
    }
  }

  const completedCount = tasks.filter((t) => t.completed).length
  const getTaskStatus = (task: Task) => task.status ?? (task.completed ? "done" : "todo")
  const todoTasks = filteredTasks.filter((task) => getTaskStatus(task) === "todo")
  const inProgressTasks = filteredTasks.filter((task) => getTaskStatus(task) === "in-progress")
  const completedTasks = filteredTasks.filter((task) => getTaskStatus(task) === "done")

  const renderTask = (task: Task) => (
    <TaskListItem
      key={task.id}
      task={task}
      members={members}
      currentUserEmail={currentUserEmail}
      workspaceOwnerId={workspaceOwnerId}
      timeZone={timeZone}
      operatingTaskId={operatingTaskId}
      onToggleTask={handleToggleTask}
      onEditTask={handleEditTask}
      onStartEdit={openEditor}
      onConfirmDelete={setDeleteConfirm}
    />
  )

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <TaskQuickAdd onAddTask={onAddTask} onReviewBoard={onReviewBoard} focusRequest={focusQuickAdd} />

      <TaskFilter
        searchQuery={searchQuery}
        onSearchChange={value => paging ? paging.changeFilters({ search: value }) : setSearchQuery(value)}
        selectedAssignee={selectedAssignee}
        onFilterByAssignee={value => paging ? paging.changeFilters({ assigneeEmail: value ?? undefined }) : setSelectedAssignee(value)}
        selectedStatus={selectedStatus}
        onFilterByStatus={value => paging ? paging.changeFilters({ status: value }) : setSelectedStatus(value)}
        selectedPriority={selectedPriority}
        onFilterByPriority={value => paging ? paging.changeFilters({ priority: value === "all" ? undefined : value }) : setSelectedPriority(value)}
        members={members}
      />

      <div className="flex items-center justify-between rounded-[var(--saathi-radius-card)] border border-border px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {paging && <span className="mr-3 text-xs">Workspace totals</span>}
          <span className="font-medium text-foreground">{paging ? paging.aggregates?.open ?? "…" : tasks.length - completedCount}</span> open
          <span className="mx-2 text-border">/</span>
          <span className="font-medium text-primary">{paging ? paging.aggregates?.done ?? "…" : completedCount}</span> done
        </div>
        {paging ? <p className="text-xs text-muted-foreground">{loading ? "Loading tasks…" : `Showing ${tasks.length} matching task${tasks.length === 1 ? "" : "s"}${paging.nextCursor ? " so far" : ""}`}</p> : filteredTasks.length !== tasks.length && (
          <div className="text-sm font-medium text-muted-foreground">
            Showing {filteredTasks.length} of {tasks.length}
          </div>
        )}
      </div>

      {/* Board */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Task board">
        {loading ? (
          <Card className="rounded-[var(--saathi-radius-card)] border-border bg-card p-8 text-center md:col-span-2 xl:col-span-3">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          </Card>
        ) : (
          <>
            <TaskColumn
              title="To do"
              count={todoTasks.length}
              emptyMessage={(paging ? paging.aggregates?.total === 0 : tasks.length === 0) && !searchQuery && selectedStatus === "all" && selectedPriority === "all" && !selectedAssignee ? "No tasks yet. Add one above." : paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : "No tasks match these filters."}
            >
              {todoTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              title="In progress"
              count={inProgressTasks.length}
              emptyMessage={paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : paging ? "No in-progress tasks match these filters." : "Tasks you are actively working on will appear here."}
            >
              {inProgressTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              title="Done"
              count={completedTasks.length}
              emptyMessage={paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : tasks.length === 0 ? "Completed tasks will appear here." : "No completed tasks match these filters."}
            >
              {completedTasks.map(renderTask)}
            </TaskColumn>
          </>
        )}
      </div>

      {paging?.nextCursor && <Button variant="outline" onClick={() => void paging.loadMore()} disabled={loading || paging.loadingMore}>{paging.loadingMore ? "Loading more…" : "Load more tasks"}</Button>}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        actionLabel="Delete"
        onConfirm={() => deleteConfirm && handleDeleteTask(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={operatingTaskId === deleteConfirm}
      />
      <TaskEditorDialog
        task={editingTask}
        draft={editingDraft}
        canEdit={editorPermissions.canEdit}
        error={editError}
        isSaving={Boolean(editingTask && operatingTaskId === editingTask.id)}
        members={members}
        commentRefreshEvent={commentRefreshEvent}
        onDraftChange={updateEditingDraft}
        onClose={closeEditor}
        onSubmit={saveEditor}
      />
    </div>
  )
})

function TaskColumn({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string
  count: number
  emptyMessage: string
  children: ReactNode
}) {
  return (
    <section className="min-h-72 rounded-[var(--saathi-radius-container)] border border-border bg-secondary/40 p-4" aria-label={`${title} tasks`}>
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <h3 className="saathi-label text-muted-foreground">{title}</h3>
        <Badge variant="outline" className="border-border bg-card text-muted-foreground">
          {count}
        </Badge>
      </div>
      <div className="space-y-3">
        {count > 0 ? children : (
          <div className="rounded-[var(--saathi-radius-card)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  )
}

export function TaskEditorDialog({
  task,
  draft,
  canEdit,
  canComment = true,
  error,
  isSaving,
  members,
  commentRefreshEvent,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  task: Task | null
  draft: TaskEditorDraft | null
  canEdit: boolean
  canComment?: boolean
  error: string | null
  isSaving: boolean
  members: Member[]
  commentRefreshEvent?: RealtimeEvent | null
  onDraftChange: (changes: Partial<TaskEditorDraft>) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const requestClose = () => {
    if (isSaving) return
    if (canEdit && task && draft) {
      const original = toTaskEditorDraft(task)
      if ((Object.keys(original) as (keyof TaskEditorDraft)[]).some(key => original[key] !== draft[key])) {
        setDiscardConfirm(true)
        return
      }
    }
    onClose()
  }

  return (
    <Dialog open={Boolean(task && draft)} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl sm:max-w-2xl" showCloseButton={!isSaving}>
        <DialogHeader className="border-b border-border bg-secondary/35 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-start gap-3 text-left">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SquarePen className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">{canEdit ? "Edit task" : "Task details"}</DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                {canEdit ? "Update the details that help your team understand and move this work." : canComment ? "Review the task and discuss the work with your team below." : "Review the retained task details and discussion."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {task && draft && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <form id="task-editor-form" className="space-y-6 px-5 py-5 sm:px-6" onSubmit={onSubmit}>
              <fieldset disabled={!canEdit || isSaving} className="space-y-6">
              <section aria-labelledby="task-details-heading" className="space-y-4">
                <div>
                  <h3 id="task-details-heading" className="text-sm font-semibold">Task details</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Keep the title specific and add only the context needed to act.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-edit-title">Title</Label>
                  <Input
                    id="task-edit-title"
                    ref={titleInputRef}
                    value={draft.title}
                    onChange={(event) => onDraftChange({ title: event.target.value })}
                    disabled={isSaving}
                    maxLength={200}
                    autoFocus
                    className="h-11 bg-card text-base"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3"><Label htmlFor="task-edit-description">Description</Label><span className="text-xs text-muted-foreground">Optional</span></div>
                  <Textarea
                    id="task-edit-description"
                    value={draft.description}
                    onChange={(event) => onDraftChange({ description: event.target.value })}
                    disabled={isSaving}
                    maxLength={1000}
                    rows={5}
                    placeholder="Add useful context, acceptance notes, or a link..."
                    className="resize-y bg-card"
                  />
                </div>
              </section>

              <section aria-labelledby="task-planning-heading" className="space-y-4 border-t border-border pt-5">
                <div>
                  <h3 id="task-planning-heading" className="text-sm font-semibold">Planning &amp; ownership</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Status, priority, timing, and the person responsible.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-status">Status</Label>
                    <select
                      id="task-edit-status"
                      value={draft.status}
                      onChange={(event) => onDraftChange({ status: event.target.value as TaskEditorDraft["status"] })}
                      disabled={isSaving}
                      className="flex h-10 w-full rounded-[var(--saathi-radius-control)] border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="todo">To do</option>
                      <option value="in-progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-priority">Priority</Label>
                    <select
                      id="task-edit-priority"
                      value={draft.priority}
                      onChange={(event) => onDraftChange({ priority: event.target.value as TaskEditorDraft["priority"] })}
                      disabled={isSaving}
                      className="flex h-10 w-full rounded-[var(--saathi-radius-control)] border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-due-date">Due date</Label>
                    <Input id="task-edit-due-date" type="date" value={draft.dueDate} onChange={(event) => onDraftChange({ dueDate: event.target.value })} disabled={isSaving} className="h-10 bg-card" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-due-time">Due time <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="task-edit-due-time" type="time" value={draft.dueTime} onChange={(event) => onDraftChange({ dueTime: event.target.value })} disabled={isSaving || !draft.dueDate} className="h-10 bg-card" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-estimate">Estimate <span className="font-normal text-muted-foreground">(minutes)</span></Label>
                    <Input id="task-edit-estimate" type="number" min={1} max={1440} step={1} value={draft.estimatedMinutes} onChange={(event) => onDraftChange({ estimatedMinutes: event.target.value })} disabled={isSaving} placeholder="e.g. 45" className="h-10 bg-card" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-assignee">Assignee</Label>
                    <select
                      id="task-edit-assignee"
                      value={draft.assigneeEmail}
                      onChange={(event) => onDraftChange({ assigneeEmail: event.target.value })}
                      disabled={isSaving}
                      className="flex h-10 w-full rounded-[var(--saathi-radius-control)] border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => <option key={member.id} value={member.email}>{member.username}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {error && <p className="rounded-[var(--saathi-radius-control)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}. If the task changed, copy your draft, close this editor, and reopen the task to review its latest details before saving.</p>}
              </fieldset>
              </form>

              <div className="px-5 pb-5 sm:px-6">
                <TaskComments taskId={task.id} key={task.id} readOnly={!canComment} refreshEvent={commentRefreshEvent} />
              </div>
            </div>

            <DialogFooter className="border-t border-border bg-secondary/45 px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={requestClose} disabled={isSaving}>{canEdit ? "Cancel" : "Close"}</Button>
              {canEdit && <Button type="submit" form="task-editor-form" disabled={isSaving}>{isSaving ? <Loader2 className="size-4 animate-spin" /> : null}Save changes</Button>}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={discardConfirm && Boolean(task && draft)}
        title="Discard unsaved changes?"
        description="Your changes to this task have not been saved. Discard them and close the editor?"
        actionLabel="Discard changes"
        onConfirm={() => {
          if (isSaving) return
          setDiscardConfirm(false)
          onClose()
        }}
        onCancel={() => setDiscardConfirm(false)}
        onCloseAutoFocus={event => {
          if (task && draft && titleInputRef.current?.isConnected) {
            event.preventDefault()
            titleInputRef.current.focus()
          }
        }}
        isLoading={isSaving}
      />
    </Dialog>
  )
}

interface TaskListItemProps {
  task: Task
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  timeZone: string
  operatingTaskId: string | null
  onToggleTask: (taskId: string) => Promise<void>
  onEditTask: (taskId: string, updates: TaskUpdate) => Promise<void>
  onStartEdit: (task: Task) => void
  onConfirmDelete: (taskId: string) => void
}

const TaskListItem = memo(function TaskListItem({
  task,
  members,
  currentUserEmail,
  workspaceOwnerId,
  timeZone,
  operatingTaskId,
  onToggleTask,
  onEditTask,
  onStartEdit,
  onConfirmDelete,
}: TaskListItemProps) {
  const taskPermissions = useTaskPermissions(
    currentUserEmail,
    { id: task.workspaceId, ownerId: workspaceOwnerId },
    task,
  )

  return (
    <Card className="group rounded-[var(--saathi-radius-card)] border border-border bg-card p-5 shadow-none transition-colors duration-200 hover:border-primary/30 hover:bg-muted/20">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleTask(task.id)}
            disabled={operatingTaskId === task.id || !taskPermissions.canToggle}
            aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
            title={task.completed ? "Reopen task" : "Complete task"}
            className="flex-shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {task.completed ? (
              <CheckCircle2 className="w-6 h-6 text-[var(--saathi-success)]" />
            ) : (
              <Circle className="w-6 h-6 hover:text-primary" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStartEdit(task)}
            className={`flex-1 cursor-pointer text-left text-base font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${task.completed ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary/80"}`}
          >
            {task.title}
          </button>
          <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200 focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {taskPermissions.canEdit && (
              <button
                onClick={() => onStartEdit(task)}
                aria-label={`Edit ${task.title}`}
                title="Edit task"
                className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {taskPermissions.canDelete && (
              <button
                onClick={() => onConfirmDelete(task.id)}
                aria-label={`Delete ${task.title}`}
                title="Delete task"
                className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {task.description && (
          <div className="ml-9 mt-2">
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>
        )}

        <div className="ml-9 space-y-2 border-t border-border pt-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <select
                value={task.status ?? (task.completed ? "done" : "todo")}
              onChange={(event) => onEditTask(task.id, { status: event.target.value as TaskStatus })}
                disabled={operatingTaskId === task.id || !taskPermissions.canEdit}
                aria-label={`Change status for ${task.title}`}
                className="cursor-pointer rounded-[var(--saathi-radius-control)] border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              >
                <option value="todo">To do</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Flag className={`w-3 h-3 ${task.priority === 'high' ? 'text-[var(--saathi-danger)]' :
                task.priority === 'medium' ? 'text-muted-foreground' : 'text-primary'
                }`} />
              <span className="capitalize">{task.priority} priority</span>
            </div>

            {formatTaskDue(task.dueAt, task.dueDate, timeZone) && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Due {formatTaskDue(task.dueAt, task.dueDate, timeZone)}</span>
              </div>
            )}

            {task.estimatedMinutes && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Estimate {task.estimatedMinutes}m</span>
              </div>
            )}

          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">Assigned to:</span>
            <select
              value={task.assigneeEmail || ""}
              onChange={(e) => onEditTask(task.id, { assigneeEmail: e.target.value || "" })}
              disabled={operatingTaskId === task.id || !taskPermissions.canAssign}
              aria-label={`Assign ${task.title}`}
              className="min-w-0 max-w-full cursor-pointer rounded-[var(--saathi-radius-control)] border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.email}>
                  {member.username}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Card>
  )
})
