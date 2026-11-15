"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { CircleHelp, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { WorkspacePlan } from "@/lib/workspace-intent"
import { completeWorkspaceCreation, prepareWorkspaceCreation, readWorkspaceCreation, workspaceCreationInputSchema, workspaceCreationKey, type PendingWorkspaceCreation } from "@/lib/workspace-create-command"

type WorkspaceCreateFormProps = {
  actorId: string
  account: string
  embedded?: boolean
  aiEnabled: boolean
  canCancel: boolean
  onCancel: () => void
  onCreate: (name: string, details: { summary: string; targetDate: string | null }, commandId: string) => Promise<{ error?: string; rejected?: boolean } | void>
  onSuggest: (intent: string) => Promise<{ plan?: WorkspacePlan; error?: string }>
  onApprove: (plan: WorkspacePlan, commandId: string) => Promise<{ error?: string; rejected?: boolean } | void>
}

export function WorkspaceCreateForm({ actorId, account, embedded = false, aiEnabled, canCancel, onCancel, onCreate, onSuggest, onApprove }: WorkspaceCreateFormProps) {
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [draft, setDraft] = useState<WorkspacePlan | null>(null)
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingWorkspaceCreation | null>(null)
  const [ready, setReady] = useState(false)
  const submitting = useRef(false)
  const key = workspaceCreationKey(actorId, account)
  const activeKey = useRef(key)
  useLayoutEffect(() => { activeKey.current = key }, [key])
  useEffect(() => {
    const restored = readWorkspaceCreation(key, actorId)
    setPending(restored)
    setName(restored?.input.name ?? "")
    setGoal(restored?.input.summary ?? "")
    setTargetDate(restored?.input.targetDate ?? "")
    setDraft(restored?.input.kind === "plan" ? { title: restored.input.name, summary: restored.input.summary, targetDate: restored.input.targetDate, tasks: restored.input.tasks } : null)
    setError(restored ? "The previous result is unconfirmed. Retry the same creation to recover it." : null)
    setReady(true)
    submitting.current = false
  }, [key, actorId])
  const locked = Boolean(busy) || Boolean(pending) || !ready

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
    if (!ready || submitting.current) return
    if (!name.trim()) { setError("Enter a workspace name."); return }
    const parsed = workspaceCreationInputSchema.safeParse(pending?.input ?? (draft
      ? { kind: "plan", name: name.trim(), summary: goal.trim(), targetDate: targetDate || null, tasks: draft.tasks }
      : { kind: "manual", name: name.trim(), summary: goal.trim(), targetDate: targetDate || null }))
    if (!parsed.success) { setError("Review the workspace name, goal, dates and selected tasks."); return }
    submitting.current = true
    setBusy("saving")
    setError(null)
    try {
      const command = prepareWorkspaceCreation(key, actorId, parsed.data)
      setPending(command)
      const input = command.input
      const result = input.kind === "plan"
        ? await onApprove({ title: input.name, summary: input.summary, targetDate: input.targetDate, tasks: input.tasks }, command.commandId)
        : await onCreate(input.name, { summary: input.summary, targetDate: input.targetDate }, command.commandId)
      if (!result?.error || result.rejected) completeWorkspaceCreation(key, command.commandId)
      if (activeKey.current !== key) return
      if (!result?.error || result.rejected) setPending(null)
      if (result?.error) setError(result.error)
    } catch (caughtError) {
      if (activeKey.current === key) setError(caughtError instanceof Error ? caughtError.message : "Could not confirm creation. Retry the same creation.")
    } finally { if (activeKey.current === key) { setBusy(null); submitting.current = false } }
  }

  return (
    <section className={embedded ? "min-w-0" : "mx-auto max-w-5xl px-4 py-10"}>
      {!embedded && <div className="mb-8 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight">{pending ? "Recover workspace creation" : draft ? "Review your plan" : "Create workspace"}</h2>
      </div>}
      <div className="grid gap-5">
        <form onSubmit={submit} className="space-y-5 rounded-[var(--saathi-radius-container)] border border-border bg-card p-5 text-left shadow-sm sm:p-6">
          <div className="space-y-2"><label htmlFor="workspace-name" className="text-sm font-medium">Workspace name</label><Input id="workspace-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={locked} placeholder="Customer onboarding" /></div>
          <div className="space-y-2"><label htmlFor="workspace-goal" className="text-sm font-medium">Goal {draft ? "" : "(optional)"}</label><Textarea id="workspace-goal" required={Boolean(draft)} maxLength={240} value={goal} onChange={(event) => setGoal(event.target.value)} disabled={locked} placeholder="What do you want to achieve together?" /></div>
          <div className="space-y-2"><label htmlFor="workspace-target" className="text-sm font-medium">Target date (optional)</label><Input id="workspace-target" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} disabled={locked} /></div>
          {draft && <fieldset disabled={locked} className="space-y-3"><legend className="mb-2 text-sm font-medium">Suggested tasks ({draft.tasks.length})</legend>{draft.tasks.map((task, index) => <div key={index} className="rounded-lg border p-3 space-y-2"><Input aria-label={`Task ${index + 1} title`} required maxLength={200} value={task.title} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} /><div className="flex flex-wrap items-center gap-2"><label className="text-sm">When <select aria-label={`Task ${index + 1} bucket`} className="rounded border bg-background p-1" value={task.bucket} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, bucket: event.target.value as "today" | "next" } : item) })}><option value="today">Today</option><option value="next">Next</option></select></label><Input className="w-auto" aria-label={`Task ${index + 1} due date`} type="date" value={task.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, tasks: draft.tasks.map((item, i) => i === index ? { ...item, dueDate: event.target.value || null } : item) })} /><Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, i) => i !== index) })}>Remove</Button></div></div>)}</fieldset>}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{busy === "suggesting" ? "Preparing suggestions..." : "Creating workspace..."}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {canCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={Boolean(busy)}>Cancel</Button>}
            {draft ? <Button type="button" variant="outline" disabled={locked} onClick={() => setDraft(null)}>Discard suggestions</Button> : aiEnabled && <Button type="button" variant="outline" disabled={locked || !goal.trim()} onClick={() => void suggest()}>Help me plan</Button>}
            <Button type="submit" disabled={Boolean(busy) || !ready || !name.trim()}>{pending ? "Retry same creation" : draft ? `Create workspace with ${draft.tasks.length} tasks` : "Create workspace"}</Button>
          </div>
          {aiEnabled && !draft && <p className="text-xs text-muted-foreground">Optional: Help me plan sends your goal and target date to our AI provider to suggest tasks.</p>}
        </form>
      </div>
        <Button asChild variant="ghost" size="sm" className="mt-6 text-muted-foreground"><Link href="/guide"><CircleHelp className="size-4" />See how Saathi works</Link></Button>
     </section>
  )
}
