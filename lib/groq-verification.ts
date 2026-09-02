export type GroqVerificationOutcome =
  | "success"
  | "rate_limited"
  | "invalid_response"
  | "not_configured"
  | "unavailable"

export type GroqVerificationRecord = {
  date: string
  model: string
  case: string
  outcome: GroqVerificationOutcome
  validated: boolean
  latencyMs: number
}

type GroqVerificationInput = {
  date: string
  model: string
  caseName: string
  latencyMs: number
  error?: unknown
}

function classifyError(error: unknown): GroqVerificationOutcome {
  const message = error instanceof Error ? error.message : ""
  if (/not configured/i.test(message)) return "not_configured"
  if (/busy right now/i.test(message)) return "rate_limited"
  if (/valid response|could not understand/i.test(message)) return "invalid_response"
  return "unavailable"
}

export function createGroqVerificationRecord({
  date,
  model,
  caseName,
  latencyMs,
  error,
}: GroqVerificationInput): GroqVerificationRecord {
  return {
    date,
    model,
    case: caseName,
    outcome: error === undefined ? "success" : classifyError(error),
    validated: error === undefined,
    latencyMs: Math.max(0, Math.round(latencyMs)),
  }
}

export function assertGroqVerificationAction(
  expectedAction: string,
  value: unknown,
): void {
  const action = value && typeof value === "object"
    ? (value as { action?: unknown }).action
    : undefined
  if (action !== expectedAction) {
    throw new Error(`Expected ${expectedAction} but received a different action.`)
  }
}
