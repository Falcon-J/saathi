"use client"

import { Task, updateTask, deleteTask, toggleTask } from "../actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
    Calendar,
    Clock,
    MoreVertical,
    Pencil,
    Trash2,
    User
} from "lucide-react"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface TaskItemProps {
    task: Task
    onTaskUpdate: () => void
}

export function TaskItem({ task, onTaskUpdate }: TaskItemProps) {
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const handleToggle = async () => {
        setLoading(true)
        try {
            const result = await toggleTask(task.id)
            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                onTaskUpdate()
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update task",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this task?")) return

        setLoading(true)
        try {
            const result = await deleteTask(task.id)
            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Success",
                    description: "Task deleted successfully"
                })
                onTaskUpdate()
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete task",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'bg-red-100 text-red-800 border-red-200'
            case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
            case 'low': return 'bg-green-100 text-green-800 border-green-200'
            default: return 'bg-gray-100 text-gray-800 border-gray-200'
        }
    }

    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed

    return (
        <Card className={`transition-all ${task.completed ? 'opacity-60' : ''} ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <Checkbox
                        checked={task.completed}
                        onCheckedChange={handleToggle}
                        disabled={loading}
                        className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                                <h3 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                    {task.title}
                                </h3>
                                {task.description && (
                                    <p className={`text-sm mt-1 ${task.completed ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                                        {task.description}
                                    </p>
                                )}
                            </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={getPriorityColor(task.priority)}>
                                {task.priority}
                            </Badge>

                            {task.dueDate && (
                                <Badge variant="outline" className={`flex items-center gap-1 ${isOverdue ? 'bg-red-100 text-red-800 border-red-200' : ''}`}>
                                    <Calendar className="h-3 w-3" />
                                    {new Date(task.dueDate).toLocaleDateString()}
                                </Badge>
                            )}

                            {task.assigneeEmail && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {task.assigneeEmail}
                                </Badge>
                            )}

                            <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                <Clock className="h-3 w-3" />
                                {new Date(task.createdAt).toLocaleDateString()}
                            </Badge>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}