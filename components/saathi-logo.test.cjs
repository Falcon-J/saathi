const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const logoSource = readFileSync(path.join(__dirname, "saathi-logo.tsx"), "utf8")
const markSource = readFileSync(path.join(__dirname, "saathi-logo-mark.tsx"), "utf8")

test("Saathi logo draws the Pair mark from theme tokens", () => {
  assert.match(logoSource, /SaathiLogoMark/)
  assert.match(logoSource, /aria-label="Saathi logo"/)
  assert.match(markSource, /fill="var\(--foreground\)"/)
  assert.match(markSource, /fill="var\(--primary\)"/)
  assert.doesNotMatch(markSource, /#[0-9a-f]{6}/i, "mark colours must come from tokens")
})
