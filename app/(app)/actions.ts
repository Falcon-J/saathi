"use server"
import { revalidatePath } from "next/cache"
import { serverClient } from "@/lib/supabase"

export type Decision = { kind: "approve" } | { kind: "send_back"; note: string } | { kind: "answer"; answer: string }

// Approve, Send back and Answer. Each is one SQL function, which checks membership and the task's state.
export async function decide(ws: string, task: string, d: Decision): Promise<{ ok: boolean; message?: string }> {
  const supabase = await serverClient()
  const { data, error } =
    d.kind === "approve" ? await supabase.rpc("approve_task", { p_ws: ws, p_task: task })
    : d.kind === "send_back" ? await supabase.rpc("send_back_task", { p_ws: ws, p_task: task, p_note: d.note })
    : await supabase.rpc("answer_question", { p_ws: ws, p_task: task, p_answer: d.answer })
  revalidatePath("/home")
  if (error || !data) return { ok: false, message: "Couldn't save that. Try again." }
  return data as { ok: boolean; message?: string }
}
