"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { requestInvitationVerification, confirmInvitationVerification } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function InvitationEmailVerification({ onVerified }: { onVerified?: () => void | Promise<void> }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const busy = useRef(false)
  useEffect(() => { active.current = true; setReady(true); return () => { active.current = false } }, [])

  const run = async (confirm: boolean) => {
    if (!ready || busy.current || !active.current) return
    busy.current = true; setPending(true); setError(null)
    try {
      const result = confirm ? await confirmInvitationVerification(code.trim()) : await requestInvitationVerification()
      if (!active.current) return
      if (result.error || !result.success) { setError(result.error || "Unable to verify email. Please try again."); return }
      if (!confirm) setSent(true)
      else if (onVerified) await onVerified()
      else router.refresh()
    } catch {
      if (active.current) setError("Unable to verify email. Please try again.")
    } finally {
      busy.current = false
      if (active.current) setPending(false)
    }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim()) void run(true) }

  return <section aria-label="Verify email for invitations" className="space-y-3 rounded-lg border border-border p-4 text-left">
    <h2 className="font-semibold">Verify your email to view invitations</h2>
    <p className="text-sm text-muted-foreground">This is optional for your own workspace. We’ll send a code to your account email before showing invitations from others.</p>
    <Button type="button" variant="outline" disabled={!ready || pending} onClick={() => void run(false)}>{sent ? "Send a new code" : "Send verification code"}</Button>
    {sent && <p role="status" className="text-sm">Check your email for the verification code.</p>}
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <label className="space-y-1 text-sm">Verification code<Input value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" required disabled={!ready || pending} /></label>
      <Button type="submit" disabled={!ready || pending || !code.trim()}>{pending ? "Please wait…" : "Verify email"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
