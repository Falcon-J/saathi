"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { addPrerequisite, getTaskGraph, removePrerequisite, type TaskGraphResult } from "@/app/actions/task-dependencies"
import type { Workspace } from "@/app/actions/workspaces"
import type { Task } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { normalizeEmail } from "@/lib/identity"
import { deriveNextWork, type NextWorkItem, type NextWorkResult } from "@/lib/next-work"
import { formatTaskDue } from "@/lib/task-time"

type Graph = Extract<TaskGraphResult, { success: true }>
type PendingChange = { operation: "add" | "remove"; input: Parameters<typeof addPrerequisite>[0] }

function readPending(value: string | null, workspaceId: string): PendingChange | null {
  if (!value) return null
  let parsed
  try { parsed = JSON.parse(value) } catch { return null }
  const input = parsed?.input
  if ((parsed?.operation !== "add" && parsed?.operation !== "remove") || !input || input.workspaceId !== workspaceId
    || ![input.workspaceId, input.dependentTaskId, input.prerequisiteTaskId, input.commandId].every(value => typeof value === "string" && value.length > 0)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) return null
  return { operation: parsed.operation, input: { workspaceId: input.workspaceId, dependentTaskId: input.dependentTaskId,
    prerequisiteTaskId: input.prerequisiteTaskId, expectedVersion: input.expectedVersion, commandId: input.commandId } }
}

function clearStoredPending(key: string, change: PendingChange) {
  try {
    const stored = readPending(window.sessionStorage.getItem(key), change.input.workspaceId)
    if (stored?.input.commandId === change.input.commandId) window.sessionStorage.removeItem(key)
  } catch { /* A retained command can safely recover through its receipt. */ }
}
type Props = {
  workspace: Workspace
  currentUserEmail: string
  refreshSignal: number
  taskRevision?: string
  onOpenTask: (taskId: string) => void
  onChanged?: () => Promise<unknown>
  connected?: boolean
}

export function NextWorkView({ workspace, currentUserEmail, refreshSignal, taskRevision, onOpenTask, onChanged, connected = true }: Props) {
  const [storedData, setData] = useState<{ scope: string; graph: Graph; projection: NextWorkResult<Task> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [prerequisiteId, setPrerequisiteId] = useState("")
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [saving, setSaving] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const requestSequence = useRef(0)
  const pendingChange = useRef<PendingChange | null>(null)
  const writing = useRef(false)
  const editor = useRef<HTMLElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const storageKey = `saathi:prerequisite:${encodeURIComponent(normalizeEmail(currentUserEmail))}:${workspace.id}`
  const activeScope = useRef(storageKey)
  const data = storedData?.scope === storageKey ? storedData : null

  const restorePending = useCallback(() => {
    activeScope.current = storageKey
    requestSequence.current++
    setData(null)
    pendingChange.current = null
    setPending(null)
    setSelectedId("")
    setPrerequisiteId("")
    writing.current = false
    setSaving(false)
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      const change = readPending(raw, workspace.id)
      if (raw && !change) window.sessionStorage.removeItem(storageKey)
      pendingChange.current = change
      setPending(change)
      setSelectedId(change?.input.dependentTaskId ?? "")
      setPrerequisiteId(change?.input.prerequisiteTaskId ?? "")
      setRecoveryReady(true)
    } catch {
      setRecoveryReady(false)
    }
  }, [storageKey, workspace.id])

  useEffect(() => { restorePending() }, [restorePending])

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const graph = await getTaskGraph(workspace.id)
      if (sequence !== requestSequence.current) return false
      if (!graph.success) {
        setData(null)
        setError(graph.error)
        return false
      }
      const projection = deriveNextWork(graph.tasks, graph.dependencies, graph.timezone, new Date(graph.asOf))
      setData({ scope: storageKey, graph, projection })
      return true
    } catch {
      if (sequence === requestSequence.current) {
        setData(null)
        setError("Next work is unavailable. Refresh to try again.")
      }
      return false
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [workspace.id, storageKey])

  useEffect(() => {
    const sequenceRef = requestSequence
    void load()
    return () => { sequenceRef.current++ }
  }, [load, refreshSignal, taskRevision])

  useEffect(() => { if (selectedId) editor.current?.focus() }, [selectedId])

  const canEdit = (task: Task) => Boolean(task.version) && (
    normalizeEmail(currentUserEmail) === normalizeEmail(workspace.ownerId)
    || normalizeEmail(currentUserEmail) === normalizeEmail(task.createdBy)
  )

  const save = async (change: PendingChange) => {
    if (writing.current || !recoveryReady || activeScope.current !== storageKey) return
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(change)) } catch {
      setError("Browser session storage is unavailable. Enable storage before changing prerequisites so an interrupted save can be recovered.")
      return
    }
    const recovering = pendingChange.current !== null
    writing.current = true
    pendingChange.current = change
    setPending(change)
    setSaving(true)
    setError(null)
    try {
      const result = await (change.operation === "add" ? addPrerequisite : removePrerequisite)(change.input)
      if (activeScope.current !== storageKey) return
      if (!result.success) {
        const accessDenied = result.code === "forbidden" || result.code === "unauthenticated"
        const definitiveConflict = result.code === "conflict" && !result.unknownOutcome
        if (!result.unknownOutcome && (!recovering || definitiveConflict)) {
          pendingChange.current = null
          setPending(null)
          clearStoredPending(storageKey, change)
          if (result.code === "conflict") await load()
        }
        if (accessDenied) {
          requestSequence.current++
          setLoading(false)
          setData(null)
        }
        setError(recovering && !definitiveConflict ? `${result.error} The original change is still unresolved and has been kept for recovery. If the task or access changed, ask the workspace owner to review it.` : result.error)
        return
      }
      pendingChange.current = null
      setPending(null)
      clearStoredPending(storageKey, change)
      setPrerequisiteId("")
      const refreshed = await load()
      let tasksRefreshed = true
      try { tasksRefreshed = await onChanged?.() !== false } catch { tasksRefreshed = false }
      if (!refreshed || !tasksRefreshed) setError("Prerequisite change saved. Refresh the workspace to see the current state.")
    } catch {
      if (activeScope.current === storageKey) setError("We could not confirm the prerequisite change. Retry the same change to safely recover its result.")
    } finally {
      if (activeScope.current === storageKey) {
        writing.current = false
        setSaving(false)
      }
    }
  }

  const changePrerequisite = (operation: PendingChange["operation"], sourceId: string) => {
    const selected = data?.graph.tasks.find(task => task.id === selectedId)
    if (!recoveryReady || pendingChange.current || writing.current || loading || !selected || !canEdit(selected) || !sourceId) return
    void save({ operation, input: { workspaceId: workspace.id, dependentTaskId: selected.id, prerequisiteTaskId: sourceId,
      expectedVersion: selected.version!, commandId: crypto.randomUUID() } })
  }

  const select = (id: string) => {
    if (pendingChange.current || writing.current) return
    setSelectedId(id)
    setPrerequisiteId("")
  }

  const selected = data?.graph.tasks.find(task => task.id === selectedId)
  const selectedSources = data?.graph.dependencies.filter(edge => edge.dependentTaskId === selectedId) ?? []
  const matches = (item: NextWorkItem<Task>) => `${item.task.title} ${item.task.assigneeEmail ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  const section = (title: string, items: NextWorkItem<Task>[]) => (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      {items.filter(matches).map(item => (
        <article key={item.task.id} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{item.task.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.unassigned ? "Unassigned" : item.task.assigneeEmail}{formatTaskDue(item.task.dueAt, item.task.dueDate, workspace.timezone) ? ` · ${formatTaskDue(item.task.dueAt, item.task.dueDate, workspace.timezone)}` : ""}</p>
            </div>
            <Button type="button" variant="outline" size="sm" aria-label={`Open ${item.task.title}`} disabled={Boolean(pending)} onClick={() => { if (!pendingChange.current) onOpenTask(item.task.id) }}>Open task</Button>
          </div>
          {item.prerequisites.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No recorded prerequisites</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {item.prerequisites.map(source => <li key={source.taskId}><Button type="button" variant="link" disabled={Boolean(pending)} className="h-auto whitespace-normal p-0 text-left text-xs" onClick={() => { if (!pendingChange.current) onOpenTask(source.taskId) }}>{source.title}</Button> — {source.status === "done" ? "Complete" : "Not complete"}</li>)}
            </ul>
          )}
          {item.readiness === "completed_inconsistent" && <p className="mt-2 text-xs text-destructive">Completed with unfinished prerequisites</p>}
          {canEdit(item.task) && <Button type="button" variant="ghost" size="sm" className="mt-2" aria-label={`Edit prerequisites for ${item.task.title}`} disabled={loading || Boolean(pending)} onClick={event => { returnFocus.current = event?.currentTarget ?? null; select(item.task.id) }}>Edit prerequisites</Button>}
        </article>
      ))}
      {items.length > 0 && !items.some(matches) && <p className="text-sm text-muted-foreground">No matching tasks.</p>}
    </section>
  )

  return (
    <section aria-labelledby="next-work-title" aria-busy={loading || saving} className="mb-4 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2"><h2 id="next-work-title" className="text-xl font-semibold">Next work</h2><Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}>Refresh next work</Button></header>
      {loading && <p role="status" className="text-sm text-muted-foreground">{data ? "Refreshing next work; previous results may be out of date…" : "Loading next work…"}</p>}
      {!connected && <p role="status" className="text-sm text-muted-foreground">Live updates are paused. Refresh next work to check the latest state.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!recoveryReady && <div role="alert" className="space-y-2 text-sm text-destructive"><p>Session recovery storage is unavailable. Prerequisite changes are paused.</p><Button type="button" variant="outline" onClick={() => { restorePending(); void load() }}>Retry recovery</Button></div>}
      {pending && !saving && <div className="space-y-2"><p className="text-sm">A prerequisite change needs confirmation. Retry the same change to recover its result.</p><Button type="button" onClick={() => save(pendingChange.current!)}>Retry change</Button></div>}
      {data && <>
        <Input aria-label="Search next work" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks or assignees" />
        <div className="grid gap-4 md:grid-cols-2">{section("Ready", data.projection.ready)}{section("Waiting", data.projection.waiting)}</div>
        {data.projection.ready.length === 0 && data.projection.waiting.length === 0 && <p className="text-sm text-muted-foreground">No unfinished tasks.</p>}
        {data.projection.completedInconsistencies.length > 0 && section("Review completed work", data.projection.completedInconsistencies)}
        <label className="block text-sm font-medium">Inspect prerequisites
          <select aria-label="Task to inspect" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={selectedId} disabled={Boolean(pending) || loading} onChange={event => { returnFocus.current = event.currentTarget; select(event.target.value) }}><option value="">Choose a task</option>{data.graph.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
        </label>
        {selected && <section ref={editor} tabIndex={-1} aria-label={`Prerequisites for ${selected.title}`} className="space-y-3 rounded-lg border border-border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <div className="flex items-start justify-between gap-2"><h3 className="break-words text-sm font-semibold">{selected.title} depends on</h3><Button type="button" variant="ghost" size="sm" disabled={Boolean(pending)} onClick={() => { select(""); returnFocus.current?.focus() }}>Close prerequisites</Button></div>
          {selectedSources.length === 0 && <p className="text-sm text-muted-foreground">No recorded prerequisites</p>}
          {selectedSources.map(edge => {
            const source = data.graph.tasks.find(task => task.id === edge.prerequisiteTaskId)!
            return <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><Button type="button" variant="link" disabled={Boolean(pending)} className="h-auto whitespace-normal p-0 text-left" onClick={() => { if (!pendingChange.current) onOpenTask(source.id) }}>{source.title}</Button>{canEdit(selected) && <Button type="button" variant="outline" size="sm" aria-label={`Remove ${source.title} prerequisite`} disabled={!recoveryReady || loading || Boolean(pending)} onClick={() => changePrerequisite("remove", source.id)}>Remove</Button>}</div>
          })}
          {canEdit(selected) ? <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); changePrerequisite("add", prerequisiteId) }}>
            <select aria-label={`Prerequisite for ${selected.title}`} className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3" value={prerequisiteId} disabled={loading || Boolean(pending)} onChange={event => setPrerequisiteId(event.target.value)}><option value="">Choose a prerequisite</option>{data.graph.tasks.filter(task => task.id !== selected.id && !selectedSources.some(edge => edge.prerequisiteTaskId === task.id)).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
            <Button type="submit" disabled={!recoveryReady || !prerequisiteId || loading || Boolean(pending)}>Add prerequisite</Button>
          </form> : <p className="text-sm text-muted-foreground">Only the task creator or workspace owner can edit prerequisites.</p>}
        </section>}
      </>}
    </section>
  )
}
