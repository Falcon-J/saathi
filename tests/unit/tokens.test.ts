import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("../../app/tokens.css", import.meta.url), "utf8")
const root = css.slice(css.indexOf(":root"), css.indexOf("@theme"))
const defined = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]))

test("every Tailwind colour points at a defined token", () => {
  const bridge = css.slice(css.indexOf("@theme"))
  const used = [...bridge.matchAll(/--color-[\w-]+:\s*var\((--[\w-]+)\)/g)].map(m => m[1])
  assert.ok(used.length > 20)
  for (const name of used) assert.ok(defined.has(name), `${name} is not defined in :root`)
})

test("the meaning colours match the page sheets", () => {
  assert.match(root, /--primary: light-dark\(#5b5bd6, #6e6ade\)/)
  assert.match(root, /--success: #29a383/)
  assert.match(root, /--text-faint: light-dark\(#707070, #9f9f9f\)/)
})
