const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const root = path.join(__dirname, "..")
const globalsCss = readFileSync(path.join(__dirname, "globals.css"), "utf8")
const block = selector => {
  const body = globalsCss.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1]
  assert.ok(body, `expected a ${selector} token block`)
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}
const light = block(":root")
const dark = block(".dark")
const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
  .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

test("light theme uses the ink-blue accent on warm neutrals", () => {
  assert.equal(light.primary, "#2952cc")
  assert.equal(light.background, "#faf9f7")
  assert.equal(light.foreground, "#1c1b19")
  assert.equal(light["saathi-brand"], "#2952cc")
})

test("dark theme defines every light token so nothing falls back to light values", () => {
  const themed = Object.keys(light).filter(name => /^#|^0 /.test(light[name]))
  for (const name of themed) assert.ok(name in dark, `--${name} is missing from .dark`)
})

test("no teal remains in the palette", () => {
  assert.doesNotMatch(globalsCss, /#0f766e|#ddf4ee|#237f72/i)
})

for (const [theme, tokens] of [["light", light], ["dark", dark]]) {
  test(`${theme} theme text pairs meet WCAG AA`, () => {
    const pairs = [["foreground", "background"], ["muted-foreground", "background"], ["muted-foreground", "card"], ["primary-foreground", "primary"],
      ["destructive-foreground", "destructive"], ["accent-foreground", "accent"], ["card-foreground", "card"]]
    for (const [text, surface] of pairs) {
      const ratio = contrast(tokens[text], tokens[surface])
      assert.ok(ratio >= 4.5, `${theme} --${text} on --${surface} is ${ratio.toFixed(2)}:1`)
    }
  })
}

test("motion tokens and reduced motion are defined", () => {
  assert.equal(light["saathi-duration-fast"], "120ms")
  assert.equal(light["saathi-ease-out"], "cubic-bezier(0.2, 0.8, 0.2, 1)")
  assert.match(globalsCss, /prefers-reduced-motion: reduce/)
})

test("primary button keeps AA contrast while hovered", () => {
  const button = readFileSync(path.join(root, "components", "ui", "button.tsx"), "utf8")
  const variant = button.match(/default: '([^']+)'/)[1]
  const alpha = Number(variant.match(/hover:bg-primary\/(\d+)/)?.[1] ?? 100) / 100
  const mixed = "#" + light.primary.slice(1).match(/../g).map(v => Math.round(alpha * parseInt(v, 16) + (1 - alpha) * 255).toString(16).padStart(2, "0")).join("")
  assert.ok(contrast(light["primary-foreground"], mixed) >= 4.5)
})

test("auth and toast surfaces use tokens, not raw hex", () => {
  for (const file of ["components/auth-form.tsx", "components/ui/toast.tsx", "components/task-filter.tsx"]) {
    assert.doesNotMatch(readFileSync(path.join(root, file), "utf8"), /\[#[0-9a-f]{3,8}\]/i, file)
  }
})
