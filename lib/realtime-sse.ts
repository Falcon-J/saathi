export {
  authorizeWorkspaceMember as authorizeWorkspaceSubscription,
  type WorkspaceAccessAuthorization as WorkspaceSubscriptionAuthorization,
} from "./workspace-policy.ts"

export function getInitialStreamCursor(lastEventId: string | null, latestStreamId: string | null): string {
  return lastEventId ?? latestStreamId ?? "0-0"
}

type ReplayStatus = "empty" | "replayable" | "resync-required"

function compareStreamIds(left: string, right: string): number | null {
  const leftParts = left.split("-").map(Number)
  const rightParts = right.split("-").map(Number)
  if (leftParts.length !== 2 || rightParts.length !== 2 || leftParts.some(Number.isNaN) || rightParts.some(Number.isNaN)) {
    return null
  }

  if (leftParts[0] !== rightParts[0]) return leftParts[0] - rightParts[0]
  return leftParts[1] - rightParts[1]
}

export function getReplayStatus(
  lastEventId: string | null,
  oldestStreamId: string | null,
  latestStreamId: string | null,
): ReplayStatus {
  if (!oldestStreamId || !latestStreamId) return "empty"
  if (!lastEventId) return "replayable"

  const oldestComparison = compareStreamIds(lastEventId, oldestStreamId)
  const latestComparison = compareStreamIds(lastEventId, latestStreamId)
  return oldestComparison !== null && latestComparison !== null && oldestComparison >= 0 && latestComparison <= 0
    ? "replayable"
    : "resync-required"
}

export function shouldProcessEvent(seenEventIds: Set<string>, eventId: string | undefined, maxEventIds = 256): boolean {
  if (!eventId) return true
  if (seenEventIds.has(eventId)) return false

  seenEventIds.add(eventId)
  while (seenEventIds.size > maxEventIds) {
    const oldest = seenEventIds.values().next().value
    if (typeof oldest !== "string") break
    seenEventIds.delete(oldest)
  }
  return true
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
