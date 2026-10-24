import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test("sign-in controls work with keyboard and password reveal", async ({ page }) => {
  await page.goto("/login")

  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Saathi home" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Back" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("Email")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused()

  const password = page.getByPlaceholder("Enter your password")
  await password.fill("example-password")
  await page.getByRole("button", { name: "Show password" }).click()
  await expect(password).toHaveAttribute("type", "text")
  await page.getByRole("button", { name: "Hide password" }).click()
  await expect(password).toHaveAttribute("type", "password")
})

test("sign-in page has no horizontal overflow", async ({ page }) => {
  await page.goto("/login")
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
})

test("protected dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/)
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
})

test("sign-in page has no serious or critical accessibility violations", async ({ page }) => {
  await page.goto("/login")
  const results = await new AxeBuilder({ page }).analyze()
  const violations = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
  expect(violations, JSON.stringify(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ html, failureSummary }) => ({ html, failureSummary })) })), null, 2)).toEqual([])
})

for (const route of ["/register", "/forgot-password", "/reset-password"]) {
  test(`${route} renders without overflow or serious accessibility violations`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
    const results = await new AxeBuilder({ page }).analyze()
    const violations = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
    expect(violations, JSON.stringify(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ html, failureSummary }) => ({ html, failureSummary })) })), null, 2)).toEqual([])
  })
}
