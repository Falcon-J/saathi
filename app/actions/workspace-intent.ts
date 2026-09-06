"use server"

import { getSession } from "@/lib/auth-simple"
import { createWorkspaceRecord } from "@/lib/data/workspaces"
import type { Workspace } from "@/app/actions/workspaces"
import { revalidatePath } from "next/cache"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { requestGroqStructuredResponse } from "@/lib/groq-chat"
import { parseWorkspacePlan,workspacePlanJsonSchema,reviewedWorkspacePlanSchema,type WorkspacePlan } from "@/lib/workspace-intent"
import { consumeDistributedRateLimit } from "@/lib/rate-limit"
export type WorkspaceIntentResult={workspace?:Workspace;error?:string}
export type WorkspaceCommandResult={action?:"complete_task"|"add_task"|"move_task"|"rename_workspace";error?:string}
export async function generateWorkspaceDraft(intent:string):Promise<{plan?:WorkspacePlan;error?:string}>{
  try{
    const session=await getSession()
    if(!session)return {error:"Please sign in to use planning."}
    if(!isAiWorkspaceEnabled())return {error:"AI planning is unavailable. You can create your workspace manually."}
    if(typeof intent!=="string"||!intent.trim()||intent.length>2000)return {error:"Describe your goal in 1 to 2000 characters."}
    await consumeDistributedRateLimit(`ai-plan:${session.id}`,5,3600000)
    const plan=await requestGroqStructuredResponse({name:"saathi_workspace_plan",schema:workspacePlanJsonSchema,
      instructions:"Suggest 3 to 8 actionable tasks for the goal. Suggestions are drafts for human review. Never claim any work was saved. Do not invent people or external facts. Use null dates unless a date is explicitly given. Keep the summary to one sentence.",input:intent.trim(),parse:parseWorkspacePlan})
    return {plan}
  }catch{return {error:"Planning is unavailable right now. Your goal is preserved; try again or create manually."}}
}
export async function createWorkspaceFromPlan(input:unknown):Promise<WorkspaceIntentResult>{
  try{
    const session=await getSession();if(!session)return {error:"Authentication required"}
    const parsed=reviewedWorkspacePlanSchema.safeParse(input)
    if(!parsed.success)return {error:"Review the workspace name, goal, dates, and selected tasks."}
    await consumeDistributedRateLimit(`workspace-create:${session.id}`,20,3600000)
    const plan=parsed.data
    const workspace=await createWorkspaceRecord(session.id,{name:plan.title,summary:plan.summary,targetDate:plan.targetDate,
      tasks:plan.tasks.map(t=>({title:t.title,bucket:t.bucket,dueDate:t.dueDate??undefined,estimatedMinutes:t.estimatedMinutes??undefined}))})
    revalidatePath("/dashboard");return {workspace}
  }catch{return {error:"Workspace could not be saved. Please retry after checking your workspace list."}}
}
// Old mutation entry points fail closed; v1 AI only returns reviewed drafts.
export async function generateWorkspaceFromIntent(_intent:string):Promise<WorkspaceIntentResult>{return {error:"Review a suggested plan before creating your workspace."}}
export async function applyNaturalLanguageCommand(_workspaceId:string,_commandText:string):Promise<WorkspaceCommandResult>{return {error:"Use the Board to make task changes."}}
