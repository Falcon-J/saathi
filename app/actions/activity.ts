"use server"

import { getSession } from "@/lib/auth-simple"
import { listActivityEventsPage, type ActivityEvent } from "@/lib/data/activity"

export async function getWorkspaceActivity(workspaceId: string, cursor?: string): Promise<{ events?: ActivityEvent[]; nextCursor?: string | null; error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Authentication required" }
  try {
    return await listActivityEventsPage(session.id, workspaceId, cursor)
  } catch {
    return { error: "Unable to load activity. Please retry." }
  }
}
