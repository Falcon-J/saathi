"use client"

import { useState } from "react"
import { addTask } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Plus, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AddTaskFormProps {
    workspaceId: string
    onTaskAdded: () => void
}

export function AddTaskForm({ workspaceId, onTaskAdded }: AddTaskFormProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        dueDate: '',
        assigneeEmail: ''
    })
    const { toast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.title.trim()) {
            toast({
                title: "Error",
                description: "Task title is required",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const result = await addTask(
                workspaceId,
                formData.title,
                formData.description || undefined,
                formData.dueDate || undefined,
                formData.assigneeEmail || undefined,
                formData.priority
            )

            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Success",
                    description: "Task created successfully"
                })
                setFormData({
                    title: '',
                    description: '',
                    priority: 'medium',
                    dueDate: '',
                    assigneeEmail: ''
                })
                setIsOpen(false)
                onTaskAdded()
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create task",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                className="w-full"
                variant="outline"
            >
                <Plus className="h-4 w-4 mr-2" />
                Add New Task
            </Button>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Create New Task</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="title">Title *</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Enter task title..."
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Enter task description..."
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="priority">Priority</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value: 'low' | 'medium' | 'high') =>
                                    setFormData(prev => ({ ...prev, priority: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="dueDate">Due Date</Label>
                            <div className="relative">
                                <Input
                                    id="dueDate"
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                                />
                                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="assignee">Assignee Email</Label>
                            <Input
                                id="assignee"
                                type="email"
                                value={formData.assigneeEmail}
                                onChange={(e) => setFormData(prev => ({ ...prev, assigneeEmail: e.target.value }))}
                                placeholder="user@example.com"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button type="submit" disabled={loading}>
                            {loading ? "Creating..." : "Create Task"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}