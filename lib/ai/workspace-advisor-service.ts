import { z } from "zod"
import { requestGroqStructuredResponse } from "../groq-chat.ts"
import {
  advisorCapabilitySchema,
  buildAdvisorProjection,
  parseAdvisorResponse,
  type AdvisorProjection,
  type AdvisorResponse,
  type AdvisorWorkspace,
} from "./workspace-advisor.ts"

type AdvisorProviderRequest = (options: {
  name: string
  schema: object
  instructions: string
  input: string
  parse: (value: unknown) => AdvisorResponse
}) => Promise<AdvisorResponse>

const requestInputSchema = z.object({
  capability: advisorCapabilitySchema,
  question: z.string().trim().min(1).max(2000),
}).strict()

export const advisorResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["capability", "answer", "attention", "draft"],
  properties: {
    capability: {
      type: "string",
      enum: ["summarize_workspace", "identify_attention", "draft_task"],
    },
    answer: { type: "string", minLength: 1, maxLength: 2000 },
    attention: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["taskId", "reason"],
        properties: {
          taskId: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1, maxLength: 300 },
        },
      },
    },
    draft: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "priority", "dueDate", "dueAt", "estimatedMinutes"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: ["string", "null"], maxLength: 1000 },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            dueDate: { type: ["string", "null"] },
            dueAt: { type: ["string", "null"] },
            estimatedMinutes: { type: ["integer", "null"], minimum: 1, maximum: 1440 },
          },
        },
      ],
    },
  },
} as const

const instructionsFor = (capability: AdvisorResponse["capability"]) => [
  "Return only JSON matching the provided schema.",
  "Give advice grounded only in the supplied workspace projection.",
  "Do not make changes, invoke tools, or claim that anything was saved.",
  `Use the ${capability} capability.`,
].join(" ")

export async function requestWorkspaceAdvisor({
  capability,
  question,
  projection,
  request = requestGroqStructuredResponse,
}: {
  capability: AdvisorResponse["capability"]
  question: string
  projection: AdvisorProjection | AdvisorWorkspace
  request?: AdvisorProviderRequest
}): Promise<AdvisorResponse> {
  const input = requestInputSchema.safeParse({ capability, question })
  if (!input.success) throw new Error("Advisor question is invalid")

  const authorizedProjection = "tasks" in projection && "workspace" in projection
    ? projection
    : buildAdvisorProjection(projection)

  return request({
    name: "saathi_workspace_advisor",
    schema: advisorResponseJsonSchema,
    instructions: instructionsFor(input.data.capability),
    input: JSON.stringify({ question: input.data.question, workspace: authorizedProjection }),
    parse: parseAdvisorResponse,
  })
}
