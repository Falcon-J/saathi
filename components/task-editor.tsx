"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { X, Plus, Calendar } from "lucide-react"
import type { Task } from "@/app/actions/tasks"

interface TaskEditorProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onClose: () => void
}

export function TaskEditor({ task, onUpdate, onClose }: TaskEditorProps) {
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(task.dueDate || "")
  const [categoryInput, setCategoryInput] = useState("")
  const [categories, setCategories] = useState(task.categories || [])

  const handleAddCategory = () => {
    if (categoryInput.trim() && !categories.includes(categoryInput.trim())) {
      setCategories([...categories, categoryInput.trim()])
      setCategoryInput("")
    }
  }

  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat))
  }

  const handleSave = () => {
    onUpdate({
      title: title || task.title,
      dueDate: dueDate || undefined,
      categories,
    })
    onClose()
  }

  return (
    <Card className="p-4 bg-card border-border space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="bg-background border-border"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Due Date
        </label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-background border-border"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Categories</label>
        <div className="flex gap-2">
          <Input
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
            placeholder="Add category"
            className="bg-background border-border"
          />
          <Button onClick={handleAddCategory} size="sm" variant="outline">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-2 px-2 py-1 bg-primary/10 text-primary rounded text-sm">
              {cat}
              <button onClick={() => handleRemoveCategory(cat)} className="hover:text-primary/70">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </Card>
  )
}
