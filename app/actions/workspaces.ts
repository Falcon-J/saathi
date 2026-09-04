"use server"

import redis from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { realtimeService } from "@/lib/realtime"
import { normalizeEmail } from "@/lib/identity"

export interface Member {
  id: string
  email: string
  username: string
  role: "owner" | "member"
  joinedAt: string
}

export interface Workspace {
  id: string
  name: string
  summary?: string
  targetDate?: string | null
  members: Member[]
  createdAt: string
  ownerId: string
}

// Get all workspaces for a user
export async function getUserWorkspaces(userEmail: string): Promise<Workspace[]> {
  // Verify authentication
  const session = await getSession()
  if (!session) {
    throw new Error("Not authenticated")
  }

  // Verify user can only access their own workspaces
  const normalizedUserEmail = normalizeEmail(userEmail)
  if (normalizeEmail(session.email) !== normalizedUserEmail) {
    throw new Error("Access denied")
  }

  const workspaceIds = await redis.smembers(`user:${normalizedUserEmail}:workspaces`)
  console.log(`[Saathi] getUserWorkspaces called for user: ${normalizedUserEmail}`)
  console.log(`[Saathi] User ${normalizedUserEmail} has workspace IDs:`, workspaceIds)
  const workspaces: Workspace[] = []

  for (const workspaceId of workspaceIds) {
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    console.log(`[Saathi] Workspace ${workspaceId} data:`, workspaceData ? "found" : "not found")
    if (workspaceData) {
      let workspace: Workspace
      if (typeof workspaceData === "string") {
        workspace = JSON.parse(workspaceData)
      } else {
        workspace = workspaceData as Workspace
      }
      console.log(`[Saathi] Loaded workspace: ${workspace.name}`)
      workspaces.push(workspace)
    } else {
      console.warn(`[Saathi] Workspace ${workspaceId} not found in Redis`)
    }
  }

  return workspaces.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// Create a new workspace
export async function createWorkspace(
  name: string,
  details?: { summary?: string; targetDate?: string | null },
): Promise<Workspace> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error("Workspace name cannot be empty")
    }
    if (trimmedName.length > 100) {
      throw new Error("Workspace name cannot exceed 100 characters")
    }

    const summary = details?.summary?.trim()
    if (summary && summary.length > 240) {
      throw new Error("Workspace summary cannot exceed 240 characters")
    }
    if (details?.targetDate && Number.isNaN(Date.parse(details.targetDate))) {
      throw new Error("Workspace target date is invalid")
    }

    const workspaceId = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    const workspace: Workspace = {
      id: workspaceId,
      name: trimmedName,
      ...(summary ? { summary } : {}),
      ...(details?.targetDate !== undefined ? { targetDate: details.targetDate } : {}),
      members: [
        {
          id: session.email,
          email: session.email,
          username: session.username,
          role: "owner",
          joinedAt: now
        }
      ],
      createdAt: now,
      ownerId: session.email
    }

    // Save workspace
    await redis.set(`workspace:${workspaceId}`, JSON.stringify(workspace))

    // Add workspace to user's workspace list
    await redis.sadd(`user:${session.email}:workspaces`, workspaceId)

    // Publish real-time event
    realtimeService.publishEvent({
      type: 'workspace-created',
      workspaceId,
      userId: session.email,
      timestamp: Date.now(),
      data: { workspace }
    }).catch(err => console.error('[Realtime] workspace-created event failed:', err))

    revalidatePath('/dashboard')
    console.log(`[Saathi] Created workspace ${workspaceId} for ${session.email}`)
    return workspace
  } catch (error) {
    console.error("[Saathi] Error creating workspace:", error)
    throw error
  }
}

// Send invitation to join workspace (replaces direct member addition)
export async function inviteMemberToWorkspace(workspaceId: string, memberEmail: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Get workspace
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    if (!workspaceData) {
      throw new Error("Workspace not found")
    }

    let workspace: Workspace
    if (typeof workspaceData === "string") {
      workspace = JSON.parse(workspaceData)
    } else {
      workspace = workspaceData as Workspace
    }

    // Check if user is owner
    if (normalizeEmail(workspace.ownerId) !== normalizeEmail(session.email)) {
      throw new Error("Only workspace owner can invite members")
    }

    const normalizedMemberEmail = normalizeEmail(memberEmail)

    // Check if member already exists
    if (workspace.members.some(m => normalizeEmail(m.email) === normalizedMemberEmail)) {
      throw new Error("User is already a member of this workspace")
    }

    // Import and use invitation function
    const { sendWorkspaceInvitation } = await import("./invitations")
    await sendWorkspaceInvitation(workspaceId, normalizedMemberEmail)

    // Email delivery is intentionally not implied until a provider is configured.
    console.log(`[Saathi] In-app invitation created for workspace ${workspace.name}`)
  } catch (error) {
    console.error("[Saathi] Error inviting member to workspace:", error)
    throw error
  }
}

// Remove member from workspace
export async function removeMemberFromWorkspace(workspaceId: string, memberEmail: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const normalizedMemberEmail = normalizeEmail(memberEmail)

    // Get workspace
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    if (!workspaceData) {
      throw new Error("Workspace not found")
    }

    let workspace: Workspace
    if (typeof workspaceData === "string") {
      workspace = JSON.parse(workspaceData)
    } else {
      workspace = workspaceData as Workspace
    }

    // Check if user is owner or removing themselves
    if (normalizeEmail(workspace.ownerId) !== normalizeEmail(session.email)
      && normalizedMemberEmail !== normalizeEmail(session.email)) {
      throw new Error("Only workspace owner can remove members")
    }

    if (!workspace.members.some((member) => normalizeEmail(member.email) === normalizedMemberEmail)) {
      throw new Error("Member not found in this workspace")
    }

    // Special case: If owner is trying to leave and they're the only member, delete the workspace
    if (normalizeEmail(workspace.ownerId) === normalizedMemberEmail && workspace.members.length === 1) {
      await deleteWorkspace(workspaceId)
      console.log(`[Saathi] Deleted workspace ${workspaceId} as owner was the only member`)
      return
    }

    // If owner is leaving but there are other members, transfer ownership to the first member
    if (normalizeEmail(workspace.ownerId) === normalizedMemberEmail && workspace.members.length > 1) {
      const newOwner = workspace.members.find(m => normalizeEmail(m.email) !== normalizedMemberEmail)
      if (newOwner) {
        workspace.ownerId = newOwner.email
        newOwner.role = "owner"
        console.log(`[Saathi] Transferred ownership of workspace ${workspaceId} to ${newOwner.email}`)
      }
    }

    // Remove member
    workspace.members = workspace.members.filter(m => normalizeEmail(m.email) !== normalizedMemberEmail)

    // Save updated workspace
    await redis.set(`workspace:${workspaceId}`, JSON.stringify(workspace))

    // Remove workspace from member's workspace list
    const memberWorkspaces = await redis.smembers(`user:${normalizedMemberEmail}:workspaces`)
    const updatedWorkspaces = memberWorkspaces.filter((id: string) => id !== workspaceId)
    await redis.del(`user:${normalizedMemberEmail}:workspaces`)
    if (updatedWorkspaces.length > 0) {
      await redis.sadd(`user:${normalizedMemberEmail}:workspaces`, ...updatedWorkspaces)
    }

    // Publish real-time event
    realtimeService.publishEvent({
      type: 'member-removed',
      workspaceId,
      userId: session.email,
      timestamp: Date.now(),
      data: { memberEmail: normalizedMemberEmail }
    }).catch(err => console.error('[Realtime] member-removed event failed:', err))

    revalidatePath('/dashboard')
    console.log(`[Saathi] Removed ${normalizedMemberEmail} from workspace ${workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error removing member from workspace:", error)
    throw error
  }
}

// Update workspace name
export async function updateWorkspaceName(workspaceId: string, newName: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Validate name
    if (!newName || newName.trim().length === 0) {
      throw new Error("Workspace name cannot be empty")
    }

    if (newName.trim().length > 100) {
      throw new Error("Workspace name cannot exceed 100 characters")
    }

    // Get workspace
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    if (!workspaceData) {
      throw new Error("Workspace not found")
    }

    let workspace: Workspace
    if (typeof workspaceData === "string") {
      workspace = JSON.parse(workspaceData)
    } else {
      workspace = workspaceData as Workspace
    }

    // Check if user is owner
    if (normalizeEmail(workspace.ownerId) !== normalizeEmail(session.email)) {
      throw new Error("Only workspace owner can update workspace name")
    }

    // Update name
    const oldName = workspace.name
    workspace.name = newName.trim()

    // Save updated workspace
    console.log(`[Saathi] Saving workspace with new name: ${workspace.name}`)
    await redis.set(`workspace:${workspaceId}`, JSON.stringify(workspace))
    console.log(`[Saathi] Workspace saved successfully`)

    // Track workspace name update activity
    try {
      const activityKey = `workspace:${workspaceId}:activity`
      const activities = await redis.get(activityKey) || []
      const activityList = Array.isArray(activities) ? activities : []

      activityList.unshift({
        id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: workspaceId,
        userId: session.email,
        username: session.username,
        action: 'workspace_name_updated',
        data: { oldName, newName: workspace.name, updatedBy: session.username },
        timestamp: new Date().toISOString()
      })

      // Keep only last 50 activities
      if (activityList.length > 50) {
        activityList.splice(50)
      }

      await redis.set(activityKey, activityList)
      await redis.set(`workspace:${workspaceId}:last_activity`, Date.now())
    } catch (error) {
      console.error("[Saathi] Error tracking workspace name update activity:", error)
    }

    // Publish real-time event
    realtimeService.publishEvent({
      type: 'workspace-created', // re-use existing event type for name changes
      workspaceId,
      userId: session.email,
      timestamp: Date.now(),
      data: { workspace, oldName, newName: workspace.name }
    }).catch(err => console.error('[Realtime] workspace name update event failed:', err))

    revalidatePath('/dashboard')
    console.log(`[Saathi] Updated workspace ${workspaceId} name from "${oldName}" to "${workspace.name}"`)
  } catch (error) {
    console.error("[Saathi] Error updating workspace name:", error)
    throw error
  }
}

// Get workspace by ID
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const workspaceData = await redis.get(`workspace:${workspaceId}`)
  if (!workspaceData) {
    return null
  }

  if (typeof workspaceData === "string") {
    return JSON.parse(workspaceData) as Workspace
  }

  return workspaceData as Workspace
}

// Delete workspace completely
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Get workspace to verify ownership
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    if (!workspaceData) {
      throw new Error("Workspace not found")
    }

    let workspace: Workspace
    if (typeof workspaceData === "string") {
      workspace = JSON.parse(workspaceData)
    } else {
      workspace = workspaceData as Workspace
    }

    // Only owner can delete workspace
    if (normalizeEmail(workspace.ownerId) !== normalizeEmail(session.email)) {
      throw new Error("Only workspace owner can delete the workspace")
    }

    // Remove workspace from all members' workspace lists
    for (const member of workspace.members) {
      const memberWorkspaces = await redis.smembers(`user:${member.email}:workspaces`)
      const updatedWorkspaces = memberWorkspaces.filter((id: string) => id !== workspaceId)
      await redis.del(`user:${member.email}:workspaces`)
      if (updatedWorkspaces.length > 0) {
        await redis.sadd(`user:${member.email}:workspaces`, ...updatedWorkspaces)
      }
    }

    // Read task IDs before deleting the index so task records can be removed too.
    const taskIds = await redis.smembers(`workspace:${workspaceId}:tasks`)

    // Delete all workspace-related data
    await redis.del(`workspace:${workspaceId}`)
    await redis.del(`workspace:${workspaceId}:tasks`)
    await redis.del(`workspace:${workspaceId}:activity`)
    await redis.del(`workspace:${workspaceId}:last_activity`)
    await redis.del(`workspace:${workspaceId}:lastUpdate`)

    // Delete all tasks in the workspace
    for (const taskId of taskIds) {
      await redis.del(taskId)
    }

    console.log(`[Saathi] Deleted workspace ${workspaceId} and all associated data`)
  } catch (error) {
    console.error("[Saathi] Error deleting workspace:", error)
    throw error
  }
}
