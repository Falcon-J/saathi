"use client"

import { useEffect, useRef, useState } from "react"
import { createWorkspaceInvitationLink } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"
import { getAuthCallbackUrl } from "@/lib/supabase/config"
import { Input } from "@/components/ui/input"

export function InvitationLinkCreator({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => void | Promise<void> }) {
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [link, setLink] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const active = useRef(false)
  const busy = useRef(false)
  useEffect(() => { active.current = true; setReady(true); return () => { active.current = false } }, [])
  const create = async () => {
    if (!ready || busy.current || !active.current) return
    busy.current = true; setPending(true); setError(null)
    try {
      const result = await createWorkspaceInvitationLink(workspaceId)
      if (!active.current) return
      if (result.error || !result.token) { setError(result.error || "Unable to create a link. Please try again."); return }
      setLink(`${new URL(getAuthCallbackUrl()).origin}/join#token=${result.token}`); setCopied(false)
      try { await onCreated() } catch { if (active.current) setError("Link created. Refresh the invitation list to see it.") }
    } catch { if (active.current) setError("Unable to create a link. Please try again.") }
    finally { busy.current = false; if (active.current) setPending(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); if (active.current) setCopied(true) }
    catch { if (active.current) setError("Copy failed. Select and copy the link below.") }
  }
  return <section aria-label="Create invitation link" className="space-y-3">
    <p className="text-sm">Anyone with this link can join as a member. Each link works once and expires in 7 days.</p>
    <Button disabled={!ready || pending} onClick={create}>{pending ? "Creating…" : "Create invite link"}</Button>
    {link && <div className="space-y-2"><label className="block text-sm">Invite link<Input readOnly value={link} onFocus={event => event.target.select()} /></label><Button variant="outline" onClick={copy}>Copy invite link</Button>{copied && <p role="status" className="text-sm">Copied</p>}<p className="text-xs text-muted-foreground">Copy now. After leaving this view, revoke the link and create a replacement if you need another copy.</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
