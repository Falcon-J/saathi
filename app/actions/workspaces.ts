"use server"

import redis from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"

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
  members: Member[]
  createdAt: string
  ownerId: string
}

// Get all workspaces for a user
export async function getUserWorkspaces(userEmail: string): Promise<Workspace[]> {
  try {
    // Verify authentication
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    // Verify user can only access their own workspaces
    if (session.email !== userEmail) {
      throw new Error("Access denied")
    }

    const workspaceIds = await redis.smembers(`user:${userEmail}:workspaces`)
    console.log(`[Saathi] getUserWorkspaces called for user: ${userEmail}`)
    console.log(`[Saathi] User ${userEmail} has workspace IDs:`, workspaceIds)
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
  } catch (error) {
    console.error("[Saathi] Error fetching user workspaces:", error)
    return []
  }
}

// Create a new workspace
export async function createWorkspace(name: string): Promise<Workspace> {
  try {
    const session = await getSession()
    if (!session) {
      throw new Error("Not authenticated")
    }

    const workspaceId = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    const workspace: Workspace = {
      id: workspaceId,
      name,
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
    if (workspace.ownerId !== session.email) {
      throw new Error("Only workspace owner can invite members")
    }

    // Check if member already exists
    if (workspace.members.some(m => m.email === memberEmail)) {
      throw new Error("User is already a member of this workspace")
    }

    // Import and use invitation function
    const { sendWorkspaceInvitation } = await import("./invitations")
    await sendWorkspaceInvitation(workspaceId, memberEmail)

    // Note: Real-time notifications would be implemented here
    // For now, invitations are stored and checked when user loads the app
    console.log(`[Saathi] Invitation sent to ${memberEmail} for workspace ${workspace.name}`)
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
    if (workspace.ownerId !== session.email && memberEmail !== session.email) {
      throw new Error("Only workspace owner can remove members")
    }

    // Special case: If owner is trying to leave and they're the only member, delete the workspace
    if (workspace.ownerId === memberEmail && workspace.members.length === 1) {
      await deleteWorkspace(workspaceId)
      console.log(`[Saathi] Deleted workspace ${workspaceId} as owner was the only member`)
      return
    }

    // If owner is leaving but there are other members, transfer ownership to the first member
    if (workspace.ownerId === memberEmail && workspace.members.length > 1) {
      const newOwner = workspace.members.find(m => m.email !== memberEmail)
      if (newOwner) {
        workspace.ownerId = newOwner.email
        newOwner.role = "owner"
        console.log(`[Saathi] Transferred ownership of workspace ${workspaceId} to ${newOwner.email}`)
      }
    }

    // Remove member
    workspace.members = workspace.members.filter(m => m.email !== memberEmail)

    // Save updated workspace
    await redis.set(`workspace:${workspaceId}`, JSON.stringify(workspace))

    // Remove workspace from member's workspace list
    const memberWorkspaces = await redis.smembers(`user:${memberEmail}:workspaces`)
    const updatedWorkspaces = memberWorkspaces.filter((id: string) => id !== workspaceId)
    await redis.del(`user:${memberEmail}:workspaces`)
    if (updatedWorkspaces.length > 0) {
      await redis.sadd(`user:${memberEmail}:workspaces`, ...updatedWorkspaces)
    }

    console.log(`[Saathi] Removed ${memberEmail} from workspace ${workspaceId}`)
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
    if (workspace.ownerId !== session.email) {
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

    console.log(`[Saathi] Updated workspace ${workspaceId} name from "${oldName}" to "${workspace.name}"`)
    console.log(`[Saathi] Broadcasting workspace name update event to workspace ${workspaceId}`)
  } catch (error) {
    console.error("[Saathi] Error updating workspace name:", error)
    throw error
  }
}

// Get workspace by ID
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  try {
    const workspaceData = await redis.get(`workspace:${workspaceId}`)
    if (!workspaceData) {
      return null
    }

    let workspace: Workspace
    if (typeof workspaceData === "string") {
      workspace = JSON.parse(workspaceData)
    } else {
      workspace = workspaceData as Workspace
    }

    return workspace
  } catch (error) {
    console.error("[Saathi] Error fetching workspace:", error)
    return null
  }
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
    if (workspace.ownerId !== session.email) {
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

    // Delete all workspace-related data
    await redis.del(`workspace:${workspaceId}`)
    await redis.del(`workspace:${workspaceId}:tasks`)
    await redis.del(`workspace:${workspaceId}:activity`)
    await redis.del(`workspace:${workspaceId}:last_activity`)
    await redis.del(`workspace:${workspaceId}:lastUpdate`)

    // Delete all tasks in the workspace
    const taskIds = await redis.smembers(`workspace:${workspaceId}:tasks`)
    for (const taskId of taskIds) {
      await redis.del(taskId)
    }

    console.log(`[Saathi] Deleted workspace ${workspaceId} and all associated data`)
  } catch (error) {
    console.error("[Saathi] Error deleting workspace:", error)
    throw error
  }
}