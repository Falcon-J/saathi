// The Agents page: Connect with a real MCP client, live status, pause, limit, new key and revoke.
import { expect, test, type Page } from "@playwright/test"
import { signInLink, sql } from "./helpers"

const email = `agents-${Date.now()}@example.com`
const mine = `join app.members m on m.workspace_id = a.workspace_id join auth.users u on u.id = m.user_id where u.email = '${email}'`
let page: Page
let key = ""

const mcp = (k: string, body: object) => fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${k}` },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
})

test.describe.configure({ mode: "serial" })

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await page.goto("/signup")
  const sent = Date.now()
  await page.getByLabel("Work email").fill(email)
  await page.getByRole("button", { name: "Email me a link" }).click()
  await page.goto(await signInLink(email, sent))
  await expect(page).toHaveURL(/\/home/)
})
test.afterAll(() => page.close())

test("Connect makes a key, shows the line for your tool, and notices the first call", async () => {
  await page.getByRole("link", { name: "Agents" }).click()
  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible()
  await expect(page.getByRole("button", { name: /demo-agent/ })).toBeVisible()

  await page.getByRole("button", { name: "Connect agent" }).click()
  const dialog = page.getByRole("dialog", { name: "Connect an agent" })
  const cmd = dialog.locator("code")
  await expect(cmd).toContainText("claude mcp add --transport http saathi http://localhost:3000/mcp --header \"Authorization: Bearer sk_live_")
  await dialog.getByRole("tab", { name: "Cursor" }).click()
  await expect(cmd).toContainText("\"url\":\"http://localhost:3000/mcp\"")
  await dialog.getByRole("tab", { name: "Claude Code" }).click()
  key = (await cmd.textContent())!.match(/sk_live_[A-Za-z0-9]{32}/)![0]
  await expect(dialog.getByText("Listening for your agent. This updates by itself.")).toBeVisible()

  const r = await mcp(key, { method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Claude Code", version: "2" } } })
  expect(r.status).toBe(200)
  await expect(dialog.getByText("Connected: claude-code")).toBeVisible({ timeout: 10_000 })
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("button", { name: /claude-code/ })).toBeVisible()
})

test("the pane shows live status, and Pause and the limit save", async () => {
  await page.getByRole("button", { name: /claude-code/ }).click()
  const pane = page.getByRole("complementary", { name: "Agent detail" })
  await expect(pane.getByRole("heading", { name: "claude-code" })).toBeVisible()
  // The demo tasks belong to demo-agent. Free SAA-1 for any agent, as the pgTAP test does.
  sql(`update app.tasks t set assignee_agent_id = null from app.members m join auth.users u on u.id = m.user_id
       where m.workspace_id = t.workspace_id and u.email = '${email}' and t.number = 1`)
  await mcp(key, { method: "tools/call", params: { name: "next_task", arguments: { task: "SAA-1" } } })
  await expect(pane).toContainText("Working on SAA-1", { timeout: 10_000 })

  await pane.getByRole("button", { name: "Pause" }).click()
  await expect(page.getByRole("status").filter({ hasText: "claude-code paused" })).toBeVisible()
  await expect.poll(() => sql(`select a.paused_at is not null from app.agents a ${mine} and a.name = 'claude-code'`)).toBe("t")
  await pane.getByRole("button", { name: "Resume" }).click()
  await expect.poll(() => sql(`select a.paused_at is null from app.agents a ${mine} and a.name = 'claude-code'`)).toBe("t")

  await pane.getByLabel("At a time").selectOption("3")
  await expect.poll(() => sql(`select a.max_at_once from app.agents a ${mine} and a.name = 'claude-code'`)).toBe("3")
})

test("New key shows the key once, and the old one stops working", async () => {
  await page.getByRole("button", { name: "New key" }).click()
  const dialog = page.getByRole("dialog", { name: "New key for claude-code" })
  await expect(dialog.locator("code")).toHaveText(/^sk_live_[A-Za-z0-9]{32}$/)
  await dialog.getByRole("button", { name: "Done" }).click()
  expect((await mcp(key, { method: "tools/list" })).status).toBe(401)
})

test("Revoke says what goes back to Ready, then frees it", async () => {
  await page.getByRole("button", { name: "Revoke" }).click()
  const dialog = page.getByRole("dialog", { name: "Revoke claude-code's key?" })
  await expect(dialog).toContainText("SAA-1 goes back to Ready.")
  await dialog.getByRole("button", { name: "Revoke key" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Key revoked. SAA-1 is Ready." })).toBeVisible()
  await expect(page.getByRole("button", { name: /claude-code/ })).toBeHidden()
  expect(sql(`select t.status from app.tasks t join app.members m on m.workspace_id = t.workspace_id join auth.users u on u.id = m.user_id
              where u.email = '${email}' and t.number = 1`)).toBe("ready")
})

// Screenshots for the side-by-side check against plan/agents-v1. They are not assertions.
test("design shots", async () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 800 }]) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
      await page.setViewportSize(size)
      await page.goto("/agents")
      await page.screenshot({ path: `test-results/design/agents-${scheme}-${size.width}.png` })
    }
  }
})
