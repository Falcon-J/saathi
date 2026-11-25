const { existsSync, readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8")
const layoutSource = readFileSync(path.join(__dirname, "layout.tsx"), "utf8")

test("dashboard keeps realtime recovery next to the board", () => {
  assert.match(source, /role="status"/)
  assert.match(source, /Updates are paused\. Reconnect to continue\./)
  assert.match(source, /onClick={realtime\.connect}/)
  assert.doesNotMatch(source, /One persistent stream for this workspace\./)
})

test("dashboard navigation and logout expose explicit loading and failure states", () => {
  assert.match(source, /onOpenBoard/)
  assert.match(source, /const result = await logout\(\)/)
  assert.match(source, /logoutError/)
  assert.match(source, /aria-busy/)
  assert.match(source, /try \{[\s\S]*const result = await logout\(\)[\s\S]*catch \(caughtError\)/)
})

test("dashboard keeps keyboard and browser navigation aligned with the active view", () => {
  assert.match(source, /window\.addEventListener\("keydown", handleKeyboardShortcut\)/)
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /window\.addEventListener\("hashchange", handleHashChange\)/)
  assert.match(source, /aria-label="Keyboard shortcuts"/)
  assert.match(source, /<Dialog open=\{shortcutsOpen\}/)
  assert.match(source, /isMac \? "⌘ K" : "Ctrl K"/)
  assert.doesNotMatch(source, />Open the task board</)
})

test("dashboard shortcuts preserve editing, modal interactions and handled keys", () => {
  const ts = require('typescript')
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleKeyboardShortcut') handler = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(handler)
  const js = ts.transpileModule(`return ${handler.getText(file)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let opens = 0, toggles = 0, modal = false
  class Element {
    constructor(editable) { this.editable = editable }
    closest(selector) { assert.match(selector, /input.*textarea.*contenteditable/); return this.editable ? this : null }
  }
  const handle = new Function('HTMLElement', 'document', 'handleOpenBoard', 'setSidebarOpen', js)(Element, { querySelector: () => modal ? {} : null }, () => { opens++ }, () => { toggles++ })
  const fire = (key, options = {}) => {
    let prevented = false
    handle({ key, ctrlKey: true, target: new Element(false), preventDefault() { prevented = true }, ...options })
    return prevented
  }
  for (const key of ['k', 'b']) {
    assert.equal(fire(key, { target: new Element(true) }), false)
    assert.equal(fire(key, { defaultPrevented: true }), false)
    assert.equal(fire(key, { isComposing: true }), false)
    modal = true; assert.equal(fire(key), false); modal = false
  }
  assert.equal(opens + toggles, 0)
  assert.equal(fire('K'), true)
  assert.equal(fire('b', { ctrlKey: false, metaKey: true }), true)
  assert.equal(opens, 1)
  assert.equal(toggles, 1)
})

test("app and dashboard routes provide intentional loading UI", () => {
  assert.equal(existsSync(path.join(__dirname, "..", "loading.tsx")), true)
  assert.equal(existsSync(path.join(__dirname, "loading.tsx")), true)
})

test("temporary account and workspace failures keep recovery explicit", () => {
  assert.match(layoutSource, /Workspace temporarily unavailable/)
  assert.match(layoutSource, /Your data is safe/)
  assert.match(source, /Your data was not changed/)
  assert.match(source, /Try again/)
})
