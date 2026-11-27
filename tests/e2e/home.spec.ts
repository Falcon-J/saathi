// Home and the task pane, driven by a real agent key through the same SQL functions /mcp calls.
import { expect, test, type Page } from "@playwright/test"
import { signInLink, sql } from "./helpers"

const email = `home-${Date.now()}@example.com`
const key = "sk_live_" + Array.from({ length: 32 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGH23456789"[Math.floor(Math.random() * 40)]).join("")
const agent = (call: string) => sql(`select public.${call}`)
const status = (n: number) => sql(`select t.status from app.tasks t join app.members m on m.workspace_id = t.workspace_id
                                   join auth.users u on u.id = m.user_id where u.email = '${email}' and t.number = ${n}`)
let page: Page

test.describe.configure({ mode: "serial" })

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await page.goto("/signup")
  const sent = Date.now()
  await page.getByLabel("Work email").fill(email)
  await page.getByRole("button", { name: "Email me a link" }).click()
  await page.goto(await signInLink(email, sent))
  await expect(page).toHaveURL(/\/home/)
  // Give the demo agent a key, then let it hand back proof on SAA-1.
  sql(`insert into app.agent_keys (agent_id, hash, last4)
       select a.id, app.key_hash('${key}'), right('${key}', 4) from app.agents a
         join app.members m on m.workspace_id = a.workspace_id join auth.users u on u.id = m.user_id
        where u.email = '${email}' and a.name = 'demo-agent'`)
  agent(`agent_next_task('${key}')`)
  agent(`agent_heartbeat('${key}', 'SAA-1', 1, '["Find typos","Fix them"]', 1)`)
  agent(`agent_submit('${key}', 'SAA-1', 1, 'Fixed two typos in README.', '[{"name":"spellcheck","result":"pass"}]', '{"files":1,"added":2,"removed":2}')`)
})
test.afterAll(() => page.close())

test("Home puts what needs you first and opens its proof beside the list", async () => {
  await page.goto("/home")
  await expect(page.getByRole("link", { name: /Home/ })).toContainText("1")
  const needsYou = page.getByRole("region", { name: /Needs you/ })
  await expect(needsYou.getByRole("button", { name: "SAA-1, Fix the typo in README, needs you" })).toHaveAttribute("aria-current", "true")
  await expect(page.getByRole("region", { name: /Waiting/ })).toContainText("Waits on SAA-1")
  const pane = page.getByRole("complementary", { name: "Task detail" })
  await expect(pane).toContainText("Fixed two typos in README.")
  await expect(pane).toContainText("Checks passed1 of 1")
  await expect(pane).toContainText("Approve to unlock")

  await expect(async () => { await page.keyboard.press("j"); await expect(page).toHaveURL(/task=SAA-2/, { timeout: 500 }) }).toPass()
  await expect(pane).toContainText("Starts when this is approved")
  await page.keyboard.press("k")
  await expect(page).toHaveURL(/task=SAA-1/)
})

test("Approve waits 5 s so Undo can cancel it, then unlocks what waited", async () => {
  await page.keyboard.press("a")
  const toast = page.getByRole("status").filter({ hasText: "Approved SAA-1. SAA-2 unlocked." })
  await expect(toast).toBeVisible()
  await toast.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByRole("region", { name: /Needs you/ })).toContainText("SAA-1")
  await page.waitForTimeout(5500)
  expect(status(1)).toBe("review")

  await page.getByRole("button", { name: "Approve" }).click()
  await expect.poll(() => status(1), { timeout: 10_000 }).toBe("done")
  expect(status(2)).toBe("ready")
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible()
  await expect(page.getByRole("region", { name: /Done today/ })).toContainText("SAA-1")
})

test("Send back asks what should change, and the agent gets the note", async () => {
  agent(`agent_next_task('${key}', 'SAA-2')`)
  agent(`agent_submit('${key}', 'SAA-2', 1, 'Added an entry.', '[{"name":"lint","result":"pass"}]')`)
  await page.goto("/home?task=SAA-2")
  const note = page.getByLabel("What should change?")
  // Keys work once the page has hydrated, so retry the press until the note opens.
  await expect(async () => { if (!(await note.isVisible())) await page.keyboard.press("s"); await expect(note).toBeFocused({ timeout: 500 }) }).toPass()
  await page.getByRole("button", { name: "Send to agent" }).click()
  await expect(note).toBeFocused()
  await note.fill("Mention the README fix by name.")
  await page.getByRole("button", { name: "Send to agent" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Sent back SAA-2." })).toBeVisible()
  await expect.poll(() => status(2), { timeout: 10_000 }).toBe("ready")
  expect(agent(`agent_next_task('${key}', 'SAA-2') -> 'task' -> 'feedback' -> 0 ->> 'note'`)).toBe("Mention the README fix by name.")
})

test("A question shows its choices, and picking one answers it", async () => {
  agent(`agent_ask('${key}', 'SAA-2', 2, 'Which section?', '["Fixed","Changed"]')`)
  await page.goto("/home")
  const pane = page.getByRole("complementary", { name: "Task detail" })
  await expect(pane).toContainText("Which section?")
  await pane.getByRole("button", { name: "Fixed" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Answered SAA-2." })).toBeVisible()
  await expect.poll(() => status(2), { timeout: 10_000 }).toBe("working")
  expect(agent(`agent_heartbeat('${key}', 'SAA-2', 2) -> 'answer' ->> 'text'`)).toBe("Fixed")
})

// Screenshots for the side-by-side check against plan/home-v1. They are not assertions.
test("design shots", async () => {
  agent(`agent_heartbeat('${key}', 'SAA-2', 2, '["Read CHANGELOG","Add entry","Check links"]', 2, 'Checking links')`)
  for (const scheme of ["light", "dark"] as const) {
    for (const size of [{ width: 1440, height: 900 }, { width: 360, height: 800 }]) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
      await page.setViewportSize(size)
      await page.goto("/home?task=SAA-2")
      await page.screenshot({ path: `test-results/design/home-${scheme}-${size.width}.png` })
    }
  }
})
