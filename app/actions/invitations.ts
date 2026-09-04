"use server"

import redis from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { realtimeService } from "@/lib/realtime"
import { recordUsageEvent } from "@/lib/usage"
import { normalizeEmail } from "@/lib/identity"
import { getRateLimits } from "@/lib/env"
import { schemas, SecurityService } from "@/lib/security"
import {
  INVITATION_LIFETIME_MS,
  InvitationStatus,
  transitionInvitation,
} from "@/lib/invitation-domain"
import { getWorkspace } from "./workspaces"

export interface Invitation {
  id: string
  workspaceId: string
  workspaceName: string
  inviterEmail: string
  inviterUsername: string
  inviteeEmail: string
  status: InvitationStatus
  createdAt: string
  expiresAt: string
}

const INVITATION_RECORD_RETENTION_SECONDS = 30 * 24 * 60 * 60
const ACCEPT_CLAIM_SECONDS = 30

function invitationUniquenessKey(workspaceId: string, inviteeEmail: string): string {
  return `workspace:${workspaceId}:invitation:${SecurityService.hashForLogging(inviteeEmail)}`
}

function invitationAcceptClaimKey(invitationId: string): string {
  return `invitation:${invitationId}:accepting`
}

function parseInvitation(data: unknown): Invitation {
  const parsed = typeof data === "string" ? JSON.parse(data) : data
  return SecurityService.validateInput(schemas.invitation, parsed) as Invitation
}

async function enforceInvitationRateLimit(ownerEmail: string, workspaceId: string): Promise<void> {
  const { maxRequests, windowMs } = getRateLimits().invitations
  const bucket = Math.floor(Date.now() / windowMs)
  const key = `rate:invitations:${SecurityService.hashForLogging(`${ownerEmail}:${workspaceId}:${bucket}`)}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.set(key, count, { ex: Math.ceil(windowMs / 1000) + 1 })
  }

  if (count > maxRequests) {
    throw new Error("Invitation rate limit exceeded. Please try again later.")
  }
}

async function removePendingInvitation(invitation: Invitation): Promise<void> {
  await redis.srem(`user:${normalizeEmail(invitation.inviteeEmail)}:invitations`, invitation.id)
  await redis.del(invitationUniquenessKey(invitation.workspaceId, invitation.inviteeEmail))
}

async function releaseInvitationClaim(key: string, token: string): Promise<void> {
  const currentClaim = await redis.get(key).catch(() => null)
  if (currentClaim === token) {
    await redis.del(key).catch(() => undefined)
  }
}

// Send workspace invitation
export async function sendWorkspaceInvitation(workspaceId: string, inviteeEmail: string): Promise<void> {
  let uniquenessKey: string | null = null
  let invitationId: string | null = null
  let claimedUniqueness = false

  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const validatedWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)
    const normalizedInviteeEmail = SecurityService.validateInput(schemas.email, inviteeEmail)
    inviteeEmail = normalizedInviteeEmail

    // Prevent self-invitation
    if (inviteeEmail === normalizeEmail(session.email)) {
      throw new Error("You cannot invite yourself to the workspace")
    }

    // Get workspace details
    const workspace = await getWorkspace(validatedWorkspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    // Check if user is owner
    if (normalizeEmail(workspace.ownerId) !== normalizeEmail(session.email)) {
      throw new Error("Only workspace owner can send invitations")
    }

    // Check if user is already a member
    if (workspace.members.some(m => normalizeEmail(m.email) === inviteeEmail)) {
      throw new Error("User is already a member of this workspace")
    }

    // Preserve compatibility with invitations created before the uniqueness key existed.
    const existingInvitations = await loadUserInvitations(inviteeEmail)
    if (existingInvitations.some(invitation => invitation.workspaceId === validatedWorkspaceId)) {
      throw new Error("Invitation already sent to this user")
    }

    await enforceInvitationRateLimit(session.email, validatedWorkspaceId)

    // Create invitation
    invitationId = SecurityService.generateSecureId("invitation")
    const now = new Date()
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS)

    const invitation: Invitation = {
      id: invitationId,
      workspaceId: validatedWorkspaceId,
      workspaceName: workspace.name,
      inviterEmail: session.email,
      inviterUsername: session.username,
      inviteeEmail,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }

    uniquenessKey = invitationUniquenessKey(validatedWorkspaceId, inviteeEmail)
    claimedUniqueness = await redis.setIfAbsent(uniquenessKey, invitationId, {
      ex: Math.ceil(INVITATION_LIFETIME_MS / 1000),
    })
    if (!claimedUniqueness) {
      throw new Error("Invitation already sent to this user")
    }

    try {
      await redis.set(`invitation:${invitationId}`, JSON.stringify(invitation), {
        ex: Math.ceil(INVITATION_LIFETIME_MS / 1000),
      })
      await redis.sadd(`user:${inviteeEmail}:invitations`, invitationId)
    } catch (error) {
      await redis.del(uniquenessKey)
      await redis.del(`invitation:${invitationId}`)
      throw error
    }

    console.log(`[Saathi] Created invitation ${SecurityService.hashForLogging(invitationId)} for workspace ${validatedWorkspaceId}`)
  } catch (error) {
    if (claimedUniqueness && uniquenessKey && invitationId) {
      await redis.del(uniquenessKey).catch(() => undefined)
    }
    console.error("[Saathi] Error sending invitation:", error)
    throw error
  }
}

// Get user's pending invitations
async function loadUserInvitations(userEmail: string): Promise<Invitation[]> {
  const normalizedUserEmail = normalizeEmail(userEmail)
  const invitationIds = await redis.smembers(`user:${normalizedUserEmail}:invitations`)
  const invitations: Invitation[] = []

  for (const invitationId of invitationIds) {
    const invitationData = await redis.get(`invitation:${invitationId}`)
    if (invitationData) {
      const invitation = parseInvitation(invitationData)

      // Check if invitation is expired
      if (invitation.status === "pending" && new Date(invitation.expiresAt) > new Date()) {
        invitations.push(invitation)
      } else {
        if (invitation.status === "pending") {
          const expiredInvitation = transitionInvitation(invitation, "expired")
          await redis.set(`invitation:${invitation.id}`, JSON.stringify(expiredInvitation), {
            ex: INVITATION_RECORD_RETENTION_SECONDS,
          })
        }
        await removePendingInvitation(invitation)
      }
    }
  }

  return invitations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getUserInvitations(userEmail: string): Promise<Invitation[]> {
  const session = await getSession()
  if (!session) {
    throw new Error("Not authenticated")
  }

  const normalizedUserEmail = normalizeEmail(userEmail)
  if (normalizeEmail(session.email) !== normalizedUserEmail) {
    throw new Error("Access denied")
  }

  return loadUserInvitations(normalizedUserEmail)
}

// Accept workspace invitation
export async function acceptInvitation(invitationId: string): Promise<void> {
  let claimKey: string | null = null
  let claimToken: string | null = null

  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const validatedInvitationId = SecurityService.validateInput(schemas.invitationId, invitationId)

    // Get invitation
    const invitationData = await redis.get(`invitation:${validatedInvitationId}`)
    if (!invitationData) {
      throw new Error("Invitation not found")
    }

    let invitation = parseInvitation(invitationData)

    // Verify invitation belongs to current user
    if (normalizeEmail(invitation.inviteeEmail) !== normalizeEmail(session.email)) {
      throw new Error("Invitation does not belong to current user")
    }

    // Accept is idempotent for the invited user.
    if (invitation.status === "accepted") {
      await removePendingInvitation(invitation)
      return
    }

    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending")
    }

    // Check if invitation is expired
    if (new Date(invitation.expiresAt) <= new Date()) {
      const expiredInvitation = transitionInvitation(invitation, "expired")
      await redis.set(`invitation:${invitation.id}`, JSON.stringify(expiredInvitation), {
        ex: INVITATION_RECORD_RETENTION_SECONDS,
      })
      await removePendingInvitation(invitation)
      throw new Error("Invitation has expired")
    }

    // One short-lived claim prevents concurrent accepts for the same invitation.
    claimKey = invitationAcceptClaimKey(invitation.id)
    claimToken = SecurityService.generateSecureId("accept")
    const claimed = await redis.setIfAbsent(claimKey, claimToken, { ex: ACCEPT_CLAIM_SECONDS })
    if (!claimed) {
      const latestData = await redis.get(`invitation:${invitation.id}`)
      if (latestData && parseInvitation(latestData).status === "accepted") return
      throw new Error("Invitation is already being accepted")
    }

    // Re-read after claiming so a previous winner is observed before mutation.
    const latestInvitationData = await redis.get(`invitation:${invitation.id}`)
    if (!latestInvitationData) {
      throw new Error("Invitation not found")
    }
    invitation = parseInvitation(latestInvitationData)
    if (invitation.status === "accepted") {
      if (claimKey && claimToken) {
        await releaseInvitationClaim(claimKey, claimToken)
      }
      return
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending")
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      const expiredInvitation = transitionInvitation(invitation, "expired")
      await redis.set(`invitation:${invitation.id}`, JSON.stringify(expiredInvitation), {
        ex: INVITATION_RECORD_RETENTION_SECONDS,
      })
      await removePendingInvitation(invitation)
      throw new Error("Invitation has expired")
    }

    // Get workspace
    const workspace = await getWorkspace(invitation.workspaceId)
    if (!workspace) {
      throw new Error("Workspace no longer exists")
    }

    // Add user to workspace
    const newMember = {
      id: normalizeEmail(session.email),
      email: normalizeEmail(session.email),
      username: session.username,
      role: "member" as const,
      joinedAt: new Date().toISOString()
    }

    const alreadyMember = workspace.members.some((member) => normalizeEmail(member.email) === normalizeEmail(session.email))
    if (!alreadyMember) {
      workspace.members.push(newMember)
    }
    await redis.set(`workspace:${invitation.workspaceId}`, JSON.stringify(workspace))

    // Add workspace to user's workspace list
    await redis.sadd(`user:${normalizeEmail(session.email)}:workspaces`, invitation.workspaceId)

    // Update invitation status
    const acceptedInvitation = transitionInvitation(invitation, "accepted")
    await redis.set(`invitation:${invitation.id}`, JSON.stringify(acceptedInvitation), {
      ex: INVITATION_RECORD_RETENTION_SECONDS,
    })

    // Remove invitation from user's pending list
    await removePendingInvitation(acceptedInvitation)

    // Track invitation acceptance activity
    if (!alreadyMember) {
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
    }

    // Publish real-time event for member added
    if (!alreadyMember) {
      realtimeService.publishEvent({
        type: 'member-added',
        workspaceId: invitation.workspaceId,
        userId: session.email,
        timestamp: Date.now(),
        data: { member: newMember, workspaceName: invitation.workspaceName }
      }).catch(err => console.error('[Realtime] member-added event failed:', err))
      void recordUsageEvent(invitation.workspaceId, session.email, "member-added")
    }

    revalidatePath('/dashboard')
    console.log(`[Saathi] User ${SecurityService.hashForLogging(session.email)} accepted invitation to workspace ${invitation.workspaceId}`)
  } catch (error) {
    if (claimKey && claimToken) {
      await releaseInvitationClaim(claimKey, claimToken)
    }
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

    const validatedInvitationId = SecurityService.validateInput(schemas.invitationId, invitationId)

    // Get invitation
    const invitationData = await redis.get(`invitation:${validatedInvitationId}`)
    if (!invitationData) {
      throw new Error("Invitation not found")
    }

    const invitation = parseInvitation(invitationData)

    // Verify invitation belongs to current user
    if (normalizeEmail(invitation.inviteeEmail) !== normalizeEmail(session.email)) {
      throw new Error("Invitation does not belong to current user")
    }

    if (invitation.status === "declined") {
      await removePendingInvitation(invitation)
      return
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending")
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      const expiredInvitation = transitionInvitation(invitation, "expired")
      await redis.set(`invitation:${invitation.id}`, JSON.stringify(expiredInvitation), {
        ex: INVITATION_RECORD_RETENTION_SECONDS,
      })
      await removePendingInvitation(invitation)
      throw new Error("Invitation has expired")
    }

    const declinedInvitation = transitionInvitation(invitation, "declined")
    await redis.set(`invitation:${invitation.id}`, JSON.stringify(declinedInvitation), {
      ex: INVITATION_RECORD_RETENTION_SECONDS,
    })
    await removePendingInvitation(declinedInvitation)

    console.log(`[Saathi] User ${SecurityService.hashForLogging(session.email)} declined invitation to workspace ${invitation.workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error declining invitation:", error)
    throw error
  }
}
