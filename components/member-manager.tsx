"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Plus, Users, Loader2, Crown } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { Member } from "@/app/actions/workspaces"
import { getWorkspaceInvitations, resendInvitation, revokeInvitation, type Invitation } from "@/app/actions/invitations"
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

export function MemberManager({ workspaceId, members, currentUserEmail, workspaceOwnerId, onAddMember, onRemoveMember, onTransferOwnership }: MemberManagerProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [invitationOperation, setInvitationOperation] = useState<string | null>(null)
  const [invitationLoadError, setInvitationLoadError] = useState<string | null>(null)
  const [newMemberInput, setNewMemberInput] = useState("")
  const [isAdding, setIsAdding] = useState(false)
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
    try {
      setInvitations(await getWorkspaceInvitations(workspaceId))
      setInvitationLoadError(null)
    } catch (caughtError) {
      setInvitationLoadError(caughtError instanceof Error ? caughtError.message : "Unable to load invitations.")
    }
  }, [isOwner, workspaceId])
  useEffect(() => { void loadInvitations() }, [loadInvitations])

  const changeInvitation = async (id: string, action: "resend" | "revoke") => {
    setInvitationOperation(id)
    setLastError(null)
    try {
      const result = await (action === "resend" ? resendInvitation(id) : revokeInvitation(id))
      if (result.error) throw new Error(result.error)
      await loadInvitations()
    } catch (caughtError) {
      setLastError(caughtError instanceof Error ? caughtError.message : "Unable to update invitation.")
    } finally { setInvitationOperation(null) }
  }


  const handleAddMember = async () => {
    const email = newMemberInput.trim()

    if (!email) {
      setLastError("Enter a team member's email address.")
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setLastError("Enter a valid email address, such as user@example.com.")
      return
    }

    setIsAdding(true)
    setLastError(null)

    try {
      const result = await onAddMember(email)
      const mutationError = getMutationError(result)
      if (mutationError) throw new Error(mutationError)
      await loadInvitations()
      setNewMemberInput("")
      setLastError(null)
    } catch (error) {
      console.error("Failed to add member:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to add member"

      // Store error for retry functionality
      setLastError(errorMessage)

    } finally {
      setIsAdding(false)
    }
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
    if (!removeConfirm) return "Are you sure you want to remove this member from the workspace?"

    const member = members.find(m => normalizeEmail(m.email) === normalizeEmail(removeConfirm))
    const isCurrentUser = member && normalizeEmail(member.email) === normalizedCurrentUserEmail

    if (isCurrentUser) {
      return "Are you sure you want to leave this workspace?"
    }

    return "Are you sure you want to remove this member from the workspace?"
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

          {/* Only show invite section to workspace owners */}
          {isOwner && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  aria-label="Invite by email"
                  type="email"
                  placeholder="Invite by email..."
                  value={newMemberInput}
                  onChange={(e) => setNewMemberInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddMember()}
                  disabled={isAdding}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground text-sm disabled:opacity-50"
                />
                <Button
                  aria-label="Send invitation"
                  onClick={handleAddMember}
                  disabled={isAdding || !newMemberInput.trim()}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The invitation appears in their account. Email status is shown below.
              </p>
            </div>
          )}

          {lastError && <p role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{lastError}</p>}
          {isOwner && <section className="space-y-2" aria-label="Workspace invitations"><h3 className="text-sm font-medium">Invitations</h3>{invitationLoadError ? <div role="alert"><p className="text-sm text-destructive">{invitationLoadError}</p><Button variant="outline" size="sm" onClick={() => void loadInvitations()}>Retry invitations</Button></div> : invitations.length === 0 ? <p className="text-xs text-muted-foreground">No invitations yet.</p> : invitations.map(invitation => <div key={invitation.id} className="rounded border p-3 space-y-2 text-sm"><p className="break-all font-medium">{invitation.inviteeEmail}</p><p className="text-xs text-muted-foreground">{invitation.status} · {invitation.deliveryStatus === "sent" ? "Email accepted by provider" : invitation.deliveryStatus === "failed" ? "Email failed" : invitation.deliveryStatus === "unconfigured" ? "Email unavailable; in-app invitation only" : "Email queued"}</p>{invitation.status === "pending" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(invitationOperation)} onClick={() => void changeInvitation(invitation.id, "resend")}>Resend</Button><Button size="sm" variant="ghost" disabled={Boolean(invitationOperation)} onClick={() => void changeInvitation(invitation.id, "revoke")}>Revoke</Button></div>}</div>)}</section>}
          {/* Members List */}
          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No members yet</p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-2 bg-secondary rounded text-sm">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-medium">{member.username}</span>
                      {member.role === "owner" && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Owner</span>
                      )}
                      {normalizeEmail(member.email) === normalizedCurrentUserEmail && (
                        <span className="rounded-[var(--saathi-radius-label)] bg-primary/10 px-1.5 py-0.5 text-xs text-primary">You</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{member.email}</span>
                  </div>
                  {/* Only show remove button if user has permission */}
                  <div className="flex items-center gap-2">
                    {isOwner && onTransferOwnership && member.role !== "owner" && <button type="button" onClick={() => setTransferConfirm(member)} className="text-muted-foreground hover:text-primary transition-colors" title={`Make ${member.username} the owner`}><Crown className="w-4 h-4" /></button>}
                    {canRemoveMember(member) && <button type="button" onClick={() => setRemoveConfirm(member.email)} className="text-muted-foreground hover:text-destructive transition-colors" title={normalizeEmail(member.email) === normalizedCurrentUserEmail ? "Leave workspace" : "Remove member"}><X className="w-4 h-4" /></button>}
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
