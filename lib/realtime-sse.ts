export {
  authorizeWorkspaceMember as authorizeWorkspaceSubscription,
  type WorkspaceAccessAuthorization as WorkspaceSubscriptionAuthorization,
} from "./workspace-policy.ts"

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
