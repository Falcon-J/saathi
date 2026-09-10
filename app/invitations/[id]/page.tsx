import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-simple"
import { getInvitation } from "@/app/actions/invitations"
import { InvitationResponse } from "@/components/invitation-response"
import { SaathiLogo } from "@/components/saathi-logo"
import { normalizeEmail } from "@/lib/identity"
import Image from "next/image"

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect(`/login?redirect=${encodeURIComponent(`/invitations/${id}`)}`)
  let invitation
  try { invitation = await getInvitation(id) } catch { invitation = null }
  return <main className="saathi-shell min-h-screen px-4 py-12 sm:py-20"><section className="mx-auto max-w-xl rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 text-center shadow-[var(--saathi-shadow-card)] sm:p-10"><SaathiLogo className="mx-auto size-12" /><Image src="/saathi-auth-illustration.png" alt="Workspace invitation" width={220} height={180} className="mx-auto mt-6 h-40 w-48 object-contain" />
    {!invitation ? <><p className="saathi-label mt-4 text-primary">Workspace invitation</p><h1 className="mt-2 text-2xl font-semibold">Invitation unavailable</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This invitation may no longer be available, or you may be signed in with a different account.</p><Link href="/login" className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Sign in with the invited account</Link></> : <><p className="saathi-label mt-4 text-primary">You&apos;re invited</p><h1 className="mt-2 text-3xl font-semibold">Join {invitation.workspaceName}</h1><p className="mt-3 text-sm text-muted-foreground">{invitation.inviterUsername} invited you to collaborate on Saathi.</p><div className="mt-6 rounded-xl border border-border bg-secondary/35 p-4 text-left"><p className="font-semibold">{invitation.workspaceName}</p><p className="mt-1 text-sm text-muted-foreground">Invitation status: {invitation.status}</p><p className="mt-1 text-xs text-muted-foreground">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>{normalizeEmail(session.email) === normalizeEmail(invitation.inviteeEmail) && invitation.status === "pending" && <div className="mt-5"><InvitationResponse invitationId={invitation.id} /></div>}</>}
    <Link href="/dashboard" className="mt-6 block text-sm text-primary underline">Go to dashboard</Link>
  </section></main>
}
