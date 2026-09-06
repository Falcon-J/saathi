import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-simple"
import { getInvitation } from "@/app/actions/invitations"
import { InvitationResponse } from "@/components/invitation-response"
import { SaathiLogo } from "@/components/saathi-logo"
import { normalizeEmail } from "@/lib/identity"

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/invitations/${id}`)}`)
  let invitation
  try { invitation = await getInvitation(id) } catch { invitation = null }
  return <main className="saathi-shell min-h-screen px-4 py-16"><section className="mx-auto max-w-lg rounded-xl border bg-card p-6"><SaathiLogo className="mb-6 size-12" />
    {!invitation ? <><h1 className="text-2xl font-semibold">Invitation unavailable</h1><p className="mt-3 text-sm text-muted-foreground">This invitation may no longer be available, or you may be signed in with a different account.</p><Link href="/login" className="mt-5 inline-block text-primary underline">Sign in with the invited account</Link></> : <><h1 className="text-2xl font-semibold">Join {invitation.workspaceName}</h1><p className="mt-3 text-sm text-muted-foreground">{invitation.inviterUsername} invited you to collaborate.</p><p className="mt-2 text-sm">Invitation status: {invitation.status}</p><p className="mt-2 text-xs text-muted-foreground">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>{normalizeEmail(session.email) === normalizeEmail(invitation.inviteeEmail) && invitation.status === "pending" && <InvitationResponse invitationId={invitation.id} />}</>}
    <Link href="/dashboard" className="mt-6 block text-sm text-primary underline">Go to dashboard</Link>
  </section></main>
}
