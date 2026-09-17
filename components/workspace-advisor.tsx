"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, ListChecks, Sparkles } from "lucide-react"
import { askWorkspaceAdvisor } from "@/app/actions/workspace-advisor"
import type { AdvisorResponse, AdvisorTaskDraft } from "@/lib/ai/workspace-advisor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type TaskDraft = NonNullable<AdvisorResponse["draft"]>

type WorkspaceAdvisorProps = {
  workspaceId: string
  timeZone?: string
  onConfirmDraft: (draft: AdvisorTaskDraft, idempotencyKey: string) => Promise<unknown>
}

type Capability = AdvisorResponse["capability"]

const capabilities: Array<{ value: Capability; label: string; icon: typeof Sparkles }> = [
  { value: "summarize_workspace", label: "Summarize workspace", icon: ListChecks },
  { value: "identify_attention", label: "Find attention items", icon: AlertTriangle },
  { value: "draft_task", label: "Draft a task", icon: Sparkles },
]

function hasError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value && typeof value.error === "string")
}

export function WorkspaceAdvisor({ workspaceId, timeZone, onConfirmDraft }: WorkspaceAdvisorProps) {
  const [question, setQuestion] = useState("What should we focus on next?")
  const [response, setResponse] = useState<AdvisorResponse | null>(null)
  const [pending, setPending] = useState<Capability | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null)

  const ask = async (capability: Capability) => {
    setPending(capability)
    setError(null)
    setRetryAfterSeconds(null)
    try {
      const result = await askWorkspaceAdvisor(workspaceId, capability, question)
      if (result.error) {
        setError(result.error)
        setRetryAfterSeconds(result.code === "rate_limited" ? result.retryAfterSeconds ?? null : null)
        return
      }
      setResponse(result.response ?? null)
    } catch {
      setError("AI advice is temporarily unavailable. Please try again.")
    } finally {
      setPending(null)
    }
  }

  const createDraft = async (draft: TaskDraft) => {
    setCreating(true)
    setError(null)
    try {
      const result = await onConfirmDraft(draft, crypto.randomUUID())
      if (hasError(result)) {
        setError(result.error)
        return
      }
      setResponse(current => current ? { ...current, draft: null } : current)
    } catch {
      setError("The task could not be created. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card aria-busy={pending !== null || creating} className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
      <CardHeader className="gap-3 border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-4 text-primary" />Workspace advisor</CardTitle>
            <CardDescription className="mt-1">Get a grounded suggestion from the work already in this workspace.</CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 bg-card text-xs">Review first</Badge>
        </div>
        <Textarea value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} disabled={pending !== null || creating} aria-label="Advisor question" placeholder="Ask about this workspace" className="min-h-20 bg-card" />
        <div className="flex flex-wrap gap-2">
          {capabilities.map(({ value, label, icon: Icon }) => (
            <Button key={value} type="button" variant="outline" size="sm" onClick={() => void ask(value)} disabled={pending !== null || creating} className="bg-card">
              <Icon className="size-3.5" />{pending === value ? "Thinking…" : label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}{retryAfterSeconds ? ` Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.` : ""}</p>}
        {response && (
          <div className="space-y-4" aria-live="polite">
            <div className="flex gap-3 rounded-lg bg-secondary/50 p-3 text-sm leading-6">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{response.answer}</p>
            </div>
            {response.attention.length > 0 && (
              <div>
                <p className="text-sm font-semibold">Needs attention</p>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {response.attention.map(item => <li key={item.taskId} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--saathi-warning)]" />{item.reason}</li>)}
                </ul>
              </div>
            )}
            {response.draft && (
              <div className="rounded-lg border border-primary/30 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Review task draft</p>
                    <h3 className="mt-1 font-semibold">{response.draft.title}</h3>
                    {response.draft.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{response.draft.description}</p>}
                  </div>
                  <Badge variant="secondary">{response.draft.priority}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {response.draft.estimatedMinutes && <span>{response.draft.estimatedMinutes} minutes</span>}
                  {response.draft.dueDate && <span>Due {response.draft.dueDate}</span>}
                  {response.draft.dueAt && <span>Due {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(response.draft.dueAt))}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void createDraft(response.draft!)} disabled={creating}>{creating ? "Creating…" : "Create task"}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setResponse(current => current ? { ...current, draft: null } : current)} disabled={creating}>Dismiss</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
