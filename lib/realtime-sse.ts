export {
  authorizeWorkspaceMember as authorizeWorkspaceSubscription,
  type WorkspaceAccessAuthorization as WorkspaceSubscriptionAuthorization,
} from "./workspace-policy.ts"

export function getInitialStreamCursor(lastEventId: string | null, latestStreamId: string | null): string {
  return lastEventId ?? latestStreamId ?? "0-0"
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
