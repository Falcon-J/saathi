"use client"

import { useState, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Circle, Trash2, Plus, Loader2, Users, Edit2, Check, X, Calendar, Flag, Clock, AlertCircle } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { TaskFilter } from "@/components/task-filter"
import { useToast } from "@/hooks/use-toast"
import { useTaskPermissions } from "@/hooks/usePermissions"
import type { Member } from "@/app/actions/workspaces"

interface Task {
  id: string
  title: string
  description?: string
  completed: boolean
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
  onAssignTask: (taskId: string, memberId: string | null) => Promise<any>
  onEditTask?: (taskId: string, updates: Partial<Task>) => Promise<any>
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
  onAssignTask,
  onEditTask,
}: TaskListProps) {
  const [input, setInput] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Partial<Task>>({})
  const [editingTitle, setEditingTitle] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<"all" | "active" | "completed">("all")
  const [selectedPriority, setSelectedPriority] = useState<"all" | "low" | "medium" | "high">("all")
  const { toast } = useToast()

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
      toast({ title: "Error", description: "Task title cannot be empty", variant: "destructive" })
      return
    }

    setIsAdding(true)
    try {
      const result = await onAddTask(input, description, priority, dueDate || undefined)
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Success", description: "Task added" })
        setInput("")
        setDescription("")
        setPriority('medium')
        setDueDate("")
        setShowAddForm(false)
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to add task", variant: "destructive" })
    } finally {
      setIsAdding(false)
    }
  }

  const handleToggleTask = async (taskId: string) => {
    setOperatingTaskId(taskId)
    try {
      const result = await onToggleTask(taskId)
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to toggle task", variant: "destructive" })
    } finally {
      setOperatingTaskId(null)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    setOperatingTaskId(taskId)
    try {
      const result = await onDeleteTask(taskId)
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Success", description: "Task deleted" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" })
    } finally {
      setDeleteConfirm(null)
      setOperatingTaskId(null)
    }
  }

  const handleEditTask = async (taskId: string) => {
    if (!editingTitle?.trim()) {
      toast({ title: "Error", description: "Task title cannot be empty", variant: "destructive" })
      return
    }

    setOperatingTaskId(taskId)
    try {
      const result = await onEditTask?.(taskId, { title: editingTitle })
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Success", description: "Task updated" })
        setEditingTaskId(null)
        setEditingTitle("")
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to edit task", variant: "destructive" })
    } finally {
      setOperatingTaskId(null)
    }
  }

  const handleAssignTask = async (taskId: string, memberId: string | null) => {
    setOperatingTaskId(taskId)
    try {
      const result = await onAssignTask(taskId, memberId)
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to assign task", variant: "destructive" })
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
      case 'high': return 'bg-red-500/10 text-red-700 border-red-300'
      case 'medium': return 'bg-yellow-500/10 text-yellow-700 border-yellow-300'
      case 'low': return 'bg-green-500/10 text-green-700 border-green-300'
      default: return 'bg-gray-500/10 text-gray-700 border-gray-300'
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

  return (
    <div className="space-y-6 p-6">
      {/* Enhanced Add Task */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border-2 border-primary/20 shadow-sm">
        {!showAddForm ? (
          <Button
            onClick={() => setShowAddForm(true)}
            variant="outline"
            className="w-full border-2 border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 text-primary font-semibold py-8"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Task
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="Task title..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isAdding}
                className="bg-background/80 border-2 border-border focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 shadow-sm"
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
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <Textarea
              placeholder="Task description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isAdding}
              className="bg-background/80 border-2 border-border focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 shadow-sm resize-none"
              rows={2}
            />

            <div className="flex gap-3">
              <Select value={priority} onValueChange={(value: 'low' | 'medium' | 'high') => setPriority(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <Circle className="w-3 h-3 text-green-600" />
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
                      <AlertCircle className="w-3 h-3 text-red-600" />
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
                className="w-40 bg-background/80 border-2 border-border focus:border-primary"
              />

              <Button
                onClick={handleAddTask}
                disabled={isAdding || !input.trim()}
                className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground px-6 disabled:opacity-50 shadow-lg font-semibold"
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

      {/* Enhanced Stats */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium text-green-700">{completedCount} completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="font-medium text-blue-700">{tasks.length - completedCount} pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span className="font-medium text-muted-foreground">{tasks.length} total</span>
          </div>
        </div>
        {filteredTasks.length !== tasks.length && (
          <div className="text-sm text-muted-foreground font-medium">
            Showing {filteredTasks.length} of {tasks.length}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-2">
        {loading ? (
          <Card className="p-8 text-center bg-card border-border">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-to-br from-muted/30 to-muted/10 border-2 border-dashed border-border/50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg font-medium">
                {tasks.length === 0 ? "No tasks yet. Create one to get started!" : "No tasks match your filters."}
              </p>
            </div>
          </Card>
        ) : (
          filteredTasks.map((task) => {
            // Calculate permissions for this task
            const taskPermissions = useTaskPermissions(
              currentUserEmail,
              { id: task.workspaceId, ownerId: workspaceOwnerId },
              task
            )

            return (
              <Card key={task.id} className="p-5 bg-gradient-to-r from-card to-card/80 border-2 border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleTask(task.id)}
                      disabled={operatingTaskId === task.id}
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-all duration-200 hover:scale-110 disabled:opacity-50 p-1 rounded-full hover:bg-primary/10"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      ) : (
                        <Circle className="w-6 h-6 hover:text-primary" />
                      )}
                    </button>

                    {editingTaskId === task.id ? (
                      <div className="flex-1 flex gap-2">
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="bg-input border-border text-foreground text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditTask(task.id)}
                          disabled={operatingTaskId === task.id}
                          className="text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingTaskId(null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`flex-1 text-base cursor-pointer hover:text-primary transition-colors font-medium ${task.completed ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary/80"
                            }`}
                          onClick={() => {
                            setEditingTaskId(task.id)
                            setEditingTitle(task.title)
                          }}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {taskPermissions.canEdit && (
                            <button
                              onClick={() => {
                                setEditingTaskId(task.id)
                                setEditingTitle(task.title)
                              }}
                              className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-md hover:bg-primary/10"
                              title="Edit task"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {taskPermissions.canDelete && (
                            <button
                              onClick={() => setDeleteConfirm(task.id)}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
                              title="Delete task"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Task Description */}
                  {task.description && (
                    <div className="ml-9 mt-2">
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    </div>
                  )}

                  {/* Task Metadata */}
                  <div className="ml-9 pt-2 space-y-2 border-t border-border/30">
                    {/* Priority and Due Date */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Flag className={`w-3 h-3 ${task.priority === 'high' ? 'text-red-500' :
                          task.priority === 'medium' ? 'text-yellow-500' : 'text-green-500'
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

                    {/* Assignment */}
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground font-medium">Assigned to:</span>
                      <select
                        value={task.assigneeEmail || ""}
                        onChange={(e) => handleAssignTask(task.id, e.target.value || null)}
                        disabled={operatingTaskId === task.id}
                        className="text-sm bg-background border-2 border-border rounded-md px-3 py-1.5 text-foreground cursor-pointer hover:border-primary/50 focus:border-primary disabled:opacity-50 font-medium shadow-sm"
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
    </div>
  )
})
