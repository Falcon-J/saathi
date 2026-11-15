import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { flushOutbox } from "./data/events"

interface WorkspaceDelivery { pending: boolean }
const scheduledWorkspaces = new Map<string, WorkspaceDelivery>()

function scheduleDelivery(workspaceId: string, delivery: WorkspaceDelivery): boolean {
  try {
    after(async () => {
      let handedOff = false
      try {
        // Bound each callback to 100 outbox rows, retaining coalesced writes across healthy handoffs.
        for (let batch = 0; batch < 4; batch++) {
          delivery.pending = false
          const result = await flushOutbox(workspaceId)
          if (result.unavailable || result.failed) {
            console.warn("[Saathi] Outbox delivery deferred to retry worker")
            return
          }
          if (result.attempted < 25 && !delivery.pending) return
        }
        // Next allows nested after callbacks. Keep the same map entry until healthy backlog is drained.
        handedOff = scheduleDelivery(workspaceId, delivery)
      } catch { console.warn("[Saathi] Outbox delivery deferred to retry worker") }
      finally { if (!handedOff) scheduledWorkspaces.delete(workspaceId) }
    })
    return true
  } catch {
    console.warn("[Saathi] Outbox scheduling deferred to retry worker")
    return false
  }
}

/** Cache and realtime delivery cannot change the outcome of a committed write. */
export function afterDomainCommit(workspaceId: string) {
  try { revalidatePath("/dashboard") }
  catch { console.warn("[Saathi] Dashboard cache refresh deferred after committed write") }
  const scheduled = scheduledWorkspaces.get(workspaceId)
  if (scheduled) { scheduled.pending = true; return }
  const delivery = { pending: false }
  scheduledWorkspaces.set(workspaceId, delivery)
  if (!scheduleDelivery(workspaceId, delivery)) scheduledWorkspaces.delete(workspaceId)
}
