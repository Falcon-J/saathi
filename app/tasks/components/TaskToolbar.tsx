"use client"

import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
    Filter,
    SortAsc,
    CheckCircle,
    Circle,
    List
} from "lucide-react"

interface TaskToolbarProps {
    filter: 'all' | 'active' | 'completed'
    sortBy: 'created' | 'priority' | 'dueDate'
    onFilterChange: (filter: 'all' | 'active' | 'completed') => void
    onSortChange: (sort: 'created' | 'priority' | 'dueDate') => void
    taskCount: number
    completedCount: number
}

export function TaskToolbar({
    filter,
    sortBy,
    onFilterChange,
    onSortChange,
    taskCount,
    completedCount
}: TaskToolbarProps) {
    const activeCount = taskCount - completedCount

    return (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <List className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Tasks</span>
                    <Badge variant="outline">{taskCount}</Badge>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Circle className="h-3 w-3" />
                        <span>{activeCount} active</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        <span>{completedCount} completed</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filter} onValueChange={onFilterChange}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Tasks</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4 text-muted-foreground" />
                    <Select value={sortBy} onValueChange={onSortChange}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="created">Created</SelectItem>
                            <SelectItem value="priority">Priority</SelectItem>
                            <SelectItem value="dueDate">Due Date</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    )
}