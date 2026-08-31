export type WorkspaceSubscriptionAuthorization =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; message: string }

export function authorizeWorkspaceSubscription(
  workspaceData: unknown,
  userEmail: string,
): WorkspaceSubscriptionAuthorization {
  if (!workspaceData || typeof workspaceData !== "object") {
    return { allowed: false, status: 404, message: "Workspace not found" }
  }

  const members = (workspaceData as { members?: unknown }).members
  const isMember = Array.isArray(members) && members.some((member) => (
    member !== null
    && typeof member === "object"
    && (member as { email?: unknown }).email === userEmail
  ))

  return isMember
    ? { allowed: true }
    : { allowed: false, status: 403, message: "Forbidden" }
}

export function createSingleFlightPoll(poll: () => Promise<void>) {
  let inFlight = false

  return async function runPoll(): Promise<boolean> {
    if (inFlight) return false

    inFlight = true
    try {
      await poll()
      return true
    } finally {
      inFlight = false
    }
  }
}
