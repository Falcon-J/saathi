"use client"

import { Task } from "../actions"
import { TaskItem } from "./TaskItem"
import { AddTaskForm } from "./AddTaskForm"
import { TaskToolbar } from "./TaskToolbar"
import { useState } from "react"

interface TaskListProps {
    tasks: Task[]
    workspaceId: string
    onTaskUpdate: () => void
}

export function TaskList({ tasks, workspaceId, onTaskUpdate }: TaskListProps) {
    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
    const [sortBy, setSortBy] = useState<'created' | 'priority' | 'dueDate'>('created')

    const filteredTasks = tasks.filter(task => {
        if (filter === 'active') return !task.completed
        if (filter === 'completed') return task.completed
        return true
    })

    const sortedTasks = [...filteredTasks].sort((a, b) => {
        switch (sortBy) {
            case 'priority':
                const priorityOrder = { high: 3, medium: 2, low: 1 }
                return priorityOrder[b.priority] - priorityOrder[a.priority]
            case 'dueDate':
                if (!a.dueDate && !b.dueDate) return 0
                if (!a.dueDate) return 1
                if (!b.dueDate) return -1
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
    })

    return (
        <div className="space-y-4">
            <TaskToolbar
                filter={filter}
                sortBy={sortBy}
                onFilterChange={setFilter}
                onSortChange={setSortBy}
                taskCount={tasks.length}
                completedCount={tasks.filter(t => t.completed).length}
            />

            <AddTaskForm workspaceId={workspaceId} onTaskAdded={onTaskUpdate} />

            <div className="space-y-2">
                {sortedTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        {filter === 'all' ? 'No tasks yet. Create your first task above!' : `No ${filter} tasks.`}
                    </div>
                ) : (
                    sortedTasks.map(task => (
                        <TaskItem
                            key={task.id}
                            task={task}
                            onTaskUpdate={onTaskUpdate}
                        />
                    ))
                )}
            </div>
        </div>
    )
}