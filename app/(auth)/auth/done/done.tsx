"use client"
import { useEffect } from "react"

export function Done({ error }: { error: string }) {
  useEffect(() => {
    const channel = new BroadcastChannel("saathi-auth")
    channel.postMessage({ error })
    channel.close()
    window.close()
    // Still open: this wasn't a popup, or its opener is gone. Carry on in this tab.
    const t = setTimeout(() => location.replace(error ? `/signup?error=${error}` : "/home"), 400)
    return () => clearTimeout(t)
  }, [error])
  return <p role="status" className="p-6 text-muted">{error ? "Sign-in didn't finish." : "Signed in. You can close this tab."}</p>
}
