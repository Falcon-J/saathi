import { expect, test, type Page } from "@playwright/test"
import { signInLink, sql } from "./helpers"

const workspacesOf = (email: string) =>
  sql(`select count(*) from app.members m join auth.users u on u.id = m.user_id where u.email = '${email}'`)

async function requestLink(page: Page, email: string) {
  const sent = Date.now()
  await page.getByLabel("Work email").fill(email)
  await page.getByRole("button", { name: "Email me a link" }).click()
  await expect(page.getByText("Link sent. Check your inbox.")).toBeVisible()
  return signInLink(email, sent)
}

test("signed-out people are sent to sign up", async ({ page }) => {
  await page.goto("/home")
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByRole("heading", { name: "One click, and you're in." })).toBeVisible()
  await expect(page.getByText("Name and email only. No code access.")).toBeVisible()
})

test("the email link signs you up once, and signs you in after that", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`
  await page.goto("/signup")
  await page.getByLabel("Work email").fill("not-an-email")
  await page.getByRole("button", { name: "Email me a link" }).click()
  await expect(page.getByText("Enter an email like you@company.com.")).toBeVisible()
  await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByLabel("Work email")).toBeFocused()

  await page.goto(await requestLink(page, email))
  await expect(page).toHaveURL(/\/home$/)
  const name = `${email.split("@")[0]}'s workspace`
  await expect(page.getByRole("heading", { name })).toBeVisible()

  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByText("Sign in", { exact: true }).first()).toBeVisible()
  await page.goto(await requestLink(page, email))
  await expect(page.getByRole("heading", { name })).toBeVisible()
  expect(workspacesOf(email)).toBe("1")
  expect(sql(`select string_agg(t.title || ':' || t.status, ', ' order by t.number) from app.tasks t
              join app.members m on m.workspace_id = t.workspace_id join auth.users u on u.id = m.user_id
              where u.email = '${email}'`)).toBe("Fix the typo in README:ready, Add a CHANGELOG entry:waiting")
})

test("the hosted default email link (a code back to /auth/callback) signs you in too", async ({ page }) => {
  // Supabase's built-in mailer sends {{ .ConfirmationURL }}: /auth/v1/verify, which redirects with a PKCE code.
  const email = `e2e-default-${Date.now()}@example.com`
  await page.goto("/signup")
  const tokenHash = new URL(await requestLink(page, email)).searchParams.get("token_hash")!
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321"
  await page.goto(`${api}/auth/v1/verify?token=${tokenHash}&type=signup&redirect_to=${encodeURIComponent("http://localhost:3000/auth/callback")}`)
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole("heading", { name: `${email.split("@")[0]}'s workspace` })).toBeVisible()
})

test("a used email link says so", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=used&type=email")
  await expect(page.getByText("That link expired or was already used. Send a new one.")).toBeVisible()
})

test("GitHub signs you in from a popup", async ({ page }) => {
  await page.goto("/signup")
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Continue with GitHub" }).click()
  const github = await popup
  await expect(page.getByRole("button", { name: "Waiting for GitHub" })).toBeVisible()
  await expect(page.getByText("Finish in the GitHub tab.")).toBeVisible()
  await github.getByRole("link", { name: "Authorize" }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole("heading", { name: "Falcon J's workspace" })).toBeVisible()
  expect(workspacesOf("falcon@example.com")).toBe("1")
})

test("closing the GitHub popup cancels", async ({ page }) => {
  await page.goto("/signup")
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Continue with GitHub" }).click()
  await (await popup).close()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(page.getByText("Cancelled. Nothing was saved.")).toBeVisible()
})

test("saying no on GitHub cancels", async ({ page }) => {
  await page.goto("/signup")
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Continue with GitHub" }).click()
  await (await popup).getByRole("link", { name: "Cancel" }).click()
  await expect(page.getByText("Cancelled. Nothing was saved.")).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)
})
