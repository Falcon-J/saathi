"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { CheckCircle2, Circle, Trash2, Edit2, Calendar } from "lucide-react"
import { TaskEditor } from "./task-editor"
import type { Task } from "@/app/actions/tasks"

interface TaskCardProps {
  id: string
  title: string
  completed: boolean
  dueDate?: string
  categories?: string[]
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Task>) => void
}

export function TaskCard({ id, title, completed, dueDate, categories, onToggle, onDelete, onUpdate }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false)

  const isDueToday = dueDate && new Date(dueDate).toDateString() === new Date().toDateString()
  const isOverdue = dueDate && new Date(dueDate) < new Date() && !completed

  return (
    <>
      {isEditing ? (
        <TaskEditor
          task={{ id, title, completed, dueDate, categories, createdAt: "" }}
          onUpdate={(updates) => onUpdate(id, updates)}
          onClose={() => setIsEditing(false)}
        />
      ) : (
        <Card className="p-4 bg-card border-border hover:border-primary/50 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggle(id)}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                {completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5" />}
              </button>
              <span
                className={`flex-1 text-sm sm:text-base ${
                  completed ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {title}
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(id)}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 ml-8">
              {dueDate && (
                <div
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                    isOverdue
                      ? "bg-destructive/10 text-destructive"
                      : isDueToday
                        ? "bg-yellow-500/10 text-yellow-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  {new Date(dueDate).toLocaleDateString()}
                </div>
              )}
              {categories?.map((cat) => (
                <div key={cat} className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                  {cat}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </>
  )
}
