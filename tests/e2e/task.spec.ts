// The new-task dialog, the full task page, Stop agent, catch-up, live updates and the offline banner.
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { signInLink, sql } from "./helpers"

const email = `task-${Date.now()}@example.com`
const key = "sk_live_" + Array.from({ length: 32 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGH23456789"[Math.floor(Math.random() * 40)]).join("")
const agent = (call: string) => sql(`select public.${call}`)
const mine = `join app.members m on m.workspace_id = t.workspace_id join auth.users u on u.id = m.user_id where u.email = '${email}'`
const status = (n: number) => sql(`select t.status from app.tasks t ${mine} and t.number = ${n}`)
let context: BrowserContext
let page: Page

// Keys work once the page has hydrated, so retry a press until it does what it should.
const press = (k: string, done: () => Promise<void>) => expect(async () => { await page.keyboard.press(k); await done() }).toPass()

test.describe.configure({ mode: "serial" })

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  await page.goto("/signup")
  const sent = Date.now()
  await page.getByLabel("Work email").fill(email)
  await page.getByRole("button", { name: "Email me a link" }).click()
  await page.goto(await signInLink(email, sent))
  await expect(page).toHaveURL(/\/home/)
  sql(`insert into app.agent_keys (agent_id, hash, last4)
       select a.id, app.key_hash('${key}'), right('${key}', 4) from app.agents a
         join app.members m on m.workspace_id = a.workspace_id join auth.users u on u.id = m.user_id
        where u.email = '${email}' and a.name = 'demo-agent'`)
})
test.afterAll(() => context.close())

test("C opens New task, which asks for a title and a Done when, then creates it", async () => {
  const dialog = page.getByRole("dialog", { name: "New task" })
  await press("c", () => expect(dialog).toBeVisible({ timeout: 500 }))
  await expect(page.getByLabel("Task title")).toBeFocused()
  await dialog.getByRole("button", { name: /Create task/ }).click()
  await expect(page.getByLabel("Task title")).toHaveAttribute("placeholder", "Give it a title first")

  await page.getByLabel("Task title").fill("Rate limit the public API")
  await dialog.getByRole("button", { name: /Create task/ }).click()
  await expect(dialog.getByText("Agents only pick up tasks with a Done when. Add one, or give it to yourself.")).toBeVisible()
  await expect(page.getByLabel("Done when")).toBeFocused()

  await page.getByLabel("Done when").fill("Each key gets 429 after 60 calls a minute.")
  await page.getByLabel("Details").fill("See docs/limits.md")
  await page.getByLabel("Waits on").selectOption("SAA-1")
  await page.getByLabel("Priority").selectOption("High")
  await page.keyboard.press("ControlOrMeta+Enter")
  const toast = page.getByRole("status").filter({ hasText: "SAA-3 created. It waits on SAA-1." })
  await expect(toast).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(sql(`select t.priority || ':' || t.details || ':' || t.status from app.tasks t ${mine} and t.number = 3`)).toBe("3:See docs/limits.md:waiting")

  await toast.getByRole("button", { name: "Open" }).click()
  await expect(page).toHaveURL(/task=SAA-3/)
})

test("the full page shows Done when, details and history, and goes back to Home", async () => {
  await page.getByRole("link", { name: "Open full page" }).click()
  await expect(page).toHaveURL(/\/tasks\/SAA-3$/)
  const main = page.getByRole("complementary", { name: "Task detail" })
  await expect(main.getByRole("heading", { name: "Rate limit the public API" })).toBeVisible()
  await expect(main).toContainText("Done when")
  await expect(main).toContainText("Each key gets 429 after 60 calls a minute.")
  await expect(main).toContainText("See docs/limits.md")
  await expect(main).toContainText("You created it")
  await expect(main.locator("dl")).toContainText("High")
  await page.getByRole("button", { name: "Home" }).click()
  await expect(page).toHaveURL(/\/home\?task=SAA-3$/)
})

test("another tab's change shows up without a reload", async () => {
  await page.goto("/home")
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible()
  await page.waitForTimeout(1000) // let the channel join
  agent(`agent_next_task('${key}', 'SAA-1')`)
  agent(`agent_submit('${key}', 'SAA-1', 1, 'Fixed it.', '[{"name":"spellcheck","result":"pass"}]')`)
  await expect(page.getByRole("region", { name: /Needs you/ })).toContainText("SAA-1", { timeout: 10_000 })
})

test("offline says so, keeps what you had, and blocks decisions until it's back", async () => {
  await page.goto("/home?task=SAA-1")
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled()
  await context.setOffline(true)
  await expect(page.getByText(/Can't reach Saathi\. Showing what you had at/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled()
  await context.setOffline(false)
  await expect(page.getByText(/Can't reach Saathi/)).toBeHidden()
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled()
})

test("Stop agent hands a working task back after the undo window", async () => {
  sql(`update app.tasks t set status = 'ready', holder_agent_id = null, lease_until = null from app.members m
        join auth.users u on u.id = m.user_id where m.workspace_id = t.workspace_id and u.email = '${email}' and t.number = 1`)
  agent(`agent_next_task('${key}', 'SAA-1')`)
  agent(`agent_heartbeat('${key}', 'SAA-1', 2, '["Read","Fix"]', 1)`)
  await page.goto("/home?task=SAA-1")
  await page.getByRole("button", { name: "Stop agent" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Stopped SAA-1." })).toBeVisible()
  await expect.poll(() => status(1), { timeout: 10_000 }).toBe("ready")
})

test("catch-up says what happened since your last visit, and Catch up clears it", async () => {
  sql(`update app.members m set last_visit_at = now() - interval '2 hours' from auth.users u where u.id = m.user_id and u.email = '${email}';
       update app.tasks t set status = 'done', done_at = now() from app.members m join auth.users u on u.id = m.user_id
        where m.workspace_id = t.workspace_id and u.email = '${email}' and t.number = 1`)
  await page.goto("/home")
  const since = page.getByText(/^Since .+: 1 done, 0 unlocked\.$/)
  await expect(since).toBeVisible()
  await page.getByRole("button", { name: "Catch up" }).click()
  await expect(since).toBeHidden()
  await expect.poll(() => sql(`select m.last_visit_at > now() - interval '1 minute' from app.members m join auth.users u on u.id = m.user_id
                               where u.email = '${email}'`)).toBe("t")
})

// Screenshots for the side-by-side check against plan/task-v1. They are not assertions.
test("design shots", async () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 800 }]) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
      await page.setViewportSize(size)
      await page.goto("/tasks/SAA-3")
      await page.screenshot({ path: `test-results/design/task-full-${scheme}-${size.width}.png` })
      await press("c", () => expect(page.getByRole("dialog", { name: "New task" })).toBeVisible({ timeout: 500 }))
      await page.screenshot({ path: `test-results/design/task-new-${scheme}-${size.width}.png` })
    }
  }
})
