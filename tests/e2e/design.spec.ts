import { test } from "@playwright/test"

// Screenshots of each signup-v1 state for the side-by-side design check. They are not assertions.
const sizes = [{ width: 1440, height: 900 }, { width: 360, height: 800 }]

for (const scheme of ["light", "dark"] as const) {
  for (const size of sizes) {
    test(`signup states, ${scheme}, ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
      await page.setViewportSize(size)
      const shot = (state: string) => page.screenshot({ path: `test-results/design/signup-${state}-${scheme}-${size.width}.png`, fullPage: true })
      await page.goto("/signup")
      await shot("ready")
      const popup = page.waitForEvent("popup")
      await page.getByRole("button", { name: "Continue with GitHub" }).click()
      await page.bringToFront()
      await shot("waiting")
      await (await popup).close()
      await page.getByRole("button", { name: "Try again" }).waitFor()
      await shot("cancelled")
      await page.getByLabel("Work email").fill(`design-${Date.now()}@example.com`)
      await page.getByRole("button", { name: "Email me a link" }).click()
      await page.getByText("Link sent. Check your inbox.").waitFor()
      await shot("sent")
    })
  }
}
