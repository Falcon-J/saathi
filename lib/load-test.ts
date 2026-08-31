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
