const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8")

test("landing page stays a focused Saathi entry screen", () => {
  assert.match(source, /Turn shared intent into <span className="text-primary">clear progress\.<\/span>/)
  assert.match(source, /Create your workspace/)
  assert.match(source, /href="\/login"/)
  assert.match(source, /href="\/register"/)
  assert.match(source, /href="\/guide"/)
  assert.match(source, /See how it works/)
  assert.match(source, /saathi-landing-hero\.png/)
  assert.match(source, /absolute left-4 top-5 z-10/)
  assert.doesNotMatch(source, /Pricing/)
  assert.doesNotMatch(source, /<header|Product|Features|Everything in one place|Focused work\. Shared progress\.|A calmer way to move together|Saathi gives your team one focused workspace/)
})
