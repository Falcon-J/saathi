"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { acceptInvitation, declineInvitation } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"

export function InvitationResponse({ invitationId }: { invitationId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const respond = async (accept: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const result = await (accept ? acceptInvitation(invitationId) : declineInvitation(invitationId))
      if (result.error) { setError(result.error); return }
      router.replace("/dashboard")
      router.refresh()
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to respond. Please try again.") }
    finally { setBusy(false) }
  }
  return <div className="mt-5 space-y-3">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex gap-2"><Button disabled={busy} onClick={() => void respond(true)}>{busy ? "Updating..." : "Accept invitation"}</Button><Button disabled={busy} variant="outline" onClick={() => void respond(false)}>Decline</Button></div></div>
}
