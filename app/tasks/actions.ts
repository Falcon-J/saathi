"use server"

import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { createTaskRecord, changeTaskRecord, listTaskRecords, TaskError } from "@/lib/data/tasks"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { getRateLimits } from "@/lib/env"
import type { TaskUpdate } from "./contract"

export type TaskStatus = "todo" | "in-progress" | "done"
export interface Task {
  id: string; workspaceId: string; title: string; description?: string; completed: boolean; status?: TaskStatus;
  priority: "low" | "medium" | "high"; dueDate?: string; dueAt?: string; bucket?: "today" | "next";
  estimatedMinutes?: number; assigneeEmail?: string; createdAt: string; updatedAt: string; createdBy: string;
  version?: number;
}
export type TaskMutationResult = {success?: true;error?: string;task?: Task;code?: "rate_limited";retryAfterSeconds?: number}
function publicError(error: unknown): TaskMutationResult {
  if (error instanceof RateLimitExceeded) return {error:error.message,code:"rate_limited",retryAfterSeconds:error.retryAfterSeconds}
  return {error:error instanceof TaskError ? error.message : "Unable to save task. Please try again."}
}
async function actor() {
  const session = await getSession()
  if (!session) throw new TaskError("Authentication required")
  const limit = getRateLimits().tasks
  await consumeDistributedRateLimit(`tasks:${session.id}`,limit.maxRequests,limit.windowMs)
  return session
}
export async function addTask(workspaceId:string,title:string,description?:string,dueDate?:string,assigneeEmail?:string,priority:"low"|"medium"|"high"="medium",bucket?:"today"|"next",estimatedMinutes?:number|null,dueAt?:string):Promise<TaskMutationResult> {
  try {
    const session = await actor()
    const task = await createTaskRecord(session.id,workspaceId,{title,description,dueDate,dueAt,assigneeEmail,priority,bucket,estimatedMinutes:estimatedMinutes ?? undefined})
    revalidatePath("/dashboard")
    return {success:true,task}
  } catch(error) {return publicError(error)}
}
export async function updateTask(taskId:string,updates:TaskUpdate,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();const task=await changeTaskRecord(session.id,taskId,"edit",updates,expectedUpdatedAt);revalidatePath("/dashboard");return {success:true,task}} catch(error){return publicError(error)}
}
export async function toggleTask(taskId:string,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();const task=await changeTaskRecord(session.id,taskId,"toggle",{},expectedUpdatedAt);revalidatePath("/dashboard");return {success:true,task}} catch(error){return publicError(error)}
}
export async function deleteTask(taskId:string,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();await changeTaskRecord(session.id,taskId,"delete",{},expectedUpdatedAt);revalidatePath("/dashboard");return {success:true}} catch(error){return publicError(error)}
}
export async function getTasks(workspaceId:string):Promise<{success?:true;tasks?:Task[];error?:string}> {
  try {const session=await getSession();if(!session)return {error:"Authentication required"};return {success:true,tasks:await listTaskRecords(session.id,workspaceId)}} catch(error){return {error:error instanceof TaskError ? error.message : "Unable to load tasks. Please retry."}}
}
export async function assignTask(taskId:string,assigneeEmail:string,expectedUpdatedAt?:string|number) {return updateTask(taskId,{assigneeEmail:assigneeEmail || undefined},expectedUpdatedAt)}
