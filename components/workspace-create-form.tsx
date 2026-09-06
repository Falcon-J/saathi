"use client"

import { useState } from "react"
import Link from "next/link"
import { CircleHelp, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SaathiLogo } from "@/components/saathi-logo"
import type { WorkspacePlan } from "@/lib/workspace-intent"

type WorkspaceCreateFormProps = {
  aiEnabled: boolean
  canCancel: boolean
  onCancel: () => void
  onCreate: (name: string, details: { summary: string; targetDate: string | null }) => Promise<{ error?: string } | void>
  onSuggest: (intent: string) => Promise<{ plan?: WorkspacePlan; error?: string }>
  onApprove: (plan: WorkspacePlan) => Promise<{ error?: string } | void>
}

export function WorkspaceCreateForm({ aiEnabled, canCancel, onCancel, onCreate, onSuggest, onApprove }: WorkspaceCreateFormProps) {
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [draft, setDraft] = useState<WorkspacePlan | null>(null)
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const suggest = async () => {
    setBusy("suggesting")
    setError(null)
    try {
      const result = await onSuggest(`${goal.trim()}${targetDate ? `\nTarget date: ${targetDate}` : ""}`)
      if (result.error || !result.plan) setError(result.error ?? "Unable to suggest a plan. You can still create your workspace manually.")
      else {
        setDraft(result.plan)
        setName(name.trim() || result.plan.title)
        setGoal(result.plan.summary)
        setTargetDate(targetDate || result.plan.targetDate || "")
      }
    } catch {
      setError("Unable to suggest a plan. Your input is saved here; you can create your workspace manually.")
    } finally { setBusy(null) }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError("Enter a workspace name."); return }
    setBusy("saving")
    setError(null)
    try {
      const result = draft
        ? await onApprove({ ...draft, title: name.trim(), summary: goal.trim(), targetDate: targetDate || null })
        : await onCreate(name.trim(), { summary: goal.trim(), targetDate: targetDate || null })
      if (result?.error) setError(result.error)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create the workspace. Please try again.")
    } finally { setBusy(null) }
  }

  return (
    <section className="mx-auto flex max-w-2xl items-center justify-center px-4 py-10">
      <div className="w-full text-center">
        <SaathiLogo className="mx-auto mb-6 size-12" />
        <p className="saathi-label text-primary">Start with intention</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">{draft ? "Review your plan" : "Start something new"}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{draft ? "Edit or remove suggested tasks. Nothing is saved until you create the workspace." : "Name your workspace, set a goal, and start organizing your work."}</p>
        <form onSubmit={submit} className="mt-8 space-y-5 rounded-[var(--saathi-radius-container)] border border-border bg-card p-5 text-left shadow-sm">
          <div className="space-y-2"><label htmlFor="workspace-name" className="text-sm font-medium">Workspace name</label><Input id="workspace-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(busy)} placeholder="Portfolio launch" /></div>
          <div className="space-y-2"><label htmlFor="workspace-goal" className="text-sm font-medium">Goal {draft ? "" : "(optional)"}</label><Textarea id="workspace-goal" required={Boolean(draft)} maxLength={240} value={goal} onChange={(event) => setGoal(event.target.value)} disabled={Boolean(busy)} placeholder="What do you want to achieve together?" /></div>
          <div className="space-y-2"><label htmlFor="workspace-target" className="text-sm font-medium">Target date (optional)</label><Input id="workspace-target" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={Boolean(busy)} /></div>
          {draft && <fieldset disabled={Boolean(busy)} className="space-y-3"><legend className="mb-2 text-sm font-medium">Suggested tasks ({draft.tasks.length})</legend>{draft.tasks.map((task, index) => <div key={index} className="rounded-lg border p-3 space-y-2"><Input aria-label={`Task ${index + 1} title`} required maxLength={200} value={task.title} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} /><div className="flex flex-wrap items-center gap-2"><label className="text-sm">When <select aria-label={`Task ${index + 1} bucket`} className="rounded border bg-background p-1" value={task.bucket} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, bucket: event.target.value as "today" | "next" } : item) })}><option value="today">Today</option><option value="next">Next</option></select></label><Input className="w-auto" aria-label={`Task ${index + 1} due date`} type="date" value={task.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, dueDate: event.target.value || null } : item) })} /><Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, i) => i !== index) })}>Remove</Button></div></div>)}</fieldset>}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{busy === "suggesting" ? "Preparing suggestions..." : "Creating workspace..."}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {canCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={Boolean(busy)}>Cancel</Button>}
            {draft ? <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setDraft(null)}>Discard suggestions</Button> : aiEnabled && <Button type="button" variant="outline" disabled={Boolean(busy) || !goal.trim()} onClick={() => void suggest()}>Help me plan</Button>}
            <Button type="submit" disabled={Boolean(busy) || !name.trim()}>{draft ? `Create workspace with ${draft.tasks.length} tasks` : "Create workspace"}</Button>
          </div>
          {aiEnabled && !draft && <p className="text-xs text-muted-foreground">Optional: Help me plan sends your goal and target date to our AI provider to suggest tasks.</p>}
        </form>
        <Button asChild variant="ghost" size="sm" className="mt-6 text-muted-foreground"><Link href="/guide"><CircleHelp className="size-4" />See how Saathi works</Link></Button>
      </div>
    </section>
  )
}
