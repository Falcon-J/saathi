"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"
import { getWorkspaceActivity } from "@/app/actions/activity"
import type { ActivityEvent } from "@/lib/data/activity"
import { Button } from "@/components/ui/button"

function describe(event: ActivityEvent): string {
  const action = typeof event.metadata.action === "string" ? event.metadata.action.replaceAll("_", " ") : null
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
  const verb = action ? action.charAt(0).toLowerCase() + action.slice(1) : (labels[event.eventType] ?? "Updated workspace activity").toLowerCase()
  const title = typeof event.metadata.taskTitle === "string" ? event.metadata.taskTitle : null
  const description = title && event.entityType === "task" ? verb.replace(/ a task| task status| a comment/, '') + ` “${title}”` : verb
  const fieldLabels: Record<string, string> = { title: "title", description: "description", status: "status", priority: "priority", assigneeEmail: "assignee", dueAt: "due date", dueDate: "due date", estimatedMinutes: "estimate", bucket: "category" }
  const changed = Array.isArray(event.metadata.changedFields) ? [...new Set(event.metadata.changedFields.filter((key): key is string => typeof key === "string" && key in fieldLabels).map(key => fieldLabels[key]))] : []
  const statusLabels: Record<string, string> = { todo: "To do", "in-progress": "In progress", done: "Done" }
  const status = changed.includes("status") && typeof event.metadata.status === "string" ? statusLabels[event.metadata.status] : null
  return description + (changed.length ? ` · ${changed.join(", ")}${status ? ` → ${status}` : ""}` : "")
}

export function ActivityHistory({ workspaceId, refreshSignal }: { workspaceId: string; refreshSignal?: number }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [eventsWorkspaceId, setEventsWorkspaceId] = useState(workspaceId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const readVersion = useRef(0)
  const reading = useRef(false)
  const visibleEvents = eventsWorkspaceId === workspaceId ? events : []
  const filteredEvents = visibleEvents.filter(event => `${event.actorUsername || event.actorEmail} ${describe(event)}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))

  const loadActivity = useCallback(async (cursor?: string) => {
    if (cursor && reading.current) return
    const version = ++readVersion.current
    reading.current = true
    setLoading(true)
    setError(null)
    if (!cursor) setNextCursor(null)
    try {
      const result = await getWorkspaceActivity(workspaceId, cursor)
      if (version !== readVersion.current) return
      if (result.events) {
        setEvents(previous => cursor
          ? [...previous, ...result.events!.filter(event => !previous.some(existing => existing.id === event.id))]
          : result.events!)
        setNextCursor(result.nextCursor ?? null)
      }
      setEventsWorkspaceId(workspaceId)
      setError(result.error ?? null)
    } catch {
      if (version === readVersion.current) setError("Unable to load activity. Please retry.")
    } finally {
      if (version === readVersion.current) {
        setLoading(false)
        reading.current = false
      }
    }
  }, [workspaceId])

  useEffect(() => {
    setEvents([])
    setEventsWorkspaceId(workspaceId)
    setFilter("")
    return () => { readVersion.current += 1 }
  }, [workspaceId])

  useEffect(() => {
    void loadActivity()
    return () => { readVersion.current += 1 }
  }, [loadActivity, refreshSignal])

  return (
    <section id="activity-history" aria-label="Activity and history">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h2 className="text-lg font-semibold">History</h2></div>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <input aria-label="Filter history" placeholder="Filter loaded history" value={filter} onChange={event => setFilter(event.target.value)} className="mb-4 h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:text-sm" />
        {filteredEvents.length > 0 && <ol className="space-y-3">{filteredEvents.map(event => <li key={event.id} className="flex gap-3 text-sm"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary/60" /><div className="min-w-0 break-words"><p><span className="font-medium">{event.actorUsername || event.actorEmail}</span> {event.entityType === "task" && event.taskAvailable ? <a className="underline underline-offset-4" href={`/canvas?workspace=${encodeURIComponent(workspaceId)}&task=${encodeURIComponent(event.entityId)}&view=work`}>{describe(event)}</a> : describe(event)}</p><time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time></div></li>)}</ol>}
        {visibleEvents.length > 0 && filteredEvents.length === 0 && <p role="status" className="text-sm text-muted-foreground">No matching loaded activity.</p>}
        {loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading activity…</p>}
        {eventsWorkspaceId === workspaceId && error && <div role="alert" className="mt-3 flex items-center justify-between gap-3 text-sm text-destructive"><span>{error}</span><Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadActivity(nextCursor ?? undefined)}><RefreshCw className="size-4" />Retry</Button></div>}
        {eventsWorkspaceId === workspaceId && nextCursor && <Button className="mt-3" type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadActivity(nextCursor)}>Load older activity</Button>}
        {!loading && !error && visibleEvents.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
      </div>
    </section>
  )
}
