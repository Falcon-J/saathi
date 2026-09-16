"use client"

import { useEffect, useState } from "react"
import { Activity, ChevronDown, RefreshCw } from "lucide-react"
import { getWorkspaceActivity } from "@/app/actions/activity"
import type { ActivityEvent } from "@/lib/data/activity"
import { Button } from "@/components/ui/button"

function describe(event: ActivityEvent): string {
  const action = typeof event.metadata.action === "string" ? event.metadata.action.replaceAll("_", " ") : null
  if (action) return action.charAt(0).toUpperCase() + action.slice(1)
  const labels: Record<string, string> = {
    "task-created": "Created a task",
    "task-updated": "Updated a task",
    "task-toggled": "Changed task status",
    "task-deleted": "Deleted a task",
    "task-comment-created": "Added a comment",
    "workspace-created": "Created the workspace",
    "workspace-updated": "Updated workspace settings",
    "invitation-updated": "Updated an invitation",
    "member-added": "Added a member",
    "member-removed": "Removed a member",
  }
  return labels[event.eventType] ?? "Updated workspace activity"
}

export function ActivityHistory({ workspaceId, refreshSignal }: { workspaceId: string; refreshSignal?: number }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    void getWorkspaceActivity(workspaceId).then(result => {
      if (!active) return
      setEvents(result.events ?? [])
      setError(result.error ?? null)
    }).catch(() => {
      if (active) setError("Unable to load activity. Please retry.")
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [open, refreshSignal, workspaceId])

  return (
    <section id="activity-history" className="rounded-xl border border-border bg-secondary/25 p-4" aria-label="Activity and history">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><div><p className="text-sm font-semibold">Activity and history</p><p className="text-xs text-muted-foreground">A read-only record of important workspace changes.</p></div></div>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide" : "Show"}<ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></Button>
      </div>
      {open && <div className="mt-4 border-t border-border pt-4">
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading activity…</p> : error ? <div className="flex items-center justify-between gap-3 text-sm text-destructive"><span>{error}</span><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}><RefreshCw className="size-4" />Close</Button></div> : events.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : <ol className="space-y-3">{events.map(event => <li key={event.id} className="flex gap-3 text-sm"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary/60" /><div><p><span className="font-medium">{event.actorUsername || event.actorEmail}</span> {describe(event).toLowerCase()}</p><time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time></div></li>)}</ol>}
      </div>}
    </section>
  )
}
