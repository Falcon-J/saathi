const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const globalsCss = readFileSync(path.join(__dirname, "..", "globals.css"), "utf8")
const taskFilterSource = readFileSync(path.join(__dirname, "..", "..", "components", "task-filter.tsx"), "utf8")

test("dashboard exposes semantic Saathi design tokens", () => {
  const expectedTokens = {
    "--saathi-surface-page": "#f5f5f7",
    "--saathi-surface-default": "#ffffff",
    "--saathi-surface-navigation": "#ffffff",
    "--saathi-border-subtle": "#e5e5ea",
    "--saathi-border-default": "#d2d2d7",
    "--saathi-brand": "#007aff",
    "--saathi-info": "#007aff",
    "--saathi-success": "#34c759",
    "--saathi-warning": "#ff9f0a",
    "--saathi-danger": "#ff3b30",
    "--saathi-radius-label": "0.25rem",
    "--saathi-radius-control": "0.375rem",
    "--saathi-radius-card": "0.5rem",
    "--saathi-radius-container": "0.75rem",
    "--saathi-type-page-title": "1.5rem",
    "--saathi-type-label": "0.75rem",
  }

  for (const [token, value] of Object.entries(expectedTokens)) {
    const escapedValue = value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")
    assert.match(globalsCss, new RegExp(`${token}:\\s*${escapedValue}`))
  }
})

test("shared Saathi tokens provide the approved light system", () => {
  const rootBlock = globalsCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]

  assert.ok(rootBlock, "expected a :root token block")

  const expectedTokens = {
    "--background": "#f5f5f7",
    "--foreground": "#1d1d1f",
    "--primary": "#007aff",
    "--saathi-success": "#34c759",
    "--saathi-danger": "#ff3b30",
  }

  for (const [token, value] of Object.entries(expectedTokens)) {
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(rootBlock, new RegExp(`${token}:\\s*${escapedValue}`))
  }
})

test("task filters consume semantic light-theme tokens", () => {
  assert.match(taskFilterSource, /border-border/)
  assert.match(taskFilterSource, /bg-card/)
  assert.match(taskFilterSource, /bg-secondary/)
  assert.doesNotMatch(taskFilterSource, /border-white\/10|bg-input\/70/)
})
