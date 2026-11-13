import { readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"

const database = process.argv.includes("--database")
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collect(path)
    return /\.test\.(ts|cjs)$/.test(path) && path.includes(".database.test.") === database ? [path] : []
  })
}
const files = collect("features").sort()
if (!database) files.push("hooks/use-canvas-graph.test.cjs", "hooks/useRealtime-access.test.cjs", ...collect("components/canvas"), ...collect("components/mcp"),
  "lib/browser-history.test.ts", "lib/db/platform-schema.test.ts", "lib/db/transaction-context.test.ts", "lib/capability-ceiling.test.ts", "app/api/users/route.test.cjs", "app/actions/coordination.test.cjs", "scripts/verify-mcp-local.test.cjs", "scripts/local-canvas-access-fixtures.test.mjs")
if (database && !process.env.DATABASE_TEST_URL) throw new Error("DATABASE_TEST_URL is required for platform database tests")
// Separate processes keep SQL pools and test dependency overrides isolated.
for (const file of files) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--experimental-test-isolation=none", "--test-force-exit", file], { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
