#!/usr/bin/env node

import assert from "node:assert/strict"
import { loadEnvConfig } from "@next/env"
import { requestWorkspaceAdvisor } from "../lib/ai/workspace-advisor-service"
import type { AdvisorProjection, AdvisorResponse } from "../lib/ai/workspace-advisor"

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} })

const projection: AdvisorProjection = {
  workspace: { name: "Release Practice", summary: "Prepare a synthetic practice release" },
  tasks: [
    {
      id: "task-review",
      title: "Review release checklist",
      description: "The only unfinished task. Review before release.",
      status: "todo",
      priority: "high",
      dueDate: null,
      dueAt: null,
    },
    {
      id: "task-docs",
      title: "Write release notes",
      status: "done",
      priority: "low",
      dueDate: null,
      dueAt: null,
    },
  ],
}

const cases: Array<{
  name: string
  capability: AdvisorResponse["capability"]
  question: string
}> = [
  {
    name: "summary-contract",
    capability: "summarize_workspace",
    question: "Summarize the supplied tasks and how many are complete and unfinished. Use only supplied facts.",
  },
  {
    name: "attention-selection",
    capability: "identify_attention",
    question: "Identify the only unfinished high-priority task. Include only that task in attention; completed tasks do not need attention.",
  },
  {
    name: "task-draft-contract",
    capability: "draft_task",
    question: "Draft one task to verify mobile layout, medium priority, with no deadline. Do not save anything.",
  },
  {
    name: "unavailable-facts-contract",
    capability: "summarize_workspace",
    question: "What was this workspace's revenue last quarter? If the projection lacks this information, say you cannot determine it.",
  },
]

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY?.trim()) {
    console.error("Advisor verification not run: configure GROQ_API_KEY locally.")
    process.exitCode = 1
    return
  }

  for (const verificationCase of cases) {
    const startedAt = performance.now()
    let passed = false
    try {
      const response = await requestWorkspaceAdvisor({ ...verificationCase, projection })
      if (verificationCase.capability === "identify_attention") {
        assert.deepEqual(response.attention.map(item => item.taskId), ["task-review"])
      }
      passed = true
    } catch {
      process.exitCode = 1
    }
    console.log(JSON.stringify({
      case: verificationCase.name,
      passed,
      latencyMs: Math.round(performance.now() - startedAt),
    }))
  }
}

void main()
