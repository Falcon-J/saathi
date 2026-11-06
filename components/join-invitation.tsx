"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { acceptInvitationLink, getInvitationLinkPreview, type InvitationPreview } from "@/app/actions/invitations"
import { getAuthCallbackUrl } from "@/lib/supabase/config"
import { Button } from "@/components/ui/button"

const storageKey = "saathi:join-token"
function forgetToken() { try { sessionStorage.removeItem(storageKey) } catch { /* Optional browser storage. */ } }

export function JoinInvitation({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canReturn, setCanReturn] = useState(false)
  const active = useRef(false)
  const busy = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    active.current = true
    const load = () => {
      const version = ++generation.current
      const current = () => active.current && generation.current === version
      setToken(""); setPreview(null); setLoading(true); setPending(false); setError(null); setCanReturn(false); busy.current = false
      const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token")
      try {
        const canonical = new URL(getAuthCallbackUrl()).origin
        if (window.location.origin !== canonical) {
          const target = new URL("/join", canonical)
          if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment)) target.hash = new URLSearchParams({ token: fragment }).toString()
          window.location.replace(target.toString())
          return
        }
      } catch { setError("Application address is unavailable. Please try again later."); setLoading(false); return }
      let value = fragment ?? ""
      if (fragment === null) { try { value = sessionStorage.getItem(storageKey) ?? "" } catch { /* Require reopening the original link. */ } }
      window.history.replaceState(window.history.state, "", "/join")
      if (!/^[A-Za-z0-9_-]{43}$/.test(value)) { forgetToken(); setLoading(false); return }
      setToken(value)
      try { sessionStorage.setItem(storageKey, value); setCanReturn(true) } catch { setCanReturn(false) }
      void getInvitationLinkPreview(value).then(result => {
        if (!current()) return
        setPreview(result)
        if (!result) forgetToken()
      }).catch(() => { if (current()) setError("Unable to load this invitation. Reopen the link to try again.") })
        .finally(() => { if (current()) setLoading(false) })
    }
    load()
    window.addEventListener("hashchange", load)
    return () => { active.current = false; window.removeEventListener("hashchange", load) }
  }, [])
  const accept = async () => {
    if (busy.current || !active.current || !signedIn || !preview || !token) return
    const version = generation.current
    const current = () => active.current && generation.current === version
    busy.current = true; setPending(true); setError(null)
    try {
      const result = await acceptInvitationLink(token)
      if (!current()) return
      if (result.error || !result.success) { setError(result.error || "Unable to join. Please try again."); return }
      forgetToken()
      router.replace(result.workspaceId ? `/dashboard?workspace=${encodeURIComponent(result.workspaceId)}` : "/dashboard")
      router.refresh()
    } catch { if (current()) setError("Unable to join. Please try again.") }
    finally { if (current()) { busy.current = false; setPending(false) } }
  }
  return <section className="mx-auto max-w-xl space-y-5 rounded-lg border border-border bg-card p-6">
    {loading ? <p role="status">Loading invitation…</p> : preview ? <>
      <h1 className="break-words text-2xl font-semibold">Join {preview.workspaceName}</h1>
      <p className="text-sm">{preview.inviterUsername} invited you to collaborate.</p>
      <p className="text-sm text-muted-foreground">This link lets one person join. Expires {new Date(preview.expiresAt).toLocaleDateString()}.</p>
      {signedIn ? <Button disabled={pending} onClick={accept}>{pending ? "Joining…" : "Join workspace"}</Button> : <>
        {!canReturn && <p role="status">After signing in, reopen the original invitation link to join.</p>}
        <div className="flex flex-wrap gap-4"><Link className="text-primary underline" href="/register?redirect=%2Fjoin">Create an account</Link><Link className="text-primary underline" href="/login?redirect=%2Fjoin">Sign in</Link></div>
      </>}
    </> : <><h1 className="text-2xl font-semibold">Invitation unavailable</h1><p>Ask the workspace owner for a new link.</p></>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Link href="/dashboard" onClick={forgetToken} className="block text-sm text-primary underline">Go to dashboard</Link>
  </section>
}
