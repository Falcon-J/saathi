const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, dependencies) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', source)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports)
  return exports
}
const navigation = load('lib/dashboard-navigation.ts', {})
const jsx = (type, props) => ({ type, props })
let selected
const component = load('components/dashboard-navigation.tsx', {
  react: { useEffect() {}, useState: initial => { selected ??= initial; return [selected, value => { selected = value }] } },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'lucide-react': Object.fromEntries(['History', 'Home', 'LayoutGrid', 'Settings', 'Users'].map(name => [name, name])),
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  '@/lib/dashboard-navigation': navigation,
})
function buttons(node) {
  if (!node || typeof node !== 'object') return []
  if (typeof node.type === 'function') return buttons(node.type(node.props))
  return [...(node.type === 'button' ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(buttons)]
}

test('primary navigation changes immediately with the rendered view and never selects a secondary page', () => {
  const render = activeView => buttons(component.DashboardNavigation({ mode: 'rail', hasWorkspace: true, activeView }))
  assert.equal(render('overview').find(button => button.props['aria-current']).props['aria-label'], 'Overview')
  assert.equal(render('board').find(button => button.props['aria-current']).props['aria-label'], 'Board')
  assert.equal(render('team').find(button => button.props['aria-current']).props['aria-label'], 'Team')
  assert.equal(render('activity').filter(button => button.props['aria-current']).length, 0)
  assert.equal(render('settings').filter(button => button.props['aria-current']).length, 0)
  assert.deepEqual(render('overview').map(button => button.props['aria-label']), ['Overview', 'Board', 'Team'])
})

test('empty or unknown dashboard hashes land on Overview while deep links retain their destination', () => {
  assert.equal(navigation.workspaceViewFromHash(''), 'overview')
  assert.equal(navigation.workspaceViewFromHash('#unknown'), 'overview')
  assert.equal(navigation.workspaceViewFromHash('#project-board'), 'board')
  assert.equal(navigation.workspaceViewFromHash('#activity-history'), 'activity')
  assert.equal(navigation.workspaceViewFromHash('#settings-panel'), 'settings')
})

test('task read errors do not replace and unmount quick add owners', () => {
  const fs = require('node:fs'), ts = require('typescript')
  const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/dashboard/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let owners = 0
  function walk(node, ancestors = []) {
    if (ts.isJsxSelfClosingElement(node) && ['WorkspaceOverview', 'TaskList'].includes(node.tagName.getText(source))) {
      owners++
      for (const parent of ancestors) {
        if (ts.isConditionalExpression(parent)) assert.doesNotMatch(parent.condition.getText(source), /taskError/)
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) assert.doesNotMatch(parent.left.getText(source), /taskError/)
      }
      assert.ok(node.attributes.properties.some(attribute => attribute.name?.getText(source) === 'key'), 'Draft owner must be scoped to the workspace')
    }
    ts.forEachChild(node, child => walk(child, [...ancestors, node]))
  }
  walk(source)
  assert.equal(owners, 2)
})
