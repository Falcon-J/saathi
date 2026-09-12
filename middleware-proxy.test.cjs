const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

test("Next.js authentication boundary uses the proxy convention", () => {
  assert.equal(fs.existsSync("proxy.ts"), true)
  assert.equal(fs.existsSync("middleware.ts"), false)
  assert.match(fs.readFileSync("proxy.ts", "utf8"), /export async function proxy/)
})
