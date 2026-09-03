const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const logoSource = readFileSync(path.join(__dirname, "saathi-logo.tsx"), "utf8")

test("Saathi logo uses the approved supplied raster mark", () => {
  assert.match(logoSource, /SaathiLogoMark/)
  assert.match(logoSource, /priority=\{priority\}/)
  assert.match(readFileSync(path.join(__dirname, "saathi-logo-mark.tsx"), "utf8"), /saathi-logo-mark\.png/)
})
