"use client"

import { useState, useMemo, memo, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Circle, Trash2, Plus, Loader2, Users, Edit2, X, Calendar, Flag, Clock, AlertCircle, SquarePen } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { TaskFilter } from "@/components/task-filter"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useTaskPermissions } from "@/hooks/usePermissions"
import type { Member } from "@/app/actions/workspaces"
import type { TaskStatus } from "@/app/tasks/actions"
import type { TaskUpdate } from "@/app/tasks/contract"
import { getMutationError } from "@/lib/mutation-result"
import { buildTaskUpdate, toTaskEditorDraft, type TaskEditorDraft } from "@/lib/task-draft"

interface Task {
  id: string
  title: string
  description?: string
  completed: boolean
  status?: TaskStatus
  assigneeEmail?: string
  priority: 'low' | 'medium' | 'high'
  dueDate?: string
  createdAt: string
  updatedAt: string
  workspaceId: string
  createdBy: string
}

interface TaskListProps {
  tasks: Task[]
  loading: boolean
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  onAddTask: (title: string, description?: string, priority?: 'low' | 'medium' | 'high', dueDate?: string) => Promise<any>
  onToggleTask: (id: string) => Promise<any>
  onDeleteTask: (id: string) => Promise<any>
  onEditTask: (taskId: string, updates: TaskUpdate) => Promise<unknown>
}

export const TaskList = memo(function TaskList({
  tasks,
  loading,
  members,
  currentUserEmail,
  workspaceOwnerId,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
}: TaskListProps) {
  const [input, setInput] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingDraft, setEditingDraft] = useState<TaskEditorDraft | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<"all" | "active" | "completed">("all")
  const [selectedPriority, setSelectedPriority] = useState<"all" | "low" | "medium" | "high">("all")

  const filteredTasks = useMemo(() => {
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
  }, [tasks, searchQuery, selectedStatus, selectedAssignee, selectedPriority])

  const handleAddTask = async () => {
    if (!input.trim()) {
      return
    }

    setIsAdding(true)
    try {
      const result = await onAddTask(input, description, priority, dueDate || undefined)
      if (!getMutationError(result)) {
        setInput("")
        setDescription("")
        setPriority('medium')
        setDueDate("")
        setShowAddForm(false)
      }
    } finally {
      setIsAdding(false)
    }
  }

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
    if (!editingTask || !editingDraft) return

    const title = editingDraft.title.trim()
    if (!title) {
      setEditError("Task title is required.")
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
      const result = await onEditTask(editingTask.id, updates)
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

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
  }

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const today = new Date()
    const diffTime = date.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays === -1) return "Yesterday"
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`
    if (diffDays <= 7) return `${diffDays} days left`
    return date.toLocaleDateString()
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
      operatingTaskId={operatingTaskId}
      onToggleTask={handleToggleTask}
      onEditTask={handleEditTask}
      onStartEdit={openEditor}
      onConfirmDelete={setDeleteConfirm}
    />
  )

  return (
    <div className="space-y-6 p-6">
      <Card className="rounded-[var(--saathi-radius-card)] border-border bg-card p-5 shadow-none">
        {!showAddForm ? (
          <Button
            onClick={() => setShowAddForm(true)}
            className="w-full border border-primary bg-primary py-8 text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Task
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Task title..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isAdding}
                className="flex-1 border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
              />
              <Button
                onClick={() => {
                  setShowAddForm(false)
                  setInput("")
                  setDescription("")
                  setPriority('medium')
                  setDueDate("")
                }}
                variant="outline"
                size="sm"
                disabled={isAdding}
                aria-label="Cancel adding task"
                title="Cancel adding task"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <Textarea
              placeholder="Task description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isAdding}
              className="resize-none border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
              rows={2}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={priority} onValueChange={(value: 'low' | 'medium' | 'high') => setPriority(value)}>
                <SelectTrigger className="w-full sm:w-32" aria-label="Task priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <Circle className="w-3 h-3 text-[var(--saathi-success)]" />
                      Low
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center gap-2">
                      <Flag className="w-3 h-3 text-yellow-600" />
                      Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 text-destructive" />
                      High
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isAdding}
                aria-label="Task due date"
                className="w-full border-border bg-card focus:border-primary sm:w-40"
              />

              <Button
                onClick={handleAddTask}
                disabled={isAdding || !input.trim()}
                className="w-full px-6 disabled:opacity-50 sm:w-auto"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span className="ml-2">Add Task</span>
              </Button>
            </div>
          </div>
        )}
      </Card>

      <TaskFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedAssignee={selectedAssignee}
        onFilterByAssignee={setSelectedAssignee}
        selectedStatus={selectedStatus}
        onFilterByStatus={setSelectedStatus}
        selectedPriority={selectedPriority}
        onFilterByPriority={setSelectedPriority}
        members={members}
      />

      <div className="flex items-center justify-between rounded-[var(--saathi-radius-card)] border border-border px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{tasks.length - completedCount}</span> open
          <span className="mx-2 text-border">/</span>
          <span className="font-medium text-primary">{completedCount}</span> done
        </div>
        {filteredTasks.length !== tasks.length && (
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
              emptyMessage={tasks.length === 0 ? "No tasks yet. Add one above." : "No tasks match these filters."}
            >
              {todoTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              title="In progress"
              count={inProgressTasks.length}
              emptyMessage="Tasks you are actively working on will appear here."
            >
              {inProgressTasks.map(renderTask)}
            </TaskColumn>
            <TaskColumn
              title="Done"
              count={completedTasks.length}
              emptyMessage={tasks.length === 0 ? "Completed tasks will appear here." : "No completed tasks match these filters."}
            >
              {completedTasks.map(renderTask)}
            </TaskColumn>
          </>
        )}
      </div>

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
        error={editError}
        isSaving={Boolean(editingTask && operatingTaskId === editingTask.id)}
        members={members}
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

function TaskEditorDialog({
  task,
  draft,
  error,
  isSaving,
  members,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  task: Task | null
  draft: TaskEditorDraft | null
  error: string | null
  isSaving: boolean
  members: Member[]
  onDraftChange: (changes: Partial<TaskEditorDraft>) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Dialog open={Boolean(task && draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl sm:max-w-2xl" showCloseButton={!isSaving}>
        <DialogHeader className="border-b border-border bg-secondary/35 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-start gap-3 text-left">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SquarePen className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Edit task</DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                Update the details that help your team understand and move this work.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {task && draft && (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <section aria-labelledby="task-details-heading" className="space-y-4">
                <div>
                  <h3 id="task-details-heading" className="text-sm font-semibold">Task details</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Keep the title specific and add only the context needed to act.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-edit-title">Title</Label>
                  <Input
                    id="task-edit-title"
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

              {error && <p className="rounded-[var(--saathi-radius-control)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}. Review the latest task details and try again.</p>}
            </div>

            <DialogFooter className="border-t border-border bg-secondary/45 px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="size-4 animate-spin" /> : null}Save changes</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TaskListItemProps {
  task: Task
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
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
            disabled={!taskPermissions.canEdit}
            onClick={() => onStartEdit(task)}
            className={`flex-1 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-default ${taskPermissions.canEdit ? "cursor-pointer hover:text-primary" : "cursor-default"} ${task.completed ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary/80"}`}
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
              <span className="font-medium text-foreground/70">Status</span>
              <select
                value={task.status ?? (task.completed ? "done" : "todo")}
              onChange={(event) => onEditTask(task.id, { status: event.target.value as TaskStatus })}
                disabled={operatingTaskId === task.id || !taskPermissions.canEdit}
                aria-label={`Move ${task.title}`}
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

            {task.dueDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
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
