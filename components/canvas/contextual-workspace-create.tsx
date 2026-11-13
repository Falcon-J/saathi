"use client"

import { useEffect, useRef, useState } from "react"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { Button } from "@/components/ui/button"
import { runCanvasAccessCommand, type CanvasAccessCommand } from "@/features/access/actions"

export type WorkspaceCreationTarget = { id: string; version: number; path: string }
type CreationCommand = Extract<CanvasAccessCommand, { operation: "workspace.create" }>
type PendingCreation = { command: CreationCommand; path: string }

export function ContextualWorkspaceCreate({ actorId, target, onCancel, onCreated }: {
  actorId: string; target: WorkspaceCreationTarget
  onCancel: () => void; onCreated: (workspaceId: string) => Promise<void>
}) {
  const key = `saathi:canvas-workspace-create:${encodeURIComponent(actorId)}`
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<PendingCreation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retained = useRef<PendingCreation | null>(null)
  const writing = useRef(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw) as PendingCreation
        if (saved.command?.operation !== "workspace.create" || typeof saved.command.input?.commandId !== "string" || typeof saved.path !== "string") throw new Error("Invalid recovery record")
        retained.current = saved; setPending(saved)
      }
      setReady(true)
    } catch { setError("Workspace recovery is unavailable. Enable browser session storage before creating a workspace.") }
  }, [key])
  const run = async (creation: PendingCreation) => {
    if (!ready || writing.current) return
    const recovering = Boolean(retained.current)
    try { sessionStorage.setItem(key, JSON.stringify(creation)) }
    catch { setError("Browser session storage is unavailable. The workspace was not created."); return }
    writing.current = true; retained.current = creation; setPending(creation); setBusy(true); setError(null)
    try {
      const result = await runCanvasAccessCommand(creation.command)
      if (!result.success) {
        if (!result.unknownOutcome && (!recovering || result.code === "conflict")) {
          retained.current = null; setPending(null); sessionStorage.removeItem(key)
        }
        setError(result.error)
        return
      }
      try { await onCreated(creation.command.input.workspaceId) }
      catch { setError("Workspace created. Retry the original request to reopen it safely."); return }
      retained.current = null; setPending(null)
      try { sessionStorage.removeItem(key) } catch { /* Exact receipt replay remains safe. */ }
    } catch { setError("Unable to confirm workspace creation. Retry the original request to recover its result.") }
    finally { writing.current = false; setBusy(false) }
  }
  return <div className="space-y-4">
    <p className="break-words text-sm"><span className="font-medium">Location: </span>{pending?.path ?? target.path}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {pending ? <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="break-words font-medium">{pending.command.input.name}</p>
      <p className="text-sm">Creation needs confirmation. Retrying uses the original request and cannot create a duplicate.</p>
      <Button disabled={busy} onClick={() => run(pending)}>{busy ? "Creating workspace…" : "Retry workspace creation"}</Button>
    </div> : null}
    {ready ? <div hidden={Boolean(pending)}><WorkspaceCreateForm compact aiEnabled={false} canCancel onCancel={onCancel}
      onCreate={async (name, details) => run({ path: target.path, command: { operation: "workspace.create", input: {
        commandId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), resourceId: crypto.randomUUID(),
        parentId: target.id, expectedParentVersion: target.version, name, summary: details.summary,
        targetAt: details.targetDate,
      } } })}
      onSuggest={async () => ({ error: "Planning assistance is unavailable here." })}
      onApprove={async () => ({ error: "Use manual workspace creation." })} /></div> : !error && <p role="status">Loading workspace recovery…</p>}
  </div>
}
