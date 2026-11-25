const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const root = path.join(__dirname, "..", "..")
const read = file => readFileSync(path.join(root, file), "utf8")

test("buttons have no glow and meet the size rules", () => {
  const button = read("components/ui/button.tsx")
  assert.doesNotMatch(button, /rgb\(78_222_163|shadow-\[0_0_/)
  assert.match(button, /default: 'h-10 /)
  assert.match(button, /lg: 'h-11 /)
  assert.match(button, /pointer-coarse:min-h-11/)
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/)
})

test("pixel display type and mono labels are wired up", () => {
  assert.match(read("app/layout.tsx"), /GeistPixelSquare\.variable/)
  const css = read("app/globals.css")
  assert.match(css, /\.saathi-display, h1 \{\s*font-family: var\(--font-geist-pixel-square\)/)
  assert.match(css, /\.saathi-label \{\s*font-family: var\(--font-mono\)/)
})

test("every task state has a mark and a word, not only a colour", () => {
  const chip = read("components/ui/status-chip.tsx")
  for (const state of ["waiting", "ready", "in_progress", "awaiting_review", "done", "failed"]) assert.match(chip, new RegExp(`${state}: \\{ label: '[^']+', className: '[^']+', mark: '[^']+' \\}`))
})

test("the component page shows the whole suite", () => {
  const page = read("app/design/design-suite.tsx")
  for (const section of ["type", "color", "buttons", "inputs", "status", "cards", "feedback", "empty", "keys"]) assert.match(page, new RegExp(`id="${section}"`))
  assert.match(page, /TASK_STATES\.map/)
})

test("inputs use visible borders in both themes", () => {
  for (const file of ["components/ui/input.tsx", "components/ui/textarea.tsx"]) {
    const source = read(file)
    assert.doesNotMatch(source, /border-input|dark:bg-input/)
    assert.match(source, /border-border/)
  }
})
