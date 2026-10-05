"use server"

import { getSession } from "@/lib/auth-simple"
import { afterDomainCommit } from "@/lib/post-commit"
import { createTaskRecord, changeTaskRecord, listTaskRecords, listTaskRecordsPage, getTaskAggregates, getTaskRecord, TaskError, type TaskErrorCode } from "@/lib/data/tasks"
import type { TaskPageInput, TaskPage, TaskAggregates } from "@/lib/task-page"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { getRateLimits } from "@/lib/env"
import type { Task, TaskUpdate } from "@/lib/task-contract"
export type { Task, TaskStatus } from "@/lib/task-contract"
export type TaskMutationResult = {success?: true;error?: string;task?: Task;code?: TaskErrorCode | "rate_limited";retryAfterSeconds?: number;unknownOutcome?: boolean}
function publicError(error: unknown): TaskMutationResult {
  if (error instanceof RateLimitExceeded) return {error:error.message,code:"rate_limited",retryAfterSeconds:error.retryAfterSeconds}
  return error instanceof TaskError ? {error:error.message,code:error.code} : {error:"Unable to confirm the task was saved. Refresh before retrying.",code:"unavailable",unknownOutcome:true}
}
async function actor() {
  const session = await getSession()
  if (!session) throw new TaskError("Authentication required", "unauthenticated")
  const limit = getRateLimits().tasks
  await consumeDistributedRateLimit(`tasks:${session.id}`,limit.maxRequests,limit.windowMs)
  return session
}
export async function addTask(workspaceId:string,title:string,description?:string,dueDate?:string,assigneeEmail?:string,priority:"low"|"medium"|"high"="medium",bucket?:"today"|"next",estimatedMinutes?:number|null,dueAt?:string,commandId?:string):Promise<TaskMutationResult> {
  try {
    const session = await actor()
    const task = await createTaskRecord(session.id,workspaceId,{title,description,dueDate,dueAt,assigneeEmail,priority,bucket,estimatedMinutes:estimatedMinutes ?? undefined},commandId)
    afterDomainCommit(task.workspaceId)
    return {success:true,task}
  } catch(error) {return publicError(error)}
}
export async function updateTask(taskId:string,updates:TaskUpdate,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();const task=await changeTaskRecord(session.id,taskId,"edit",updates,expectedUpdatedAt);afterDomainCommit(task.workspaceId);return {success:true,task}} catch(error){return publicError(error)}
}
export async function toggleTask(taskId:string,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();const task=await changeTaskRecord(session.id,taskId,"toggle",{},expectedUpdatedAt);afterDomainCommit(task.workspaceId);return {success:true,task}} catch(error){return publicError(error)}
}
export async function deleteTask(taskId:string,expectedUpdatedAt?:string|number):Promise<TaskMutationResult> {
  try {const session=await actor();const task=await changeTaskRecord(session.id,taskId,"delete",{},expectedUpdatedAt);afterDomainCommit(task.workspaceId);return {success:true}} catch(error){return publicError(error)}
}
export async function getTasks(workspaceId:string):Promise<{success?:true;tasks?:Task[];error?:string}> {
  try {const session=await getSession();if(!session)return {error:"Authentication required"};return {success:true,tasks:await listTaskRecords(session.id,workspaceId)}} catch(error){return {error:error instanceof TaskError ? error.message : "Unable to load tasks. Please retry."}}
}
export async function assignTask(taskId:string,assigneeEmail:string,expectedUpdatedAt?:string|number) {return updateTask(taskId,{assigneeEmail:assigneeEmail || undefined},expectedUpdatedAt)}
type TaskReadFailure = {success?:undefined;error:string;code:TaskErrorCode}
function readError(error:unknown): TaskReadFailure {return {error:error instanceof TaskError ? error.message : "Unable to load tasks. Please retry.",code:error instanceof TaskError ? error.code : "unavailable"}}
export async function getTasksPage(workspaceId:string,input:TaskPageInput={}):Promise<({success:true}&TaskPage)|TaskReadFailure> {
  try {const session=await getSession();if(!session)throw new TaskError("Authentication required","unauthenticated");return {success:true,...await listTaskRecordsPage(session.id,workspaceId,input)}} catch(error){return readError(error)}
}
export async function getWorkspaceTaskAggregates(workspaceId:string):Promise<{success:true;aggregates:TaskAggregates}|TaskReadFailure> {
  try {const session=await getSession();if(!session)throw new TaskError("Authentication required","unauthenticated");return {success:true,aggregates:await getTaskAggregates(session.id,workspaceId)}} catch(error){return readError(error)}
}
export async function getTaskById(workspaceId:string,taskId:string):Promise<{success:true;task:Task}|TaskReadFailure> {
  try {const session=await getSession();if(!session)throw new TaskError("Authentication required","unauthenticated");return {success:true,task:await getTaskRecord(session.id,workspaceId,taskId)}} catch(error){return readError(error)}
}
