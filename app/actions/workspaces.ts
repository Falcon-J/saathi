"use server"

import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { normalizeEmail } from "@/lib/identity"
import { getPublicInvitationError } from "@/lib/invitation-domain"
import {
  createWorkspaceRecord, deleteWorkspaceRecord, listWorkspaces, readWorkspace,
  removeWorkspaceMember, updateWorkspaceRecord, type Workspace, type WorkspaceInput,
} from "@/lib/data/workspaces"

export type { Workspace, Member } from "@/lib/data/workspaces"

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error("Not authenticated")
  return session
}

export async function getUserWorkspaces(userEmail: string): Promise<Workspace[]> {
  const session = await requireSession()
  if (normalizeEmail(userEmail) !== normalizeEmail(session.email)) throw new Error("Access denied")
  return listWorkspaces(session.id)
}

export async function createWorkspace(name: string, details?: Omit<WorkspaceInput, "name">): Promise<Workspace> {
  const session = await requireSession()
  const workspace = await createWorkspaceRecord(session.id, { ...details, name })
  revalidatePath("/dashboard")
  return workspace
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const session = await requireSession()
  return readWorkspace(workspaceId, session.id)
}

export async function updateWorkspace(workspaceId: string, input: WorkspaceInput, expectedVersion: number): Promise<Workspace> {
  const session = await requireSession()
  const workspace = await updateWorkspaceRecord(session.id, workspaceId, input, expectedVersion)
  revalidatePath("/dashboard")
  return workspace
}

export async function updateWorkspaceName(workspaceId: string, newName: string, expectedVersion: number): Promise<void> {
  const session = await requireSession()
  const current = await readWorkspace(workspaceId, session.id)
  if (!current) throw new Error("Workspace not found")
  await updateWorkspaceRecord(session.id, workspaceId, { ...current, name: newName }, expectedVersion)
  revalidatePath("/dashboard")
}

export async function inviteMemberToWorkspace(workspaceId: string, memberEmail: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireSession()
    const { sendWorkspaceInvitation } = await import("./invitations")
    const result = await sendWorkspaceInvitation(workspaceId, normalizeEmail(memberEmail))
    if (result.error) return { error: result.error }
    return { success: true }
  } catch (error) {
    return { error: getPublicInvitationError(error) }
  }
}

export async function removeMemberFromWorkspace(workspaceId: string, memberEmail: string): Promise<void> {
  const session = await requireSession()
  await removeWorkspaceMember(session.id, workspaceId, memberEmail)
  revalidatePath("/dashboard")
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const session = await requireSession()
  await deleteWorkspaceRecord(session.id, workspaceId)
  revalidatePath("/dashboard")
}
