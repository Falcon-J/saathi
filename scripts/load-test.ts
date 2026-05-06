#!/usr/bin/env node
/**
 * Saathi SSE Load Test — proves 200+ concurrent user support.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts [--connections N] [--duration S] [--url URL]
 *
 * Defaults:
 *   --connections 250     Number of concurrent SSE connections
 *   --duration    30      Test duration in seconds
 *   --url         http://localhost:3000
 */

import http from "http"
import https from "https"

// ── Parse CLI Args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const TARGET_CONNECTIONS = parseInt(getArg("connections", "250"))
const DURATION_SECONDS = parseInt(getArg("duration", "30"))
const BASE_URL = getArg("url", "http://localhost:3000")
const WORKSPACE_ID = "loadtest-workspace"

// ── Metrics ─────────────────────────────────────────────────────────────────
interface Metrics {
  attempted: number
  connected: number
  failed: number
  messagesReceived: number
  latencies: number[]
  errors: string[]
  connectTimes: number[]
}

const metrics: Metrics = {
  attempted: 0,
  connected: 0,
  failed: 0,
  messagesReceived: 0,
  latencies: [],
  errors: [],
  connectTimes: [],
}

// ── Percentile Helper ───────────────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * (p / 100)) - 1
  return sorted[Math.max(0, idx)]
}

// ── Open one SSE connection ─────────────────────────────────────────────────
function openSSE(connectionId: number): Promise<http.IncomingMessage | null> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    metrics.attempted++

    const url = `${BASE_URL}/api/realtime?workspaceId=${WORKSPACE_ID}`
    const client = url.startsWith("https") ? https : http

    const req = client.get(url, { headers: { Accept: "text/event-stream" } }, (res) => {
      const connectTime = Date.now() - startTime
      metrics.connectTimes.push(connectTime)

      if (res.statusCode !== 200) {
        metrics.failed++
        metrics.errors.push(`Connection ${connectionId}: HTTP ${res.statusCode}`)
        res.resume() // drain
        resolve(null)
        return
      }

      metrics.connected++

      let buffer = ""
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const block of lines) {
          if (!block.trim()) continue
          metrics.messagesReceived++

          // Try to measure latency from the event's timestamp
          try {
            const dataLine = block.split("\n").find((l: string) => l.startsWith("data:"))
            if (dataLine) {
              const payload = JSON.parse(dataLine.replace("data:", "").trim())
              if (payload.deliveredAt && payload.timestamp) {
                metrics.latencies.push(payload.deliveredAt - payload.timestamp)
              }
              if (payload.latencyMs != null) {
                metrics.latencies.push(payload.latencyMs)
              }
            }
          } catch {
            // ignore parse failures on non-JSON lines
          }
        }
      })

      res.on("error", () => {
        metrics.failed++
      })

      resolve(res)
    })

    req.on("error", (err) => {
      metrics.failed++
      metrics.errors.push(`Connection ${connectionId}: ${err.message}`)
      resolve(null)
    })

    // Timeout for connection establishment
    req.setTimeout(10000, () => {
      metrics.failed++
      metrics.errors.push(`Connection ${connectionId}: timeout`)
      req.destroy()
      resolve(null)
    })
  })
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════")
  console.log("  Saathi SSE Load Test")
  console.log("═══════════════════════════════════════════════════════════")
  console.log(`  Target connections: ${TARGET_CONNECTIONS}`)
  console.log(`  Duration:           ${DURATION_SECONDS}s`)
  console.log(`  URL:                ${BASE_URL}`)
  console.log(`  Workspace:          ${WORKSPACE_ID}`)
  console.log("───────────────────────────────────────────────────────────")
  console.log()

  // Phase 1: Open connections in batches of 50
  console.log("▶ Opening connections...")
  const connections: (http.IncomingMessage | null)[] = []
  const BATCH_SIZE = 50

  for (let i = 0; i < TARGET_CONNECTIONS; i += BATCH_SIZE) {
    const batch = Math.min(BATCH_SIZE, TARGET_CONNECTIONS - i)
    const promises = Array.from({ length: batch }, (_, j) => openSSE(i + j))
    const results = await Promise.all(promises)
    connections.push(...results)
    process.stdout.write(`  ${metrics.connected}/${TARGET_CONNECTIONS} connected, ${metrics.failed} failed\r`)
  }

  console.log(`\n✓ Connections established: ${metrics.connected}/${TARGET_CONNECTIONS}`)
  console.log(`  Failed: ${metrics.failed}`)
  console.log()

  // Phase 2: Hold connections for the test duration
  console.log(`▶ Holding connections for ${DURATION_SECONDS}s...`)
  const holdStart = Date.now()

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - holdStart) / 1000)
      process.stdout.write(`  ${elapsed}/${DURATION_SECONDS}s — ${metrics.messagesReceived} messages received\r`)
      if (elapsed >= DURATION_SECONDS) {
        clearInterval(timer)
        resolve()
      }
    }, 1000)
  })

  console.log()
  console.log()

  // Phase 3: Close all connections
  console.log("▶ Closing connections...")
  for (const conn of connections) {
    if (conn) conn.destroy()
  }

  // Phase 4: Report
  const sortedLatencies = [...metrics.latencies].sort((a, b) => a - b)
  const sortedConnectTimes = [...metrics.connectTimes].sort((a, b) => a - b)

  console.log()
  console.log("═══════════════════════════════════════════════════════════")
  console.log("  RESULTS")
  console.log("═══════════════════════════════════════════════════════════")
  console.log(`  Connections attempted:  ${metrics.attempted}`)
  console.log(`  Connections succeeded:  ${metrics.connected}`)
  console.log(`  Connections failed:     ${metrics.failed}`)
  console.log(`  Success rate:           ${((metrics.connected / metrics.attempted) * 100).toFixed(1)}%`)
  console.log()
  console.log(`  Messages received:      ${metrics.messagesReceived}`)
  console.log(`  Msg/connection/sec:     ${(metrics.messagesReceived / Math.max(metrics.connected, 1) / DURATION_SECONDS).toFixed(2)}`)
  console.log()

  if (sortedConnectTimes.length > 0) {
    console.log("  Connect time:")
    console.log(`    p50: ${percentile(sortedConnectTimes, 50)}ms`)
    console.log(`    p95: ${percentile(sortedConnectTimes, 95)}ms`)
    console.log(`    p99: ${percentile(sortedConnectTimes, 99)}ms`)
    console.log()
  }

  if (sortedLatencies.length > 0) {
    console.log("  Event delivery latency:")
    console.log(`    p50: ${percentile(sortedLatencies, 50)}ms`)
    console.log(`    p95: ${percentile(sortedLatencies, 95)}ms`)
    console.log(`    p99: ${percentile(sortedLatencies, 99)}ms`)
    console.log()
  }

  if (metrics.errors.length > 0) {
    console.log(`  Errors (showing first 10 of ${metrics.errors.length}):`)
    metrics.errors.slice(0, 10).forEach((e) => console.log(`    - ${e}`))
    console.log()
  }

  // Verdict
  const passed = metrics.connected >= 200
  console.log("───────────────────────────────────────────────────────────")
  console.log(passed
    ? `  ✅ PASS — ${metrics.connected} concurrent SSE connections sustained`
    : `  ❌ FAIL — Only ${metrics.connected} connections (need 200+)`
  )
  console.log("═══════════════════════════════════════════════════════════")

  process.exit(passed ? 0 : 1)
}

main().catch((err) => {
  console.error("Load test failed:", err)
  process.exit(1)
})
