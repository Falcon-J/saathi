"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { InvitationLinkCreator } from "@/components/invitation-link-creator"
import { X, Users, Loader2, Crown } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { Member } from "@/app/actions/workspaces"
import { getWorkspaceInvitations, revokeInvitation, type Invitation } from "@/app/actions/invitations"
import { getMutationError } from "@/lib/mutation-result"
import { normalizeEmail } from "@/lib/identity"

interface MemberManagerProps {
  workspaceId: string
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  onAddMember: (emailOrUsername: string) => Promise<any>
  onRemoveMember: (memberEmail: string) => Promise<any>
  onTransferOwnership?: (memberUserId: string) => Promise<any>
}

export function MemberManager({ workspaceId, members, currentUserEmail, workspaceOwnerId, onRemoveMember, onTransferOwnership }: MemberManagerProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [invitationOperation, setInvitationOperation] = useState<string | null>(null)
  const [revokedInvitationIds, setRevokedInvitationIds] = useState<string[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(true)
  const [invitationLoadError, setInvitationLoadError] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [operatingMemberEmail, setOperatingMemberEmail] = useState<string | null>(null)
  const [transferConfirm, setTransferConfirm] = useState<Member | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // Check if current user is the workspace owner
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail)
  const isOwner = normalizedCurrentUserEmail === normalizeEmail(workspaceOwnerId)
  const loadInvitations = useCallback(async () => {
    if (!isOwner) return
    setInvitationsLoading(true)
    try {
      setInvitations(await getWorkspaceInvitations(workspaceId))
      setInvitationLoadError(null)
    } catch (caughtError) {
      setInvitationLoadError(caughtError instanceof Error ? caughtError.message : "Unable to load invitations.")
    } finally {
      setInvitationsLoading(false)
    }
  }, [isOwner, workspaceId])
  useEffect(() => { void loadInvitations() }, [loadInvitations])

  const revokePendingInvitation = async (id: string) => {
    setInvitationOperation(id)
    setLastError(null)
    try {
      const result = await revokeInvitation(id)
      if (result.error) throw new Error(result.error)
      setRevokedInvitationIds(ids => [...ids, id])
      await loadInvitations()
    } catch (caughtError) {
      setLastError(caughtError instanceof Error ? caughtError.message : "Unable to update invitation.")
    } finally { setInvitationOperation(null) }
  }


  const handleRemoveMember = async (memberEmail: string) => {
    setOperatingMemberEmail(memberEmail)
    try {
      const result = await onRemoveMember(memberEmail)
      const mutationError = getMutationError(result)
      if (mutationError) throw new Error(mutationError)
    } catch (caughtError) {
      setLastError(caughtError instanceof Error ? caughtError.message : "Unable to remove member.")
    } finally {
      setRemoveConfirm(null)
      setOperatingMemberEmail(null)
    }
  }

  const handleTransferOwnership = async () => {
    if (!transferConfirm || !onTransferOwnership) return
    setTransferring(true)
    setLastError(null)
    try {
      const result = await onTransferOwnership(transferConfirm.userId)
      const mutationError = getMutationError(result)
      if (mutationError) throw new Error(mutationError)
    } catch (caughtError) {
      setLastError(caughtError instanceof Error ? caughtError.message : "Unable to transfer ownership.")
    } finally {
      setTransferring(false)
      setTransferConfirm(null)
    }
  }

  // Check if user can remove a specific member
  const canRemoveMember = (member: Member) => {
    // Owner can remove anyone except themselves (unless they're leaving)
    if (isOwner) {
      return normalizeEmail(member.email) !== normalizedCurrentUserEmail
    }
    // Regular members can only remove themselves (leave workspace)
    return normalizeEmail(member.email) === normalizedCurrentUserEmail
  }

  const getConfirmationTitle = () => {
    if (!removeConfirm) return "Remove Member"
    return normalizeEmail(removeConfirm) === normalizedCurrentUserEmail ? "Leave Workspace" : "Remove Member"
  }

  const getConfirmationDescription = () => {
    if (!removeConfirm) return "Remove this member? They will lose access to workspace tasks and history; their existing contributions remain."

    const member = members.find(m => normalizeEmail(m.email) === normalizeEmail(removeConfirm))
    const isCurrentUser = member && normalizeEmail(member.email) === normalizedCurrentUserEmail

    if (isCurrentUser) {
      return "Leave this workspace? You will lose access to its tasks and history until an owner invites you again."
    }

    return "Remove this member? They will lose access to workspace tasks and history; their existing contributions remain."
  }

  const getConfirmationActionLabel = () => {
    if (!removeConfirm) return "Remove"

    const member = members.find(m => normalizeEmail(m.email) === normalizeEmail(removeConfirm))
    const isCurrentUser = member && normalizeEmail(member.email) === normalizedCurrentUserEmail

    return isCurrentUser ? "Leave Workspace" : "Remove Member"
  }

  return (
    <>
      <div className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Members ({members.length})</h3>
          </div>

          {isOwner && <InvitationLinkCreator key={workspaceId} workspaceId={workspaceId} onCreated={loadInvitations} revokedInvitationIds={revokedInvitationIds} />}

          {lastError && <p role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{lastError}</p>}
          {isOwner && <section className="space-y-2" aria-label="Workspace invitations"><h3 className="text-sm font-medium">Invitations</h3>{invitationsLoading ? <p role="status" className="text-xs text-muted-foreground">Loading invitations...</p> : invitationLoadError ? <div role="alert"><p className="text-sm text-destructive">{invitationLoadError}</p><Button variant="outline" size="sm" onClick={() => void loadInvitations()}>Retry invitations</Button></div> : invitations.length === 0 ? <p className="text-xs text-muted-foreground">No invitations yet.</p> : invitations.map(invitation => <div key={invitation.id} className="rounded border p-3 space-y-2 text-sm"><p className="break-all font-medium">{invitation.kind === "link" ? "Single-use invite link" : invitation.inviteeEmail}</p><p className="text-xs text-muted-foreground">{invitation.status} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>{invitation.status === "pending" && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={Boolean(invitationOperation)} onClick={() => void revokePendingInvitation(invitation.id)}>Revoke</Button></div>}</div>)}</section>}
          {/* Members List */}
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No members yet</p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 p-2 bg-secondary rounded text-sm">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-all text-foreground font-medium">{member.username}</span>
                      {member.role === "owner" && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Owner</span>
                      )}
                      {normalizeEmail(member.email) === normalizedCurrentUserEmail && (
                        <span className="rounded-[var(--saathi-radius-label)] bg-primary/10 px-1.5 py-0.5 text-xs text-primary">You</span>
                      )}
                    </div>
                    <span className="break-all text-xs text-muted-foreground">{member.email}</span>
                  </div>
                  {/* Only show remove button if user has permission */}
                  <div className="flex shrink-0 items-center">
                    {isOwner && onTransferOwnership && member.role !== "owner" && <button type="button" onClick={() => setTransferConfirm(member)} className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Make ${member.username} the owner`} title={`Make ${member.username} the owner`}><Crown className="w-4 h-4" /></button>}
                    {canRemoveMember(member) && <button type="button" onClick={() => setRemoveConfirm(member.email)} className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={normalizeEmail(member.email) === normalizedCurrentUserEmail ? "Leave workspace" : `Remove ${member.username} from workspace`} title={normalizeEmail(member.email) === normalizedCurrentUserEmail ? "Leave workspace" : "Remove member"}><X className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Remove Confirmation */}
      <ConfirmDialog
        open={!!removeConfirm}
        title={getConfirmationTitle()}
        description={getConfirmationDescription()}
        actionLabel={getConfirmationActionLabel()}
        onConfirm={() => removeConfirm && handleRemoveMember(removeConfirm)}
        onCancel={() => setRemoveConfirm(null)}
        isLoading={operatingMemberEmail === removeConfirm}
      />
      <ConfirmDialog
        open={Boolean(transferConfirm)}
        title="Transfer workspace ownership"
        description={transferConfirm ? `Make ${transferConfirm.username} the owner? You will remain a member without owner controls.` : "Transfer workspace ownership?"}
        actionLabel="Transfer ownership"
        onConfirm={() => void handleTransferOwnership()}
        onCancel={() => setTransferConfirm(null)}
        isLoading={transferring}
      />
    </>
  )
}
