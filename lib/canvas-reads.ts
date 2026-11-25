import type { getTaskGraph as getTaskGraphAction } from "@/app/actions/task-dependencies"
import type { getCanvasResources as getCanvasResourcesAction } from "@/features/access/actions"

type GraphResult = Awaited<ReturnType<typeof getTaskGraphAction>>
type ResourcesResult = Awaited<ReturnType<typeof getCanvasResourcesAction>>

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
  if (!response.ok && response.status !== 400) throw new Error(`Canvas read failed with ${response.status}`)
  return await response.json() as T
}

/** Canvas reads go through GET routes so they run in parallel; server actions are queued one at a time by the client. */
export const getTaskGraph = (workspaceId: string) => read<GraphResult>(`/api/canvas/graph?workspaceId=${encodeURIComponent(workspaceId)}`)
export const getCanvasResources = () => read<ResourcesResult>("/api/canvas/resources")
