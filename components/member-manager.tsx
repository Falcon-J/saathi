"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Plus, Users, Loader2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { Member } from "@/app/actions/workspaces"
import { normalizeEmail } from "@/lib/identity"

interface MemberManagerProps {
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  onAddMember: (emailOrUsername: string) => Promise<any>
  onRemoveMember: (memberEmail: string) => Promise<any>
}

export function MemberManager({ members, currentUserEmail, workspaceOwnerId, onAddMember, onRemoveMember }: MemberManagerProps) {
  const [newMemberInput, setNewMemberInput] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [operatingMemberEmail, setOperatingMemberEmail] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // Check if current user is the workspace owner
  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail)
  const isOwner = normalizedCurrentUserEmail === normalizeEmail(workspaceOwnerId)

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
      await onAddMember(email)
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
      await onRemoveMember(memberEmail)
    } finally {
      setRemoveConfirm(null)
      setOperatingMemberEmail(null)
    }
  }

  // Helper functions for confirmation dialog
  const isOwnerLeavingAsOnlyMember = (memberEmail: string) => {
    const member = members.find(m => normalizeEmail(m.email) === normalizeEmail(memberEmail))
    return member &&
      normalizeEmail(member.email) === normalizedCurrentUserEmail &&
      member.role === "owner" &&
      members.length === 1
  }

  // Check if user can remove a specific member
  const canRemoveMember = (member: Member) => {
    // Owner can remove anyone except themselves (unless they're leaving)
    if (isOwner) {
      return normalizeEmail(member.email) !== normalizedCurrentUserEmail || members.length === 1
    }
    // Regular members can only remove themselves (leave workspace)
    return normalizeEmail(member.email) === normalizedCurrentUserEmail
  }

  const getConfirmationTitle = () => {
    if (!removeConfirm) return "Remove Member"
    return isOwnerLeavingAsOnlyMember(removeConfirm) ? "Delete Workspace" : "Remove Member"
  }

  const getConfirmationDescription = () => {
    if (!removeConfirm) return "Are you sure you want to remove this member from the workspace?"

    if (isOwnerLeavingAsOnlyMember(removeConfirm)) {
      return "You are the only member of this workspace. Leaving will permanently delete the workspace and all its tasks. This action cannot be undone."
    }

    const member = members.find(m => normalizeEmail(m.email) === normalizeEmail(removeConfirm))
    const isCurrentUser = member && normalizeEmail(member.email) === normalizedCurrentUserEmail

    if (isCurrentUser) {
      return "Are you sure you want to leave this workspace?"
    }

    return "Are you sure you want to remove this member from the workspace?"
  }

  const getConfirmationActionLabel = () => {
    if (!removeConfirm) return "Remove"

    if (isOwnerLeavingAsOnlyMember(removeConfirm)) {
      return "Delete Workspace"
    }

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
                  placeholder="Invite by email..."
                  value={newMemberInput}
                  onChange={(e) => setNewMemberInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddMember()}
                  disabled={isAdding}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground text-sm disabled:opacity-50"
                />
                <Button
                  onClick={handleAddMember}
                  disabled={isAdding || !newMemberInput.trim()}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                An in-app invitation will appear when they next sign in.
              </p>
              {lastError && (
                <p className="rounded-[var(--saathi-radius-control)] border border-[#ffb3ad] bg-[#fff2f0] px-3 py-2 text-xs text-[#a61b13]" role="alert">
                  {lastError}. Review the email address and try again.
                </p>
              )}
            </div>
          )}

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
                  {canRemoveMember(member) && (
                    <button
                      onClick={() => setRemoveConfirm(member.email)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title={normalizeEmail(member.email) === normalizedCurrentUserEmail ? "Leave workspace" : "Remove member"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
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
    </>
  )
}
