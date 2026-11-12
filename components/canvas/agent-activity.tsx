'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getAgentActivity, reviewAgentRun, type AgentActivityRun } from '@/app/actions/coordination'
import type { HumanReviewInput } from '@/features/coordination/contracts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const stateLabels: Record<AgentActivityRun['state'], string> = { queued: 'Queued', running: 'Running', awaiting_review: 'Awaiting review', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' }

export function AgentActivity({ workspaceId, refreshSignal = 0, canReview = true, actorId = '', onFollowTask, followingTaskId, onFollowingEnded }: { workspaceId: string; refreshSignal?: number; canReview?: boolean; actorId?: string; onFollowTask?: (taskId: string) => void; followingTaskId?: string | null; onFollowingEnded?: () => void }) {
  const scope = `${actorId}:${workspaceId}`
  const [data, setData] = useState<{ scope: string; runs: AgentActivityRun[]; nextCursor: string | null }>({ scope: '', runs: [], nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [unknown, setUnknown] = useState<{ scope: string; input: HumanReviewInput } | null>(null)
  const generation = useRef(0)
  const currentScope = useRef(scope)
  const writing = useRef(false)
  const invalidateReads = useCallback(() => { generation.current++ }, [])
  useLayoutEffect(() => { currentScope.current = scope }, [scope])

  const load = useCallback(async (cursor?: string) => {
    const request = ++generation.current
    setLoading(true)
    setReadError(null)
    try {
      const result = await getAgentActivity(workspaceId, cursor)
      if (request !== generation.current || currentScope.current !== scope) return
      if (!result.runs || result.error) {
        setData({ scope, runs: [], nextCursor: null })
        setReadError(result.error || 'Unable to load agent activity. Refresh to try again.')
        return
      }
      setData(previous => {
        const runs = cursor && previous.scope === scope ? [...previous.runs, ...result.runs!] : result.runs!
        return { scope, runs: [...new Map(runs.map(run => [run.id, run])).values()], nextCursor: result.nextCursor ?? null }
      })
    } catch {
      if (request !== generation.current || currentScope.current !== scope) return
      setData({ scope, runs: [], nextCursor: null })
      setReadError('Unable to load agent activity. Refresh to try again.')
    } finally { if (request === generation.current && currentScope.current === scope) setLoading(false) }
  }, [workspaceId, scope])

  useEffect(() => {
    setUnknown(null); setComments({}); setReviewError(null); setNotice(null); setSaving(false); writing.current = false
  }, [scope])
  useEffect(() => {
    void load()
    return invalidateReads
  }, [load, refreshSignal, invalidateReads])
  useEffect(() => {
    // A bounded partial page cannot prove that the followed run disappeared.
    if (!loading && !readError && data.scope === scope && data.nextCursor === null && followingTaskId
      && !data.runs.some(run => run.taskId === followingTaskId && ['queued', 'running', 'awaiting_review'].includes(run.state))) onFollowingEnded?.()
  }, [data, scope, loading, readError, followingTaskId, onFollowingEnded])

  const submit = async (input: HumanReviewInput) => {
    if (writing.current) return
    writing.current = true
    setSaving(true); setReviewError(null); setNotice(null)
    try {
      const result = await reviewAgentRun(input)
      if (currentScope.current !== scope) return
      if (result.success && result.run) {
        setUnknown(null)
        setData(previous => ({ ...previous, runs: previous.runs.map(run => run.id === result.run!.id ? { ...run, ...result.run!, task: { ...run.task, canReview: false } } : run) }))
        setNotice(input.decision === 'approve' ? 'Review approved. Task completed.' : 'Run rejected. The task was not completed by this review.')
        void load()
      } else {
        setReviewError(result.error || 'Unable to confirm this review. Refresh before retrying.')
        setUnknown(result.unknownOutcome ? { scope, input } : null)
        if (!result.unknownOutcome) void load()
      }
    } catch {
      if (currentScope.current !== scope) return
      setUnknown({ scope, input })
      setReviewError('Could not confirm the review was saved. Refresh or retry the same review.')
    } finally {
      if (currentScope.current === scope) { writing.current = false; setSaving(false) }
    }
  }
  const review = (run: AgentActivityRun, decision: 'approve' | 'reject') => {
    const comment = comments[run.id]?.trim()
    return submit({ commandId: crypto.randomUUID(), workspaceId, runId: run.id, decision, expectedTaskVersion: run.task.version, ...(comment ? { comment } : {}) })
  }
  const visible = data.scope === scope ? data.runs : []
  const unresolved = unknown?.scope === scope ? unknown.input : null
  const busy = loading || saving || data.scope !== scope
  return <section aria-label="Agent activity" className="space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Agent runs</h2><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { void load() }}>Refresh</Button></div>
    {readError && <p role="alert" className="text-sm text-destructive">{readError}</p>}
    {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {unresolved && <div className="space-y-2 rounded-md border border-border p-3"><p className="text-sm">The last review outcome is uncertain. Keep this exact review until its result is confirmed.</p><Button type="button" disabled={saving} onClick={() => submit(unresolved)}>Retry same review</Button></div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading agent activity…</p>}
    {!loading && !readError && visible.length === 0 && <p className="text-sm text-muted-foreground">No agent runs.</p>}
    {visible.map(run => <article key={run.id} className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{run.task.title}</h3><p className="text-sm">{stateLabels[run.state]}</p></div>
      {onFollowTask && ['queued', 'running', 'awaiting_review'].includes(run.state) && <Button type="button" variant="outline" size="sm" disabled={followingTaskId === run.taskId} onClick={() => onFollowTask(run.taskId)}>{followingTaskId === run.taskId ? 'Following agent' : 'Follow agent'}</Button>}
      {run.progress && <p className="whitespace-pre-wrap text-sm">{run.progress}</p>}
      {run.evidence.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">Evidence</h4><ul className="space-y-2 text-sm">{run.evidence.map((evidence, index) => <li key={index}>{evidence.kind === 'text' ? <p className="whitespace-pre-wrap">{evidence.text}</p> : <a href={evidence.uri} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{evidence.label || evidence.uri}</a>}</li>)}</ul></div>}
      {run.reviewComment && <p className="whitespace-pre-wrap text-sm">Review: {run.reviewComment}</p>}
      {run.state === 'awaiting_review' && run.task.canReview && canReview && !unresolved && <fieldset disabled={busy} className="space-y-3 border-t border-border pt-3">
        <legend className="sr-only">Review {run.task.title}</legend>
        <Label htmlFor={`review-comment-${run.id}`}>Review comment</Label><Textarea id={`review-comment-${run.id}`} value={comments[run.id] ?? ''} maxLength={2000} onChange={event => setComments(previous => ({ ...previous, [run.id]: event.target.value }))} />
        <p className="text-sm">Approval completes the task using its current version. Rejection marks this run as failed and leaves the task unchanged.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => review(run, 'approve')}>Approve and complete task</Button><Button type="button" variant="outline" disabled={busy} onClick={() => review(run, 'reject')}>Reject run</Button></div>
      </fieldset>}
    </article>)}
    {data.scope === scope && data.nextCursor && <Button type="button" variant="outline" disabled={busy} onClick={() => { void load(data.nextCursor!) }}>Load more runs</Button>}
  </section>
}
