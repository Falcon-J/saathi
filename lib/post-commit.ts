import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { flushOutbox } from "./data/events"

const scheduledWorkspaces = new Set<string>()

/** Cache and realtime delivery cannot change the outcome of a committed write. */
export function afterDomainCommit(workspaceId: string) {
  try { revalidatePath("/dashboard") }
  catch { console.warn("[Saathi] Dashboard cache refresh deferred after committed write") }
  if (scheduledWorkspaces.has(workspaceId)) return
  scheduledWorkspaces.add(workspaceId)
  try {
    after(async () => {
      try {
        // Covers a maximum CSV import; larger backlogs remain for the retry worker.
        for (let batch = 0; batch < 4; batch++) {
          const result = await flushOutbox(workspaceId)
          if (result.unavailable || result.failed || result.attempted < 25) break
        }
      } catch { console.warn("[Saathi] Outbox delivery deferred to retry worker") }
      finally { scheduledWorkspaces.delete(workspaceId) }
    })
  } catch {
    scheduledWorkspaces.delete(workspaceId)
    console.warn("[Saathi] Outbox scheduling deferred to retry worker")
  }
}
