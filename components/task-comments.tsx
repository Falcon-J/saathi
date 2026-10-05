"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { addTaskComment, getTaskComments } from "@/app/actions/comments"
import type { TaskComment } from "@/lib/data/comments"
import type { RealtimeEvent } from "@/lib/realtime"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function TaskComments({ taskId, refreshEvent, readOnly = false }: { taskId: string; refreshEvent?: RealtimeEvent | null; readOnly?: boolean }) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readVersion = useRef(0)
  const scope = useRef({ taskId, active: true })
  const submitting = useRef(false)
  const pendingCommand = useRef<{ body: string; taskId: string; id: string } | null>(null)

  useEffect(() => {
    scope.current = { taskId, active: true }
    submitting.current = false
    setComments([])
    setNextCursor(null)
    setBody("")
    setSaving(false)
    setNeedsRefresh(false)
    setError(null)
    return () => {
      scope.current.active = false
      readVersion.current += 1
    }
  }, [taskId])

  const loadComments = useCallback(async (cursor?: string) => {
    const version = ++readVersion.current
    const current = scope.current
    const isCurrent = () => current.active && scope.current === current && version === readVersion.current
    setLoading(true)
    try {
      const result = await getTaskComments(taskId, cursor)
      if (!isCurrent()) return
      if (result.comments) {
        setComments(previous => cursor
          ? [...result.comments!, ...previous.filter(comment => !result.comments!.some(older => older.id === comment.id))]
          : result.comments!)
        setNextCursor(result.nextCursor ?? null)
        setError(null)
        setNeedsRefresh(false)
      } else {
        setError(result.error ?? "Unable to load comments. Please try again.")
      }
    } catch {
      if (isCurrent()) setError("Unable to load comments. Please try again.")
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    if (refreshEvent?.type !== "task-comment-created" || refreshEvent.data.taskId !== taskId) return
    void loadComments()
  }, [loadComments, refreshEvent, taskId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || !body.trim() || submitting.current || needsRefresh) return
    const current = scope.current
    const isCurrent = () => current.active && scope.current === current

    if (pendingCommand.current?.body !== body || pendingCommand.current.taskId !== taskId) pendingCommand.current = { body, taskId, id: crypto.randomUUID() }
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await addTaskComment(taskId, body, pendingCommand.current.id)
      if (!isCurrent()) return
      if (result.error || !result.comment) {
        if (result.unknownOutcome) setNeedsRefresh(true)
        setError(result.error ?? "Unable to add comment. Please try again.")
        return
      }
      // A realtime read may already contain this committed comment. Older reads
      // must also not overwrite it after the action has returned.
      readVersion.current += 1
      setLoading(false)
      setComments((comments) => comments.some(comment => comment.id === result.comment!.id)
        ? comments : [...comments, result.comment!])
      pendingCommand.current = null
      setBody("")
      // Reconcile history and concurrent comments after invalidating older reads.
      void loadComments()
    } catch {
      if (isCurrent()) {
        setNeedsRefresh(true)
        setError("Unable to confirm the comment was saved. Refresh comments before trying again.")
      }
    } finally {
      if (isCurrent()) {
        submitting.current = false
        setSaving(false)
      }
    }
  }

  return (
    <section aria-label="Task comments" className="space-y-4 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Comments</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading comments...
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-lg border border-border bg-secondary/35 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="min-w-0 break-all font-medium text-foreground">{comment.authorEmail}</span>
                <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6">{comment.body}</p>
            </article>
          ))}
        </div>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">No comments yet. Add context for the next person.</p>
      ) : null}

      {nextCursor && <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void loadComments(nextCursor)}>Load older comments</Button>}

      {error && <div className="space-y-2">
        <p className="text-sm text-destructive" role="alert">{error}</p>
        <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void loadComments()}>Refresh comments</Button>
      </div>}

      {!readOnly && <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a useful update or question..."
          maxLength={2000}
          rows={3}
          disabled={saving}
          aria-label="New task comment"
          className="resize-y bg-card"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saving || needsRefresh || !body.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add comment
          </Button>
        </div>
      </form>}
    </section>
  )
}
