"use server"

import { getSession } from "@/lib/auth-simple"
import { listActivityEvents, type ActivityEvent } from "@/lib/data/activity"

export async function getWorkspaceActivity(workspaceId: string): Promise<{ events?: ActivityEvent[]; error?: string }> {
  const session = await getSession()
  if (!session) return { error: "Authentication required" }
  try {
    return { events: await listActivityEvents(session.id, workspaceId) }
  } catch {
    return { error: "Unable to load activity. Please retry." }
  }
}
