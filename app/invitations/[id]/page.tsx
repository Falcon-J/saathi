import Link from "next/link"
import { getSession } from "@/lib/auth-simple"
import { getInvitation, getInvitationPreview, getInvitationVerificationStatus } from "@/app/actions/invitations"
import { InvitationResponse } from "@/components/invitation-response"
import { AuthFrame } from "@/components/auth-shell"
import { normalizeEmail } from "@/lib/identity"

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  const invitationPath = `/invitations/${id}`
  const redirectTo = encodeURIComponent(invitationPath)
  let invitation
  if (session) {
    try { invitation = await getInvitation(id) } catch { invitation = null }
  }
  if (session && !invitation) {
    const status = await getInvitationVerificationStatus().catch(() => ({ verified: false, error: "Unable to check email verification. Please try again." }))
    if (!status.verified) return <AuthFrame wide backHref="/canvas" backLabel="Go to canvas"><div className="space-y-4">
      {status.error && <p role="alert" className="text-sm text-destructive">{status.error}</p>}
      <h1 className="text-4xl leading-none">Ask for a new invitation link</h1><p>This older invitation requires email verification. Ask the workspace owner to create a new shareable link instead.</p>
      <Link href="/canvas" className="block text-sm text-primary underline">Go to canvas</Link>
    </div></AuthFrame>
  }
  let preview
  try { preview = await getInvitationPreview(id) } catch { preview = null }
  if (!preview && !invitation) return <AuthFrame wide backHref="/canvas" backLabel="Go to canvas"><div><p className="saathi-label text-muted-foreground">Workspace invitation</p><h1 className="mt-2 text-4xl leading-none">Invitation unavailable</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This invitation may no longer be available.</p><Link href="/login" className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Sign in</Link></div></AuthFrame>
  if (!session && preview) return <AuthFrame wide backHref="/canvas" backLabel="Go to canvas"><div><p className="saathi-label text-muted-foreground">You&apos;re invited</p><h1 className="mt-2 text-4xl leading-none">Join {preview.workspaceName}</h1><p className="mt-3 text-sm text-muted-foreground">{preview.inviterUsername} invited you to collaborate on Saathi.</p><p className="mt-4 text-sm leading-6 text-muted-foreground">Use the invited email address to sign in or create an account.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link href={`/register?redirect=${redirectTo}`} className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Create an account</Link><Link href={`/login?redirect=${redirectTo}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium">Sign in</Link></div></div></AuthFrame>
  return <AuthFrame wide backHref="/canvas" backLabel="Go to canvas"><div>
    {!invitation ? <><p className="saathi-label text-muted-foreground">Workspace invitation</p><h1 className="mt-2 text-4xl leading-none">Use the invited account</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This invitation is for a different account. Sign in with the invited email address.</p><Link href={`/login?redirect=${redirectTo}`} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Sign in</Link></> : <><p className="saathi-label text-muted-foreground">You&apos;re invited</p><h1 className="mt-2 text-4xl leading-none">Join {invitation.workspaceName}</h1><p className="mt-3 text-sm text-muted-foreground">{invitation.inviterUsername} invited you to collaborate on Saathi.</p><div className="mt-6 rounded-xl border border-border bg-secondary/35 p-4 text-left"><p className="font-semibold">{invitation.workspaceName}</p><p className="mt-1 text-sm text-muted-foreground">Invitation status: {invitation.status}</p><p className="mt-1 text-xs text-muted-foreground">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>{session && normalizeEmail(session.email) === normalizeEmail(invitation.inviteeEmail) && invitation.status === "pending" && <div className="mt-5"><InvitationResponse invitationId={invitation.id} /></div>}</>}
    <Link href="/canvas" className="mt-6 block text-sm text-primary underline">Go to canvas</Link>
  </div></AuthFrame>
}
