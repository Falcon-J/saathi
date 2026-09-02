import { timingSafeEqual } from "node:crypto"

export function isLoadTestSecretValid(
  providedSecret: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!providedSecret || !configuredSecret) return false

  const provided = Buffer.from(providedSecret)
  const configured = Buffer.from(configuredSecret)

  return provided.length === configured.length && timingSafeEqual(provided, configured)
}

export function extractBenchmarkLatency(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null

  const value = payload as {
    data?: { loadTestId?: unknown }
    latencyMs?: unknown
  }

  if (typeof value.data?.loadTestId !== "string" || value.data.loadTestId.length === 0) {
    return null
  }

  return typeof value.latencyMs === "number"
    && Number.isFinite(value.latencyMs)
    && value.latencyMs >= 0
    ? value.latencyMs
    : null
}

export function requireLoadTestWorkspaceId(value: string | undefined): string {
  const workspaceId = value?.trim()
  if (!workspaceId) {
    throw new Error("Provide --workspace or LOAD_TEST_WORKSPACE_ID for an existing workspace owned by the benchmark session.")
  }
  return workspaceId
}

type BenchmarkVerdictInput = {
  connected: number
  failed: number
  testEventCount: number
  testEventsReceived: number
}

export function evaluateBenchmark({
  connected,
  failed,
  testEventCount,
  testEventsReceived,
}: BenchmarkVerdictInput): { passed: boolean; expectedEvents: number } {
  const expectedEvents = connected * testEventCount
  return {
    passed: connected >= 200
      && failed === 0
      && testEventsReceived === expectedEvents,
    expectedEvents,
  }
}
