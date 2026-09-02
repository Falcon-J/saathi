const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const logoSource = readFileSync(path.join(__dirname, "saathi-logo.tsx"), "utf8")

test("Saathi logo uses the bespoke inline mark instead of a raster image", () => {
  assert.match(logoSource, /SaathiLogoMark/)
  assert.doesNotMatch(logoSource, /next\/image/)
  assert.doesNotMatch(logoSource, /saathi-logo-mark\.png/)
})
