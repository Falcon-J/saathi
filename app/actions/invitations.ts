"use server"

import redis from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { getWorkspace } from "./workspaces"

export interface Invitation {
  id: string
  workspaceId: string
  workspaceName: string
  inviterEmail: string
  inviterUsername: string
  inviteeEmail: string
  status: "pending" | "accepted" | "declined"
  createdAt: string
  expiresAt: string
}

// Send workspace invitation
export async function sendWorkspaceInvitation(workspaceId: string, inviteeEmail: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteeEmail)) {
      throw new Error("Please enter a valid email address")
    }

    // Normalize email
    inviteeEmail = inviteeEmail.toLowerCase().trim()

    // Prevent self-invitation
    if (inviteeEmail === session.email) {
      throw new Error("You cannot invite yourself to the workspace")
    }

    // Get workspace details
    const workspace = await getWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    // Check if user is owner
    if (workspace.ownerId !== session.email) {
      throw new Error("Only workspace owner can send invitations")
    }

    // Check if user is already a member
    if (workspace.members.some(m => m.email === inviteeEmail)) {
      throw new Error("User is already a member of this workspace")
    }

    // Check if invitation already exists
    const existingInvitations = await getUserInvitations(inviteeEmail)
    const existingInvitation = existingInvitations.find(
      inv => inv.workspaceId === workspaceId && inv.status === "pending"
    )

    if (existingInvitation) {
      throw new Error("Invitation already sent to this user")
    }

    // Create invitation
    const invitationId = `invitation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitation: Invitation = {
      id: invitationId,
      workspaceId,
      workspaceName: workspace.name,
      inviterEmail: session.email,
      inviterUsername: session.username,
      inviteeEmail,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }

    // Save invitation
    await redis.set(`invitation:${invitationId}`, JSON.stringify(invitation))

    // Add to user's invitations list
    await redis.sadd(`user:${inviteeEmail}:invitations`, invitationId)

    console.log(`[Saathi] Sent invitation ${invitationId} to ${inviteeEmail} for workspace ${workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error sending invitation:", error)
    throw error
  }
}

// Get user's pending invitations
export async function getUserInvitations(userEmail: string): Promise<Invitation[]> {
  try {
    const invitationIds = await redis.smembers(`user:${userEmail}:invitations`)
    const invitations: Invitation[] = []

    for (const invitationId of invitationIds) {
      const invitationData = await redis.get(`invitation:${invitationId}`)
      if (invitationData) {
        let invitation: Invitation
        if (typeof invitationData === "string") {
          invitation = JSON.parse(invitationData)
        } else {
          invitation = invitationData as Invitation
        }

        // Check if invitation is expired
        if (new Date(invitation.expiresAt) > new Date()) {
          invitations.push(invitation)
        } else {
          // Clean up expired invitation
          await redis.del(`invitation:${invitationId}`)
          // Remove from user's list (simplified for mock Redis)
          const userInvitations = await redis.smembers(`user:${userEmail}:invitations`)
          const updatedInvitations = userInvitations.filter((id: string) => id !== invitationId)
          await redis.del(`user:${userEmail}:invitations`)
          if (updatedInvitations.length > 0) {
            await redis.sadd(`user:${userEmail}:invitations`, ...updatedInvitations)
          }
        }
      }
    }

    return invitations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("[Saathi] Error fetching user invitations:", error)
    return []
  }
}

// Accept workspace invitation
export async function acceptInvitation(invitationId: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Get invitation
    const invitationData = await redis.get(`invitation:${invitationId}`)
    if (!invitationData) {
      throw new Error("Invitation not found")
    }

    let invitation: Invitation
    if (typeof invitationData === "string") {
      invitation = JSON.parse(invitationData)
    } else {
      invitation = invitationData as Invitation
    }

    // Verify invitation belongs to current user
    if (invitation.inviteeEmail !== session.email) {
      throw new Error("Invitation does not belong to current user")
    }

    // Check if invitation is still pending
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending")
    }

    // Check if invitation is expired
    if (new Date(invitation.expiresAt) <= new Date()) {
      throw new Error("Invitation has expired")
    }

    // Get workspace
    const workspace = await getWorkspace(invitation.workspaceId)
    if (!workspace) {
      throw new Error("Workspace no longer exists")
    }

    // Add user to workspace
    const newMember = {
      id: session.email,
      email: session.email,
      username: session.username,
      role: "member" as const,
      joinedAt: new Date().toISOString()
    }

    workspace.members.push(newMember)
    console.log(`[Saathi] Adding member ${session.email} to workspace ${invitation.workspaceId}`)
    console.log(`[Saathi] Workspace now has ${workspace.members.length} members`)
    await redis.set(`workspace:${invitation.workspaceId}`, JSON.stringify(workspace))
    console.log(`[Saathi] Workspace ${invitation.workspaceId} saved successfully`)

    // Add workspace to user's workspace list
    console.log(`[Saathi] Adding workspace ${invitation.workspaceId} to user ${session.email} workspace list`)
    await redis.sadd(`user:${session.email}:workspaces`, invitation.workspaceId)

    // Verify it was added
    const userWorkspaces = await redis.smembers(`user:${session.email}:workspaces`)
    console.log(`[Saathi] User ${session.email} now has workspaces:`, userWorkspaces)

    // Update invitation status
    invitation.status = "accepted"
    await redis.set(`invitation:${invitationId}`, JSON.stringify(invitation))

    // Remove invitation from user's pending list
    console.log(`[Saathi] Removing accepted invitation ${invitationId} from user ${session.email} invitation list`)
    const userInvitations = await redis.smembers(`user:${session.email}:invitations`)
    const updatedInvitations = userInvitations.filter((id: string) => id !== invitationId)
    await redis.del(`user:${session.email}:invitations`)
    if (updatedInvitations.length > 0) {
      await redis.sadd(`user:${session.email}:invitations`, ...updatedInvitations)
    }
    console.log(`[Saathi] User ${session.email} now has ${updatedInvitations.length} pending invitations`)

    // Track invitation acceptance activity
    try {
      console.log(`[Saathi] Tracking invitation acceptance activity for ${session.email}`)

      // Track activity in the workspace
      const activityKey = `workspace:${invitation.workspaceId}:activity`
      const activities = await redis.get(activityKey) || []
      const activityList = Array.isArray(activities) ? activities : []

      activityList.unshift({
        id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: invitation.workspaceId,
        userId: session.email,
        username: session.username,
        action: 'workspace_member_added',
        data: {
          newMember: newMember,
          workspaceName: invitation.workspaceName,
          invitationAccepted: true
        },
        timestamp: new Date().toISOString()
      })

      // Keep only last 50 activities
      if (activityList.length > 50) {
        activityList.splice(50)
      }

      await redis.set(activityKey, activityList)
      await redis.set(`workspace:${invitation.workspaceId}:last_activity`, Date.now())

      console.log(`[Saathi] Successfully tracked invitation acceptance activity`)
    } catch (error) {
      console.error("[Saathi] Error tracking invitation acceptance activity:", error)
    }

    console.log(`[Saathi] User ${session.email} accepted invitation to workspace ${invitation.workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error accepting invitation:", error)
    throw error
  }
}

// Decline workspace invitation
export async function declineInvitation(invitationId: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Get invitation
    const invitationData = await redis.get(`invitation:${invitationId}`)
    if (!invitationData) {
      throw new Error("Invitation not found")
    }

    let invitation: Invitation
    if (typeof invitationData === "string") {
      invitation = JSON.parse(invitationData)
    } else {
      invitation = invitationData as Invitation
    }

    // Verify invitation belongs to current user
    if (invitation.inviteeEmail !== session.email) {
      throw new Error("Invitation does not belong to current user")
    }

    // Update invitation status
    invitation.status = "declined"
    await redis.set(`invitation:${invitationId}`, JSON.stringify(invitation))

    console.log(`[Saathi] User ${session.email} declined invitation to workspace ${invitation.workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error declining invitation:", error)
    throw error
  }
}