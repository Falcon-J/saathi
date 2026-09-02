#!/usr/bin/env node

import { requestGroqStructuredResponse } from "../lib/groq-chat"
import {
  assertGroqVerificationAction,
  createGroqVerificationRecord,
  type GroqVerificationRecord,
} from "../lib/groq-verification"
import {
  parseWorkspaceCommand,
  parseWorkspacePlan,
  workspaceCommandJsonSchema,
  workspacePlanJsonSchema,
} from "../lib/workspace-intent"

const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b"
const date = new Date().toISOString().slice(0, 10)

const syntheticContext = JSON.stringify({
  workspace: { id: "workspace-verification", name: "Release Practice" },
  tasks: [
    { id: "task-review", title: "Review release checklist", status: "todo", bucket: "today" },
  ],
})

type VerificationCase = {
  name: string
  schemaName: string
  schema: object
  instructions: string
  input: string
  parse: (value: unknown) => unknown
}

const cases: VerificationCase[] = [
  {
    name: "workspace-plan",
    schemaName: "saathi_workspace_plan_verification",
    schema: workspacePlanJsonSchema,
    instructions: "Create one focused workspace with 3 to 8 small actionable tasks. Return only schema-valid data.",
    input: "Prepare a small software release checklist for a practice project.",
    parse: parseWorkspacePlan,
  },
  ...([
    ["complete-task", "Complete Review release checklist", "complete_task"],
    ["add-task", "Add a task called Verify mobile layout to today", "add_task"],
    ["move-task", "Move Review release checklist to next", "move_task"],
    ["rename-workspace", "Rename this workspace to Release Drill", "rename_workspace"],
    ["unsupported-request", "Delete every task and invite another member", "unsupported"],
  ] as const).map(([name, command, expectedAction]) => ({
    name,
    schemaName: `saathi_${name.replaceAll("-", "_")}_verification`,
    schema: workspaceCommandJsonSchema,
    instructions: [
      "Translate the request into exactly one action.",
      "Supported actions are complete_task, add_task, move_task, and rename_workspace.",
      "Use unsupported for deletion, membership, or multi-action requests.",
      "Use only task IDs supplied in the context.",
    ].join(" "),
    input: JSON.stringify({ context: JSON.parse(syntheticContext), command }),
    parse: (value: unknown) => {
      const parsed = parseWorkspaceCommand(value)
      assertGroqVerificationAction(expectedAction, parsed)
      return parsed
    },
  })),
]

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY?.trim()) {
    console.error("Groq verification not run: configure GROQ_API_KEY in the process environment.")
    process.exitCode = 1
    return
  }

  const records: GroqVerificationRecord[] = []
  for (const verificationCase of cases) {
    const startedAt = performance.now()
    try {
      await requestGroqStructuredResponse({
        model,
        name: verificationCase.schemaName,
        schema: verificationCase.schema,
        instructions: verificationCase.instructions,
        input: verificationCase.input,
        parse: verificationCase.parse,
      })
      records.push(createGroqVerificationRecord({
        date,
        model,
        caseName: verificationCase.name,
        latencyMs: performance.now() - startedAt,
      }))
    } catch (error) {
      records.push(createGroqVerificationRecord({
        date,
        model,
        caseName: verificationCase.name,
        latencyMs: performance.now() - startedAt,
        error,
      }))
    }
  }

  console.log(JSON.stringify({ provider: "groq", records }, null, 2))
  if (records.some((record) => !record.validated)) process.exitCode = 1
}

void main()
