"use client"

import { useState } from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type WorkspaceCommandBarProps = {
  onCommand: (command: string) => Promise<{ error?: string; action?: string }>
}

export function WorkspaceCommandBar({ onCommand }: WorkspaceCommandBarProps) {
  const [command, setCommand] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = command.trim()
    if (!trimmed) return
    setSubmitting(true)
    setMessage(null)
    try {
      const result = await onCommand(trimmed)
      if (result.error) setMessage({ kind: "error", text: result.error })
      else {
        setCommand("")
        setMessage({ kind: "success", text: "Workspace updated." })
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "I can't make that change yet." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-border pt-5">
      <div className="flex items-center gap-2 rounded-[var(--saathi-radius-control)] border border-border bg-card p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="What do you want to change?"
          maxLength={500}
          disabled={submitting}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" disabled={submitting || !command.trim()} aria-label="Apply workspace change">
          {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${message.kind === "error" ? "text-destructive" : "text-[var(--saathi-success)]"}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}
