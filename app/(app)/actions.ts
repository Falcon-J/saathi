"use server"
import { revalidatePath } from "next/cache"
import { serverClient } from "@/lib/supabase"

export type Decision = { kind: "approve" } | { kind: "stop" } | { kind: "send_back"; note: string } | { kind: "answer"; answer: string }

// Approve, Stop agent, Send back and Answer. Each is one SQL function, which checks membership and the task's state.
export async function decide(ws: string, task: string, d: Decision): Promise<{ ok: boolean; message?: string }> {
  const supabase = await serverClient()
  const { data, error } =
    d.kind === "approve" ? await supabase.rpc("approve_task", { p_ws: ws, p_task: task })
    : d.kind === "stop" ? await supabase.rpc("release_task", { p_ws: ws, p_task: task })
    : d.kind === "send_back" ? await supabase.rpc("send_back_task", { p_ws: ws, p_task: task, p_note: d.note })
    : await supabase.rpc("answer_question", { p_ws: ws, p_task: task, p_answer: d.answer })
  revalidatePath("/home")
  if (error || !data) return { ok: false, message: "Couldn't save that. Try again." }
  return data as { ok: boolean; message?: string }
}

export type NewTask = { title: string; doneWhen: string; details: string; waitsOn: string; agent: string; priority: number }

// The new-task dialog. agent is an agent id, "me", or "" for any agent.
export async function createTask(ws: string, t: NewTask): Promise<{ ok: boolean; ref?: string; message?: string }> {
  const supabase = await serverClient()
  const { data, error } = await supabase.rpc("create_task", {
    p_ws: ws, p_title: t.title, p_done_when: t.doneWhen, p_details: t.details, p_priority: t.priority,
    p_assignee_agent: t.agent && t.agent !== "me" ? t.agent : null, p_assign_me: t.agent === "me",
    p_waits_on: t.waitsOn ? [t.waitsOn] : [],
  })
  revalidatePath("/home")
  if (error || !data) return { ok: false, message: "Couldn't create it. Try again." }
  return data as { ok: boolean; ref?: string; message?: string }
}

// Catch up or dismiss the "Since" line.
export async function markVisit(ws: string) {
  await (await serverClient()).rpc("mark_visit", { p_ws: ws })
  revalidatePath("/home")
}
