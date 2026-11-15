const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")

const jsx = (type, props) => ({ type, props })
const moduleExports = {}
const source = ts.transpileModule(fs.readFileSync("components/workspace-create-form.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function("require", "exports", source)(name => ({
  react: { useState: value => [value, () => {}], useRef: value => ({current:value}), useEffect() {}, useLayoutEffect() {} },
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/lib/workspace-create-command": require("../lib/workspace-create-command.ts"),
  "next/link": { default: "Link" },
  "lucide-react": { CircleHelp: "CircleHelp", LoaderCircle: "LoaderCircle" },
  "@/components/ui/button": { Button: "Button" },
  "@/components/ui/input": { Input: "Input" },
  "@/components/ui/textarea": { Textarea: "Textarea" },
})[name], moduleExports)

const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
const render = aiEnabled => nodes(moduleExports.WorkspaceCreateForm({
  actorId: "aaaaaaaa-0000-4000-8000-000000000001",
  account: "owner@example.test",
  aiEnabled,
  canCancel: false,
  onCancel() {},
  async onCreate() {},
  async onSuggest() { return {} },
  async onApprove() {},
}))

test("workspace creation hides unavailable AI promotion and keeps it when enabled", () => {
  const unavailable = JSON.stringify(render(false))
  assert.doesNotMatch(unavailable, /AI Assistant|Help me plan|Launch a new product|AI planning is currently unavailable/)

  const enabled = JSON.stringify(render(true))
  assert.match(enabled, /AI provider/)
  assert.match(enabled, /Help me plan/)
})
