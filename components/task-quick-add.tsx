"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getMutationError } from "@/lib/mutation-result"
import { localDateTimeToIso } from "@/lib/task-time"

type TaskQuickAddProps = {
  onAddTask: (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => Promise<unknown>
  onReviewBoard?: () => Promise<void>
  focusRequest?: number
}

export function TaskQuickAdd({ onAddTask, onReviewBoard, focusRequest }: TaskQuickAddProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [dueDate, setDueDate] = useState("")
  const [dueTime, setDueTime] = useState("")
  const [estimatedMinutes, setEstimatedMinutes] = useState("")
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsReconciliation, setNeedsReconciliation] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [added, setAdded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef(false)

  useEffect(() => { if (focusRequest) inputRef.current?.focus() }, [focusRequest])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || saving || pendingRef.current || needsReconciliation) return
    const estimate = estimatedMinutes ? Number(estimatedMinutes) : undefined
    if (estimate !== undefined && (!Number.isInteger(estimate) || estimate < 1 || estimate > 1440)) {
      setError("Estimate must be a whole number between 1 and 1440 minutes.")
      return
    }
    if (dueTime && !dueDate) { setError("Choose a due date before adding a due time."); return }
    pendingRef.current = true
    setSaving(true)
    setAdded(false)
    setError(null)
    try {
      const result = await onAddTask(title.trim(), description || undefined, priority, dueTime ? undefined : dueDate || undefined, undefined, estimate, localDateTimeToIso(dueDate, dueTime))
      const mutationError = getMutationError(result)
      if (result && typeof result === "object" && "unknownOutcome" in result && result.unknownOutcome === true) {
        setNeedsReconciliation(true)
        setError("Unable to confirm the task was saved. Refresh the workspace before retrying.")
      } else if (mutationError) setError(mutationError)
      else {
        setTitle(""); setDescription(""); setPriority("medium"); setDueDate(""); setDueTime(""); setEstimatedMinutes(""); setDetailsOpen(false)
        setAdded(true)
      }
    } catch {
      setNeedsReconciliation(true)
      setError("Unable to confirm the task was saved. Refresh the workspace before retrying.")
    } finally { pendingRef.current = false; setSaving(false) }
  }

  const reviewBoard = async () => {
    if (!onReviewBoard || reviewing) return
    setReviewing(true)
    try {
      await onReviewBoard()
      setNeedsReconciliation(false)
      setError("Workspace refreshed. Check whether this task already exists before retrying.")
    } catch { setError("Unable to refresh the workspace. Refresh must succeed before retrying.") }
    finally { setReviewing(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-secondary/25 p-3 sm:p-4" aria-label="Add a task">
      <div className="flex gap-2">
        <Input ref={inputRef} aria-label="Task title" placeholder="What needs to get done?" value={title} onChange={event => { setTitle(event.target.value); setAdded(false) }} maxLength={200} disabled={saving} className="min-w-0 flex-1 bg-card" />
        <Button type="submit" disabled={!title.trim() || saving || needsReconciliation}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{saving ? "Adding…" : "Add"}</Button>
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 px-1 text-xs text-muted-foreground" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} disabled={saving}>{detailsOpen ? "Hide details" : "Add details"}</Button>
      {detailsOpen && <div className="mt-2 space-y-3">
        <label className="block space-y-1 text-xs font-medium">Description <span className="text-muted-foreground">(optional)</span><Textarea aria-label="Task description" value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} disabled={saving} rows={2} className="bg-card" /></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-medium">Priority<select aria-label="Task priority" value={priority} onChange={event => setPriority(event.target.value as typeof priority)} disabled={saving} className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="space-y-1 text-xs font-medium">Deadline date<Input aria-label="Task due date" type="date" value={dueDate} onChange={event => { setDueDate(event.target.value); if (!event.target.value) setDueTime("") }} disabled={saving} className="bg-card" /></label>
          <label className="space-y-1 text-xs font-medium">Time <span className="text-muted-foreground">(optional)</span><Input aria-label="Task due time" type="time" value={dueTime} onChange={event => setDueTime(event.target.value)} disabled={saving || !dueDate} className="bg-card" /></label>
          <label className="space-y-1 text-xs font-medium">Estimate <span className="text-muted-foreground">(minutes)</span><Input aria-label="Task estimate in minutes" type="number" min={1} max={1440} step={1} value={estimatedMinutes} onChange={event => setEstimatedMinutes(event.target.value)} disabled={saving} placeholder="e.g. 45" className="bg-card" /></label>
        </div>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {added && <p role="status" className="mt-2 text-sm text-muted-foreground">Task added.</p>}
      {needsReconciliation && onReviewBoard && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={reviewing} onClick={reviewBoard}>Review Board before retrying</Button>}
    </form>
  )
}
