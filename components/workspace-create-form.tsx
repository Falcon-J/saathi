"use client"

import { useState } from "react"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SaathiLogo } from "@/components/saathi-logo"

type WorkspaceCreateFormProps = {
  aiEnabled: boolean
  canCancel: boolean
  onCancel: () => void
  onCreate: (value: string) => Promise<{ error?: string } | void>
}

export function WorkspaceCreateForm({ aiEnabled, canCancel, onCancel, onCreate }: WorkspaceCreateFormProps) {
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError(aiEnabled ? "Tell Saathi what you want to make happen." : "Enter a workspace name.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const result = await onCreate(trimmed)
      if (result?.error) setError(result.error)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create the workspace. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-2xl items-center justify-center px-4 py-12">
      <div className="w-full text-center">
        <SaathiLogo className="mx-auto mb-6 size-12" />
        <p className="saathi-label text-primary">Start with intention</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {aiEnabled ? "What do you want to make happen?" : "Start something new"}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          {aiEnabled
            ? "Describe the outcome. Saathi will create a focused workspace and the first useful steps."
            : "Give the workspace a clear name. You can add and organize the work immediately."}
        </p>

        <form onSubmit={submit} className="mt-8 rounded-[var(--saathi-radius-container)] border border-border bg-card p-4 text-left shadow-sm sm:p-5">
          {aiEnabled ? (
            <Textarea
              aria-label="What do you want to make happen?"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Tell me what you're working toward..."
              maxLength={2000}
              disabled={submitting}
              className="min-h-32 resize-none border-0 bg-transparent p-2 text-base shadow-none focus-visible:ring-0"
            />
          ) : (
            <Input
              aria-label="Workspace name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Workspace name"
              maxLength={100}
              disabled={submitting}
              className="h-12 border-0 bg-transparent px-2 text-base shadow-none focus-visible:ring-0"
            />
          )}

          {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {submitting && aiEnabled && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-lg bg-secondary/70 px-4 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="mt-0.5 size-4 animate-spin text-primary" />
              <div>
                <p className="font-medium text-foreground">Creating your workspace...</p>
                <p className="mt-1">Understanding your goal and planning the first steps.</p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {canCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>}
            <Button type="submit" disabled={submitting || !value.trim()}>
              {submitting ? "Creating..." : "Create workspace"}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </form>

        {aiEnabled && (
          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            <p>“Get ready for my backend interview in 3 weeks”</p>
            <p>“Ship our mobile app before October”</p>
            <p>“Plan a Goa trip with my friends”</p>
          </div>
        )}
      </div>
    </section>
  )
}
