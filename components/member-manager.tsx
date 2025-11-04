"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { X, Plus, Users, Loader2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import type { Member } from "@/app/actions/workspaces"

interface MemberManagerProps {
  members: Member[]
  currentUserEmail: string
  workspaceOwnerId: string
  onAddMember: (emailOrUsername: string) => Promise<any>
  onRemoveMember: (memberId: string) => Promise<any>
}

export function MemberManager({ members, currentUserEmail, workspaceOwnerId, onAddMember, onRemoveMember }: MemberManagerProps) {
  const [newMemberInput, setNewMemberInput] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [operatingMemberId, setOperatingMemberId] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const { toast } = useToast()

  // Check if current user is the workspace owner
  const isOwner = currentUserEmail === workspaceOwnerId

  const handleAddMember = async () => {
    const email = newMemberInput.trim()

    if (!email) {
      toast({ title: "Error", description: "Email address cannot be empty", variant: "destructive" })
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address (e.g., user@example.com)",
        variant: "destructive"
      })
      return
    }

    setIsAdding(true)
    setLastError(null)

    try {
      await onAddMember(email)
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${email}. They will receive a notification to join the workspace.`
      })
      setNewMemberInput("")
      setLastError(null)
    } catch (error) {
      console.error("Failed to add member:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to add member"

      // Store error for retry functionality
      setLastError(errorMessage)

      // Show specific error messages to help user understand what went wrong
      toast({
        title: "Failed to send invitation",
        description: errorMessage,
        variant: "destructive"
      })

      // Keep the input so user can correct it
      // Don't clear newMemberInput on error
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    setOperatingMemberId(memberId)
    try {
      const result = await onRemoveMember(memberId)
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        const isOwnerLeavingAlone = isOwnerLeavingAsOnlyMember(memberId)
        toast({
          title: "Success",
          description: isOwnerLeavingAlone ? "Workspace deleted" : "Member removed"
        })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove member", variant: "destructive" })
    } finally {
      setRemoveConfirm(null)
      setOperatingMemberId(null)
    }
  }

  // Helper functions for confirmation dialog
  const isOwnerLeavingAsOnlyMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    return member &&
      member.email === currentUserEmail &&
      member.role === "owner" &&
      members.length === 1
  }

  // Check if user can remove a specific member
  const canRemoveMember = (member: Member) => {
    // Owner can remove anyone except themselves (unless they're leaving)
    if (isOwner) {
      return member.email !== currentUserEmail || members.length === 1
    }
    // Regular members can only remove themselves (leave workspace)
    return member.email === currentUserEmail
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

    const member = members.find(m => m.id === removeConfirm)
    const isCurrentUser = member && member.email === currentUserEmail

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

    const member = members.find(m => m.id === removeConfirm)
    const isCurrentUser = member && member.email === currentUserEmail

    return isCurrentUser ? "Leave Workspace" : "Remove Member"
  }

  return (
    <>
      <Card className="p-4 bg-card border-border">
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
                An invitation will be sent to the user's email
              </p>
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
                      {member.email === currentUserEmail && (
                        <span className="text-xs bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">You</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{member.email}</span>
                  </div>
                  {/* Only show remove button if user has permission */}
                  {canRemoveMember(member) && (
                    <button
                      onClick={() => setRemoveConfirm(member.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title={member.email === currentUserEmail ? "Leave workspace" : "Remove member"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Remove Confirmation */}
      <ConfirmDialog
        open={!!removeConfirm}
        title={getConfirmationTitle()}
        description={getConfirmationDescription()}
        actionLabel={getConfirmationActionLabel()}
        onConfirm={() => removeConfirm && handleRemoveMember(removeConfirm)}
        onCancel={() => setRemoveConfirm(null)}
        isLoading={operatingMemberId === removeConfirm}
      />
    </>
  )
}
