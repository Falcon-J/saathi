import { getMe, serverClient } from "@/lib/supabase"
import type { HomeData, TaskView } from "./home"

// Home and the task page read the same way: one call for the list, one for the open task.
// A failed read throws to error.tsx (a redirect to /signup would bounce straight back here).
export async function load(asked?: string) {
  const ws = (await getMe())?.workspaces[0]
  if (!ws) throw new Error("No workspace to show")
  const supabase = await serverClient()
  const view = (ref: string) => supabase.rpc("task_view", { p_ws: ws.id, p_task: ref })
  const [home, picked] = await Promise.all([supabase.rpc("home_view", { p_ws: ws.id }), asked ? view(asked) : null])
  if (home.error || !home.data) throw new Error("home_view failed")
  const data = home.data as HomeData
  const first = data.tasks.find(t => t.group === "you") ?? data.tasks[0]
  const open = asked ? picked : first ? await view(first.ref) : null
  const task = (open?.data as { task?: TaskView } | null)?.task ?? null
  return { ws: ws.id, data, task, at: new Date().toISOString() }
}
