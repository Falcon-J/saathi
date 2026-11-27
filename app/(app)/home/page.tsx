import { redirect } from "next/navigation"
import { getMe, serverClient } from "@/lib/supabase"
import { Home, type Row, type TaskView } from "./home"
import s from "../app.module.css"

export const metadata = { title: "Home" }

// Home: one read for the list and one for the open task (?task=SAA-14, or the first that needs you).
export default async function Page({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const ws = (await getMe())?.workspaces[0]
  if (!ws) redirect("/signup")
  const supabase = await serverClient()
  const asked = (await searchParams).task
  const view = (ref: string) => supabase.rpc("task_view", { p_ws: ws.id, p_task: ref })
  const [home, picked] = await Promise.all([supabase.rpc("home_view", { p_ws: ws.id }), asked ? view(asked) : null])
  const tasks = ((home.data as { tasks?: Row[] } | null)?.tasks ?? [])
  const first = tasks.find(t => t.group === "you") ?? tasks[0]
  const open = asked ? picked : first ? await view(first.ref) : null
  const task = (open?.data as { ok: boolean; task?: TaskView } | null)?.task ?? null
  return (
    <>
      <header className={s.tb}><h1>Home</h1></header>
      <Home ws={ws.id} tasks={tasks} task={task} />
    </>
  )
}
