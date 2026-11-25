"use client"

import { useEffect, useState } from "react"
import { updateWorkspaceSettings, type Workspace } from "@/app/actions/workspaces"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { readDraft, writeDraft, removeDraft, isDraftRecord } from "@/lib/draft-storage"
import { calendarDateAt } from "@/lib/task-time"

type SettingsBaseline = Pick<Workspace, "id" | "version" | "name" | "summary" | "targetAt" | "timezone">

export function WorkspaceSettings({ workspace, onSaved, onArchived, onDeleted, onDirtyChange, draftScope }: { workspace: Workspace; onSaved: () => Promise<void>; onArchived?: () => Promise<void>; onDeleted?: () => Promise<void>; onDirtyChange?: (dirty: boolean) => void; draftScope?: string }) {
  const [baseline, setBaseline] = useState<SettingsBaseline>(workspace)
  const [reviewing, setReviewing] = useState(false)
  const [name, setName] = useState(workspace.name)
  const [summary, setSummary] = useState(workspace.summary ?? "")
  const [targetDate, setTargetDate] = useState(calendarDateAt(workspace.targetAt ?? undefined, "UTC"))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const draftKey = draftScope ? `${draftScope}:settings` : undefined
  const [restoredScope, setRestoredScope] = useState<string | null>(null)
  useEffect(() => {
    if (!draftKey || restoredScope === draftKey) return
    const retained = readDraft(draftKey, (value): value is { baseline: SettingsBaseline; name: string; summary: string; targetDate: string } => {
      if (!isDraftRecord(value) || !isDraftRecord(value.baseline)) return false
      const base = value.baseline
      return base.id === workspace.id && Number.isSafeInteger(base.version) && Number(base.version) > 0
        && typeof base.name === "string" && typeof base.timezone === "string"
        && (base.summary == null || typeof base.summary === "string") && (base.targetAt == null || typeof base.targetAt === "string")
        && [value.name, value.summary, value.targetDate].every(field => typeof field === "string")
    })
    setBaseline(retained?.baseline ?? workspace)
    setName(retained?.name ?? workspace.name)
    setSummary(retained?.summary ?? workspace.summary ?? "")
    setTargetDate(retained?.targetDate ?? calendarDateAt(workspace.targetAt ?? undefined, "UTC"))
    setRestoredScope(draftKey)
  }, [draftKey, restoredScope, workspace])
  const dirty = name !== baseline.name || summary !== (baseline.summary ?? "") || targetDate !== calendarDateAt(baseline.targetAt ?? undefined, "UTC")
  useEffect(() => {
    if (!draftKey || restoredScope !== draftKey) return
    if (dirty) writeDraft(draftKey, { baseline: { id: baseline.id, version: baseline.version, name: baseline.name, summary: baseline.summary, targetAt: baseline.targetAt, timezone: baseline.timezone }, name, summary, targetDate })
    else removeDraft(draftKey)
  }, [draftKey, restoredScope, dirty, baseline, name, summary, targetDate])
  const adopt = (latest: Workspace) => {
    removeDraft(draftKey)
    setBaseline(latest)
    setName(latest.name)
    setSummary(latest.summary ?? "")
    setTargetDate(calendarDateAt(latest.targetAt ?? undefined, "UTC"))
    setReviewing(false)
  }
  useEffect(() => { onDirtyChange?.(dirty || saving) }, [dirty, saving, onDirtyChange])
  useEffect(() => {
    if (!dirty && !saving && workspace.version > baseline.version) {
      setBaseline(workspace)
      setName(workspace.name)
      setSummary(workspace.summary ?? "")
      setTargetDate(calendarDateAt(workspace.targetAt ?? undefined, "UTC"))
    }
  }, [workspace, baseline.version, dirty, saving])
  const reviewLatest = async () => {
    try { await onSaved(); setReviewing(true) }
    catch { setError("Unable to reload settings. Your draft is retained.") }
  }
  const keepChanges = () => {
    if (name === baseline.name) setName(workspace.name)
    if (summary === (baseline.summary ?? "")) setSummary(workspace.summary ?? "")
    if (targetDate === calendarDateAt(baseline.targetAt ?? undefined, "UTC")) setTargetDate(calendarDateAt(workspace.targetAt ?? undefined, "UTC"))
    setBaseline(workspace)
    setReviewing(false)
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const result = await updateWorkspaceSettings(workspace.id, { name: name.trim(), summary: summary.trim(), targetAt: targetDate ? `${targetDate}T00:00:00.000Z` : null, timezone: baseline.timezone }, baseline.version)
      if ("error" in result) { setError(result.error); return }
      adopt(result.workspace)
      setSaved(true)
      try { await onSaved() } catch { setError("Settings saved. Refresh to see the latest workspace.") }
    } catch {
      setError("Unable to save workspace settings. Please try again.")
    } finally { setSaving(false) }
  }

  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null)

  const handleArchive = async () => {
    if (!onArchived) return
    setConfirming(null)
    setArchiving(true)
    setError(null)
    try {
      await onArchived()
      removeDraft(draftKey)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to archive workspace.")
    } finally { setArchiving(false) }
  }

  const handleDelete = async () => {
    if (!onDeleted) return
    setConfirming(null)
    setDeleting(true)
    setError(null)
    try {
      await onDeleted()
      removeDraft(draftKey)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete workspace.")
    } finally { setDeleting(false) }
  }

  return <section className="max-w-3xl"><h2 className="text-xl font-semibold">Workspace settings</h2><form onSubmit={submit} className="mt-5 max-w-2xl space-y-5">
    <div className="space-y-2"><label htmlFor="settings-name" className="text-sm font-medium">Workspace name</label><Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={saving} /></div>
    <div className="space-y-2"><label htmlFor="settings-summary" className="text-sm font-medium">Goal</label><Textarea id="settings-summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={240} disabled={saving} /></div>
    <div className="space-y-2"><label htmlFor="settings-date" className="text-sm font-medium">Target date</label><Input id="settings-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={saving} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {(error || workspace.version > baseline.version) && <Button type="button" variant="outline" disabled={saving} onClick={() => void reviewLatest()}>Review latest settings</Button>}
    {reviewing && <section aria-label="Latest workspace settings" className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">Latest saved settings</h3>
      <dl className="space-y-1 text-sm"><dt>Name</dt><dd className="break-words">{workspace.name}</dd><dt>Goal</dt><dd className="break-words">{workspace.summary || "None"}</dd><dt>Target date</dt><dd>{calendarDateAt(workspace.targetAt ?? undefined, "UTC") || "None"}</dd></dl>
      <p className="text-sm">Your draft is retained. Keep your edited fields against these settings, or discard your draft.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={keepChanges}>Keep my changes</Button><Button type="button" variant="outline" onClick={() => { adopt(workspace); setError(null) }}>Use latest settings</Button></div>
    </section>}
    {saved && <p role="status" className="text-sm text-muted-foreground">Workspace settings saved.</p>}
    <Button disabled={saving || archiving || deleting || !name.trim()} type="submit">{saving ? "Saving..." : "Save changes"}</Button>
  </form>{(onArchived || onDeleted) && <div className="mt-10 space-y-6 border-t border-border pt-6">{onArchived && <div><p className="text-sm font-semibold">Archive workspace</p><p className="mt-1 text-sm text-muted-foreground">Remove it from active work while retaining its history.</p>{confirming === "archive" ? <div role="group" aria-label="Confirm archive" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted p-3"><p className="w-full text-sm">Archive this workspace? It leaves your active list and keeps its history.</p><Button type="button" disabled={archiving} onClick={() => void handleArchive()}>Archive</Button><Button type="button" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button></div> : <Button type="button" variant="outline" className="mt-3" disabled={saving || archiving || deleting} onClick={() => setConfirming("archive")}>{archiving ? "Archiving..." : "Archive workspace"}</Button>}</div>}{onDeleted && <div><p className="text-sm font-semibold text-destructive">Delete workspace</p><p className="mt-1 text-sm text-muted-foreground">Permanently remove this workspace, its tasks, comments, and memberships.</p>{confirming === "delete" ? <div role="group" aria-label="Confirm delete" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-[var(--saathi-danger-soft)] p-3"><p className="w-full text-sm">Delete this workspace for good? Its tasks, comments and members are removed, and this cannot be undone.</p><Button type="button" variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>Delete for good</Button><Button type="button" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button></div> : <Button type="button" variant="destructive" className="mt-3" disabled={saving || archiving || deleting} onClick={() => setConfirming("delete")}>{deleting ? "Deleting..." : "Delete workspace"}</Button>}</div>}</div>}</section>
}
