"use client"

import { useState } from "react"
import { updateWorkspace, type Workspace } from "@/app/actions/workspaces"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function WorkspaceSettings({ workspace, onSaved }: { workspace: Workspace; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(workspace.name)
  const [summary, setSummary] = useState(workspace.summary ?? "")
  const [targetDate, setTargetDate] = useState(workspace.targetDate?.slice(0, 10) ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), summary: summary.trim(), targetAt: targetDate ? `${targetDate}T00:00:00.000Z` : null, timezone: workspace.timezone }, workspace.version)
      await onSaved()
      setSaved(true)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save workspace settings.")
    } finally { setSaving(false) }
  }

  return <section className="max-w-4xl rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 shadow-[var(--saathi-shadow-card)] sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="saathi-label text-primary">General</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Workspace settings</h2><p className="mt-2 text-sm text-muted-foreground">Only the owner can change these details.</p></div><div className="grid size-14 place-items-center rounded-xl bg-accent text-2xl font-bold text-primary">{workspace.name.slice(0, 1).toUpperCase()}</div></div><form onSubmit={submit} className="mt-8 max-w-2xl space-y-5">
    <div className="space-y-2"><label htmlFor="settings-name" className="text-sm font-medium">Workspace name</label><Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={saving} /></div>
    <div className="space-y-2"><label htmlFor="settings-summary" className="text-sm font-medium">Goal</label><Textarea id="settings-summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={240} disabled={saving} /></div>
    <div className="space-y-2"><label htmlFor="settings-date" className="text-sm font-medium">Target date</label><Input id="settings-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={saving} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm text-muted-foreground">Workspace settings saved.</p>}
    <Button disabled={saving || !name.trim()} type="submit">{saving ? "Saving..." : "Save changes"}</Button>
  </form></section>
}
