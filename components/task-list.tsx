"use client"

import { useEffect, useState, useMemo, memo, useRef, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { TaskQuickAdd } from "@/components/task-quick-add"
import { CheckCircle2, Circle, Trash2, Loader2, Users, Calendar, Flag, Clock, AlertCircle, MoreHorizontal, SquarePen } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { TaskFilter } from "@/components/task-filter"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { useTaskPermissions } from "@/hooks/usePermissions"
import type { Member } from "@/app/actions/workspaces"
import type { Task, TaskStatus, TaskUpdate } from "@/lib/task-contract"
import { getMutationError } from "@/lib/mutation-result"
import { buildTaskUpdate, toTaskEditorDraft, type TaskEditorDraft } from "@/lib/task-draft"
import { readDraft, writeDraft, removeDraft, isDraftRecord } from "@/lib/draft-storage"
import { formatTaskDue } from "@/lib/task-time"
import { getTaskById } from "@/app/tasks/actions"
import { TaskComments } from "@/components/task-comments"
import type { RealtimeEvent } from "@/lib/realtime"

import { permitsCapability, type CapabilityCeiling } from "@/lib/capability-ceiling"

export interface BoardPaging {
  filters: import("@/lib/task-page").TaskPageInput
  changeFilters: (filters: import("@/lib/task-page").TaskPageInput) => void
  aggregates: import("@/lib/task-page").TaskAggregates | null
  nextCursor: string | null
  loadingMore: boolean
  loadMore: () => Promise<void>
}

interface TaskListProps {
  active?: boolean
  compactToolbar?: boolean
  capabilityCeiling?: CapabilityCeiling
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
  openTaskRequest?: number
  openTaskReady?: boolean
  commentRefreshEvent?: RealtimeEvent | null
  focusQuickAdd?: number
  draftScope?: string
  onDirtyChange?: (dirty: boolean, activeDirty?: boolean, editorDraftTaskId?: string) => void
  onOpenTask?: (taskId: string) => void
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
  openTaskRequest = 0,
  openTaskReady = true,
  commentRefreshEvent,
  focusQuickAdd,
  onReviewBoard,
  paging,
  detailTask,
  onDirtyChange,
  onOpenTask,
  draftScope,
  capabilityCeiling,
  compactToolbar = false,
  active = true,
}: TaskListProps) {
  const boardHeading = useRef<HTMLHeadingElement>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const editorPermissions = useTaskPermissions(
    currentUserEmail,
    { id: editingTask?.workspaceId ?? "", ownerId: workspaceOwnerId },
    editingTask ?? undefined,
  )
  const [editingDraft, setEditingDraft] = useState<TaskEditorDraft | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  useEffect(() => { if (!active) setDeleteConfirm(null) }, [active])
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
  const openedTaskRequestRef = useRef(openTaskRequest)
  const [latestTask, setLatestTask] = useState<Task | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const reviewRequest = useRef(0)
  const [quickAddDirty, setQuickAddDirty] = useState(false)
  const draftKey = draftScope ? `${draftScope}:task-editor` : undefined
  const [restoredScope, setRestoredScope] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  useEffect(() => {
    if (focusQuickAdd) setQuickAddOpen(true)
  }, [focusQuickAdd])
  useEffect(() => {
    if (quickAddDirty) setQuickAddOpen(true)
  }, [quickAddDirty])
  useEffect(() => {
    if (!draftKey || restoredScope === draftKey) return
    const retained = readDraft(draftKey, (value): value is { task: Task; draft: TaskEditorDraft } => {
      if (!isDraftRecord(value) || !isDraftRecord(value.task) || !isDraftRecord(value.draft)) return false
      const task = value.task, draft = value.draft
      return [task.id, task.workspaceId, task.title, task.createdBy, task.createdAt, task.updatedAt].every(field => typeof field === "string")
        && [task.description, task.dueDate, task.dueAt, task.assigneeEmail].every(field => field === undefined || typeof field === "string")
        && (task.status === undefined || ["todo", "in-progress", "done"].includes(String(task.status)))
        && (task.bucket === undefined || task.bucket === "today" || task.bucket === "next")
        && (task.estimatedMinutes === undefined || (Number.isSafeInteger(task.estimatedMinutes) && Number(task.estimatedMinutes) > 0))
        && typeof task.completed === "boolean" && ["low", "medium", "high"].includes(String(task.priority))
        && (task.version === undefined || (Number.isSafeInteger(task.version) && Number(task.version) > 0))
        && [draft.title, draft.description, draft.dueDate, draft.dueTime, draft.estimatedMinutes, draft.assigneeEmail].every(field => typeof field === "string")
        && ["low", "medium", "high"].includes(String(draft.priority)) && ["todo", "in-progress", "done"].includes(String(draft.status))
    })
    if (retained) {
      setEditingTask(retained.task)
      setEditingDraft(retained.draft)
      openedTaskIdRef.current = openTaskId ?? retained.task.id
      openedTaskRequestRef.current = openTaskRequest
    }
    setRestoredScope(draftKey)
  }, [draftKey, restoredScope, openTaskId, openTaskRequest])
  const originalDraft = editingTask ? toTaskEditorDraft(editingTask) : null
  const editorDirty = Boolean(editingDraft && originalDraft && (Object.keys(originalDraft) as (keyof TaskEditorDraft)[]).some(key => originalDraft[key] !== editingDraft[key]))
  const editorPresented = active && Boolean(editingTask && (!onOpenTask || editingTask.id === openTaskId || editorDirty))
  useEffect(() => {
    if (!draftKey || restoredScope !== draftKey) return
    if (editorDirty && editingTask && editingDraft) writeDraft(draftKey, { task: editingTask, draft: editingDraft })
    else removeDraft(draftKey)
  }, [draftKey, restoredScope, editorDirty, editingTask, editingDraft])
  useEffect(() => { onDirtyChange?.(quickAddDirty || editorDirty || Boolean(operatingTaskId), (editorDirty && editorPresented) || Boolean(operatingTaskId) || (quickAddDirty && (!compactToolbar || quickAddOpen)), editorDirty ? editingTask?.id : undefined) }, [quickAddDirty, quickAddOpen, compactToolbar, editorDirty, editorPresented, editingTask?.id, operatingTaskId, onDirtyChange])

  useEffect(() => {
    if (draftKey && restoredScope !== draftKey) return
    if (!openTaskId) {
      openedTaskIdRef.current = null
      return
    }
    if (!openTaskReady) return
    if (editorDirty && editingTask?.id !== openTaskId) {
      openedTaskIdRef.current = null
      setEditError("Save or discard your retained task draft before opening another task.")
      return
    }
    // A record ID is selection; the request distinguishes an explicit repeat Open from a live refresh.
    if (openedTaskIdRef.current === openTaskId && openedTaskRequestRef.current === openTaskRequest) return
    const task = detailTask?.id === openTaskId ? detailTask : tasks.find((item) => item.id === openTaskId)
    if (!task) return
    openedTaskIdRef.current = openTaskId
    openedTaskRequestRef.current = openTaskRequest
    if (editorDirty && editingTask?.id === openTaskId) return
    reviewRequest.current++
    setLatestTask(null)
    setReviewLoading(false)
    setEditingTask(task)
    setEditingDraft(toTaskEditorDraft(task))
    setEditError(null)
  }, [openTaskId, openTaskRequest, openTaskReady, tasks, detailTask, draftKey, restoredScope, editorDirty, editingTask?.id])

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
    reviewRequest.current++
    setLatestTask(null)
    setReviewLoading(false)
    setEditingTask(task)
    setEditingDraft(toTaskEditorDraft(task))
    setEditError(null)
  }

  const closeEditor = () => {
    if (editingTask && operatingTaskId === editingTask.id) return
    removeDraft(draftKey)
    reviewRequest.current++
    setLatestTask(null)
    setReviewLoading(false)
    setEditingTask(null)
    setEditingDraft(null)
    setEditError(null)
  }

  const updateEditingDraft = (changes: Partial<TaskEditorDraft>) => {
    setEditingDraft((draft) => draft ? { ...draft, ...changes } : draft)
  }

  const reviewLatestTask = async () => {
    if (!editingTask || reviewLoading) return
    const request = ++reviewRequest.current
    setReviewLoading(true)
    try {
      const result = await getTaskById(editingTask.workspaceId, editingTask.id)
      if (request !== reviewRequest.current) return
      if ("error" in result) { setEditError(result.error || "Unable to load the latest task."); return }
      setLatestTask(result.task)
    } catch { if (request === reviewRequest.current) setEditError("Unable to load the latest task. Your draft is retained.") }
    finally { if (request === reviewRequest.current) setReviewLoading(false) }
  }
  const keepTaskDraft = () => {
    if (!editingTask || !editingDraft || !latestTask) return
    const original = toTaskEditorDraft(editingTask)
    const merged = toTaskEditorDraft(latestTask)
    for (const key of Object.keys(original) as (keyof TaskEditorDraft)[]) {
      if (editingDraft[key] !== original[key]) Object.assign(merged, { [key]: editingDraft[key] })
    }
    setEditingTask(latestTask)
    setEditingDraft(merged)
    setLatestTask(null)
    setEditError(null)
  }

  const saveEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTask || !editingDraft || !(editorPermissions.canEdit && permitsCapability(capabilityCeiling, "edit")) || reviewLoading || latestTask) return

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

    let updates: TaskUpdate
    try { updates = buildTaskUpdate(editingTask, { ...editingDraft, title }) }
    catch (caughtError) { setEditError(caughtError instanceof Error ? caughtError.message : "Check the deadline."); return }
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
      compact={compactToolbar}
      active={active}
      capabilityCeiling={capabilityCeiling}
      members={members}
      currentUserEmail={currentUserEmail}
      workspaceOwnerId={workspaceOwnerId}
      timeZone={timeZone}
      operatingTaskId={operatingTaskId}
      onToggleTask={handleToggleTask}
      onEditTask={handleEditTask}
      onStartEdit={onOpenTask ? task => onOpenTask(task.id) : openEditor}
      onConfirmDelete={setDeleteConfirm}
    />
  )

  return (
    <div className={compactToolbar ? "@container space-y-3 p-3 sm:p-4" : "@container space-y-4 p-4 sm:p-5"}>
      {compactToolbar && <h2 ref={boardHeading} tabIndex={-1} className="sr-only">Tasks</h2>}
      {permitsCapability(capabilityCeiling, "create") && <>
        <div aria-label="New task form" hidden={compactToolbar && !quickAddOpen}>
          {compactToolbar && <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" className="min-h-11" aria-label="Close new task" onClick={() => { setQuickAddOpen(false); boardHeading.current?.focus() }}>Close</Button></div>}
          <TaskQuickAdd onAddTask={onAddTask} onReviewBoard={onReviewBoard} focusRequest={compactToolbar && !quickAddOpen ? undefined : focusQuickAdd} onDirtyChange={setQuickAddDirty} draftScope={draftScope} />
        </div>
      </>}

      <TaskFilter
        compactToolbar={compactToolbar}
        onClearFilters={() => {
          if (paging) paging.changeFilters({ status: "all", priority: undefined, assigneeEmail: undefined })
          else { setSelectedStatus("all"); setSelectedPriority("all"); setSelectedAssignee(null) }
        }}
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="text-sm text-muted-foreground">
          {paging && <span className={compactToolbar ? "sr-only" : "mr-3 text-xs"}>Workspace totals</span>}
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
      <div className={compactToolbar ? "space-y-5" : "grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3"} aria-label="Task board">
        {loading ? (
          <Card className="rounded-[var(--saathi-radius-card)] border-border bg-card p-8 text-center @lg:col-span-2 @3xl:col-span-3">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          </Card>
        ) : (
          <>
            {compactToolbar && filteredTasks.length === 0 && <p role="status" className="py-6 text-center text-sm text-muted-foreground">{paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : tasks.length === 0 && !searchQuery && selectedStatus === "all" && selectedPriority === "all" && !selectedAssignee ? "No tasks yet." : "No tasks match these filters."}</p>}
            <TaskColumn
              compact={compactToolbar}
              title="To do"
              count={todoTasks.length}
              emptyMessage={(paging ? paging.aggregates?.total === 0 : tasks.length === 0) && !searchQuery && selectedStatus === "all" && selectedPriority === "all" && !selectedAssignee ? "No tasks yet. Add one above." : paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : "No tasks match these filters."}
            >
              {todoTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              compact={compactToolbar}
              title="In progress"
              count={inProgressTasks.length}
              emptyMessage={paging?.nextCursor ? "No matching tasks on this page. Load more to check remaining results." : paging ? "No in-progress tasks match these filters." : "Tasks you are actively working on will appear here."}
            >
              {inProgressTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              compact={compactToolbar}
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
        open={active && !!deleteConfirm}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        actionLabel="Delete"
        onConfirm={() => deleteConfirm && handleDeleteTask(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={operatingTaskId === deleteConfirm}
      />
      <TaskEditorDialog
        draftScope={draftScope}
        task={editorPresented ? editingTask : null}
        draft={editorPresented ? editingDraft : null}
        canEdit={(editorPermissions.canEdit && permitsCapability(capabilityCeiling, "edit"))}
        canComment={permitsCapability(capabilityCeiling, "comment")}
        error={editError}
        latestTask={latestTask}
        reviewLoading={reviewLoading}
        onReviewLatest={reviewLatestTask}
        onKeepDraft={keepTaskDraft}
        onUseLatest={() => { if (latestTask) openEditor(latestTask) }}
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
  compact = false,
}: {
  compact?: boolean
  title: string
  count: number
  emptyMessage: string
  children: ReactNode
}) {
  if (compact && count === 0) return null
  return (
    <section className={compact ? "min-w-0" : "min-w-0 rounded-[var(--saathi-radius-container)] bg-secondary/40 p-3"} aria-label={`${title} tasks`}>
      <div className={compact ? "mb-2 flex items-center justify-between px-1" : "mb-4 flex items-center justify-between border-b border-border pb-3"}>
        <h3 className="saathi-label text-muted-foreground">{title}</h3>
        <Badge variant="outline" className="border-border bg-card text-muted-foreground">
          {count}
        </Badge>
      </div>
      <div className={compact ? "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" : "space-y-3"}>
        {count > 0 ? children : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  )
}

export function TaskEditorDialog({
  draftScope,
  task,
  draft,
  canEdit,
  canComment = true,
  error,
  latestTask,
  reviewLoading = false,
  onReviewLatest,
  onKeepDraft,
  onUseLatest,
  isSaving,
  members,
  commentRefreshEvent,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  draftScope?: string
  task: Task | null
  draft: TaskEditorDraft | null
  canEdit: boolean
  canComment?: boolean
  error: string | null
  latestTask?: Task | null
  reviewLoading?: boolean
  onReviewLatest?: () => Promise<void>
  onKeepDraft?: () => void
  onUseLatest?: () => void
  isSaving: boolean
  members: Member[]
  commentRefreshEvent?: RealtimeEvent | null
  onDraftChange: (changes: Partial<TaskEditorDraft>) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [discardConfirm, setDiscardConfirm] = useState(false)
  useEffect(() => { setDiscardConfirm(false) }, [task?.id])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const requestClose = () => {
    if (isSaving) return
    if (task && draft) {
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
      <DialogContent onOpenAutoFocus={event => { event.preventDefault(); headingRef.current?.focus() }} className="saathi-mobile-controls flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-h-[calc(100dvh-0.5rem)] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:animate-none! max-sm:rounded-b-none max-sm:rounded-t-2xl sm:max-w-2xl" showCloseButton={!isSaving}>
        <DialogHeader className="border-b border-border bg-secondary/35 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-start gap-3 text-left">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SquarePen className="size-5" />
            </div>
            <div>
              <DialogTitle ref={headingRef} tabIndex={-1} className="text-xl outline-none">{canEdit ? "Edit task" : "Task details"}</DialogTitle>
              <DialogDescription className="sr-only">
                {canEdit ? "Update the details that help your team understand and move this work." : canComment ? "Review the task and discuss the work with your team below." : "Review the retained task details and discussion."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {task && draft && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <form id="task-editor-form" className="space-y-6" onSubmit={onSubmit}>
              <fieldset disabled={!canEdit || isSaving} className="space-y-6">
              <section aria-label="Task details" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-edit-title">Title</Label>
                  <Input
                    id="task-edit-title"
                    ref={titleInputRef}
                    value={draft.title}
                    onChange={(event) => onDraftChange({ title: event.target.value })}
                    disabled={isSaving}
                    maxLength={200}
                    className="h-11 bg-card text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-edit-description">Description</Label>
                  <Textarea
                    id="task-edit-description"
                    value={draft.description}
                    onChange={(event) => onDraftChange({ description: event.target.value })}
                    disabled={isSaving}
                    maxLength={1000}
                    rows={3}
                    placeholder="Add useful context, acceptance notes, or a link..."
                    className="resize-y bg-card"
                  />
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
                  <div className="min-w-0 space-y-2">
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
                  <div className="min-w-0 space-y-2">
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
              </fieldset>
              </form>

              <TaskComments taskId={task.id} draftScope={draftScope} key={`comments:${task.id}`} readOnly={!canComment} refreshEvent={commentRefreshEvent} />

              <details
                key={`details:${task.id}`}
                open={error ? true : undefined}
                onInvalidCapture={event => { event.currentTarget.open = true }}
                className="border-t border-border pt-4"
              >
                <summary className="cursor-pointer rounded-sm py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">More details</summary>
                <fieldset disabled={!canEdit || isSaving} className="grid gap-4 pt-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-priority">Priority</Label>
                    <select
                      id="task-edit-priority" form="task-editor-form"
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
                    <Input id="task-edit-due-date" form="task-editor-form" type="date" value={draft.dueDate} onChange={(event) => onDraftChange({ dueDate: event.target.value })} disabled={isSaving} className="h-10 bg-card" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-due-time">Due time ({Intl.DateTimeFormat().resolvedOptions().timeZone}) <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="task-edit-due-time" form="task-editor-form" type="time" value={draft.dueTime} onChange={(event) => onDraftChange({ dueTime: event.target.value })} disabled={isSaving || !draft.dueDate} className="h-10 bg-card" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-edit-estimate">Estimate <span className="font-normal text-muted-foreground">(minutes)</span></Label>
                    <Input id="task-edit-estimate" form="task-editor-form" type="number" min={1} max={1440} step={1} value={draft.estimatedMinutes} onChange={(event) => onDraftChange({ estimatedMinutes: event.target.value })} disabled={isSaving} placeholder="e.g. 45" className="h-10 bg-card" />
                  </div>
                </fieldset>
              </details>

              {error && <p className="rounded-[var(--saathi-radius-control)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
              {error && onReviewLatest && <Button type="button" variant="outline" disabled={isSaving || reviewLoading} onClick={() => void onReviewLatest()}>{reviewLoading ? "Loading latest task..." : "Review latest task"}</Button>}
              {latestTask && <section aria-label="Latest saved task" className="space-y-3 rounded-lg border border-border p-3">
                <h3 className="font-semibold">Latest saved task</h3>
                <dl className="space-y-1 text-sm">{Object.entries(toTaskEditorDraft(latestTask)).map(([key, value]) => <div key={key}><dt className="font-medium">{{ title: "Title", description: "Description", priority: "Priority", status: "Status", dueDate: "Due date", dueTime: `Due time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`, estimatedMinutes: "Estimate (minutes)", assigneeEmail: "Assignee" }[key as keyof TaskEditorDraft]}</dt><dd className="break-words">{value || "None"}</dd></div>)}</dl>
                <p className="text-sm">Your draft is retained. Review these values before keeping your edited fields or replacing your draft.</p>
                <div className="flex flex-wrap gap-2"><Button type="button" onClick={onKeepDraft}>Keep my changes</Button><Button type="button" variant="outline" onClick={onUseLatest}>Use latest task</Button></div>
              </section>}

            </div>

            <DialogFooter className="flex-row border-t border-border bg-secondary/45 px-5 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <Button type="button" variant="outline" className="max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-1" onClick={requestClose} disabled={isSaving}>{canEdit ? "Cancel" : "Close"}</Button>
              {canEdit && <Button type="submit" form="task-editor-form" className="max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-1" disabled={isSaving || reviewLoading || Boolean(latestTask)}>{isSaving ? <Loader2 className="size-4 animate-spin" /> : null}Save changes</Button>}
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
  active?: boolean
  compact?: boolean
  capabilityCeiling?: CapabilityCeiling
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
  compact = false,
  active = true,
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
  capabilityCeiling,
}: TaskListItemProps) {
  const taskPermissions = useTaskPermissions(
    currentUserEmail,
    { id: task.workspaceId, ownerId: workspaceOwnerId },
    task,
  )

  if (compact) {
    const owner = members.find(member => member.email.toLowerCase() === task.assigneeEmail?.toLowerCase())
    const due = formatTaskDue(task.dueAt, task.dueDate, timeZone)
    return <Card data-task-row={task.id} className="rounded-none border-0 bg-card p-0 shadow-none">
      <div className="flex items-start gap-2 px-2 py-2">
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={task.completed ? "Reopen " + task.title : "Complete " + task.title} aria-pressed={task.completed} disabled={operatingTaskId === task.id || !(taskPermissions.canToggle && permitsCapability(capabilityCeiling, "edit"))} onClick={() => onToggleTask(task.id)}>
          {operatingTaskId === task.id ? <Loader2 className="size-5 animate-spin" /> : task.completed ? <CheckCircle2 className="size-5 text-[var(--saathi-success)]" /> : <Circle className="size-5" />}
        </Button>
        <div className="min-w-0 flex-1">
          <button type="button" className={"line-clamp-2 min-h-11 w-full break-words text-left text-base font-medium leading-6 sm:text-sm sm:leading-5 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring " + (task.completed ? "text-muted-foreground line-through" : "text-foreground")} aria-label={(taskPermissions.canEdit && permitsCapability(capabilityCeiling, "edit") ? "Edit " : "Open ") + task.title} title={task.title} onClick={() => onStartEdit(task)}>{task.title}</button>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-xs text-muted-foreground">
            <span className="max-w-40 truncate" title={task.assigneeEmail ?? undefined}>{task.assigneeEmail ? owner?.username || task.assigneeEmail : "Unassigned"}</span>
            {due && <span>Due {due}</span>}
            {task.priority === "high" && <span className="inline-flex items-center gap-1 text-[var(--saathi-danger)]"><Flag className="size-3" aria-hidden="true" />High</span>}
          </div>
        </div>
        {active && taskPermissions.canDelete && permitsCapability(capabilityCeiling, "delete") && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={"Task actions for " + task.title} disabled={operatingTaskId === task.id}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-labelledby={undefined} aria-label={"Actions for " + task.title}><DropdownMenuItem variant="destructive" className="min-h-11" onSelect={() => onConfirmDelete(task.id)}>Delete task</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>}
      </div>
    </Card>
  }

  return (
    <Card className="group rounded-[var(--saathi-radius-card)] border border-border bg-card p-4 shadow-none transition-colors duration-200 hover:border-primary/30 hover:bg-muted/20">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleTask(task.id)}
            disabled={operatingTaskId === task.id || !(taskPermissions.canToggle && permitsCapability(capabilityCeiling, "edit"))}
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
            aria-label={`${(taskPermissions.canEdit && permitsCapability(capabilityCeiling, "edit")) ? "Edit" : "Open"} ${task.title}`}
            className={`min-w-0 flex-1 break-words cursor-pointer text-left text-base font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${task.completed ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary/80"}`}
          >
            {task.title}
          </button>
          <div className="flex items-center gap-2 opacity-100 transition-opacity duration-200 focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {(taskPermissions.canDelete && permitsCapability(capabilityCeiling, "delete")) && (
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
            <p className="break-words text-sm text-muted-foreground">{task.description}</p>
          </div>
        )}

        <div className="ml-9 space-y-2 border-t border-border pt-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <select
                value={task.status ?? (task.completed ? "done" : "todo")}
              onChange={(event) => onEditTask(task.id, { status: event.target.value as TaskStatus })}
                disabled={operatingTaskId === task.id || !(taskPermissions.canEdit && permitsCapability(capabilityCeiling, "edit"))}
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
            <select
              value={task.assigneeEmail || ""}
              onChange={(e) => onEditTask(task.id, { assigneeEmail: e.target.value || "" })}
              disabled={operatingTaskId === task.id || !(taskPermissions.canAssign && permitsCapability(capabilityCeiling, "edit"))}
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
