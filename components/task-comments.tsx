"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { addTaskComment, getTaskComments } from "@/app/actions/comments"
import type { TaskComment } from "@/lib/data/comments"
import type { RealtimeEvent } from "@/lib/realtime"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function TaskComments({ taskId, refreshEvent }: { taskId: string; refreshEvent?: RealtimeEvent | null }) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadComments = useCallback(async () => {
    setLoading(true)
    const result = await getTaskComments(taskId)
    if (result.comments) {
      setComments(result.comments)
      setError(null)
    } else {
      setError(result.error ?? "Unable to load comments. Please try again.")
    }
    setLoading(false)
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
    if (!body.trim()) return

    setSaving(true)
    setError(null)
    try {
      const result = await addTaskComment(taskId, body)
      if (result.error || !result.comment) {
        setError(result.error ?? "Unable to add comment. Please try again.")
        return
      }
      setComments((current) => [...current, result.comment!])
      setBody("")
    } finally {
      setSaving(false)
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
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorEmail}</span>
                <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet. Add context for the next person.</p>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-2">
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
          <Button type="submit" size="sm" disabled={saving || !body.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add comment
          </Button>
        </div>
      </form>
    </section>
  )
}
