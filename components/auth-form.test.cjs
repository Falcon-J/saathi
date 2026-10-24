const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "auth-form.tsx"), "utf8")
const authActions = readFileSync(path.join(__dirname, "../lib/auth-simple.ts"), "utf8")
const ts = require('typescript')

function load(file, dependencies) {
  const exports = {}
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports)
  return exports
}
const boundary = load('lib/supabase/auth-boundary.ts', {})
const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]

test('account switches and confirmation retain only safe return destinations', async () => {
  for (const destination of ['/dashboard?workspace=one', '//evil.test']) {
    let cursor = 0
    const slots = [], effects = []
    const dependencies = {
      react: {
        useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
        useEffect(effect) { effects.push(effect) },
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/image': { default: 'Image' }, 'next/link': { default: 'Link' },
      'next/navigation': { useRouter: () => ({}) }, 'lucide-react': {},
      '@/lib/auth-simple': { signup: async () => ({ success: true, confirmationRequired: true, message: 'Check your email' }) },
      '@/lib/supabase/auth-boundary': boundary,
      '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
      '@/hooks/use-notifications': { useNotifications: () => ({ success() {} }) },
      '@/components/saathi-logo': { SaathiLogo: 'SaathiLogo' },
    }
    const originalWindow = global.window
    global.window = { location: { search: `?redirect=${encodeURIComponent(destination)}` } }
    try {
      const component = load('components/auth-form.tsx', dependencies)
      const render = mode => { cursor = 0; return component.AuthForm({ mode }) }
      render('signup'); effects.splice(0).forEach(effect => effect())
      let tree = render('signup')
      const expected = boundary.safeAuthRedirect(destination)
      const href = route => `${route}?redirect=${encodeURIComponent(expected)}`
      assert.ok(nodes(tree).some(node => node.type === 'Link' && node.props.href === href('/login')))
      for (const node of nodes(tree).filter(node => node.type === 'Input')) node.props.onChange({ target: { value: node.props.type === 'email' ? 'review@example.test' : node.props.type === 'password' ? 'long-password' : 'Review' } })
      tree = render('signup')
      await nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
      tree = render('signup')
      const confirmation = nodes(tree).find(node => node.type === 'Link' && node.props.children === 'Return to sign in')
      assert.equal(confirmation.props.href, href('/login'))
      tree = render('login')
      assert.ok(nodes(tree).some(node => node.type === 'Link' && node.props.href === href('/register')))
    } finally { global.window = originalWindow }
  }
})

test('callback failures preserve safe next without leaking provider errors', async () => {
  for (const outcome of ['missing', 'error', 'throw', 'success']) {
    const callback = load('app/auth/callback/route.ts', {
      'next/server': { NextResponse: { redirect: url => ({ url: url.toString(), headers: new Headers() }) } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { exchangeCodeForSession: async () => { if (outcome === 'throw') throw new Error('private provider detail'); return { error: outcome === 'error' ? { message: 'private provider detail' } : null } } } }) },
      '@/lib/supabase/auth-boundary': boundary,
    })
    for (const next of ['/dashboard?workspace=one', 'https://evil.test']) {
      const url = new URL('https://preview.test/auth/callback')
      url.searchParams.set('next', next)
      if (outcome !== 'missing') url.searchParams.set('code', 'sensitive-code')
      const response = await callback.GET({ url: url.toString(), nextUrl: url })
      const target = new URL(response.url)
      assert.equal(target.origin, 'https://preview.test')
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
      if (outcome === 'success') assert.equal(target.pathname + target.search, boundary.safeAuthRedirect(next))
      else {
        assert.equal(target.pathname, '/auth/error')
        assert.equal(target.searchParams.get('next'), boundary.safeAuthRedirect(next))
        assert.doesNotMatch(response.url, /private|sensitive/)
      }
    }
  }
})

test('generic auth error offers sign in with a sanitized destination and recovery only when requested', async () => {
  const page = load('app/auth/error/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' }, 'next/image': { default: 'Image' },
    '@/components/saathi-logo': { SaathiLogo: 'SaathiLogo' }, '@/lib/supabase/auth-boundary': boundary,
  })
  for (const next of ['/dashboard?workspace=one', '//evil.test', ['/dashboard'], '/reset-password']) {
    const tree = await page.default({ searchParams: Promise.resolve({ next }) })
    const links = nodes(tree).filter(node => node.type === 'Link')
    const expected = boundary.safeAuthRedirect(typeof next === 'string' ? next : null)
    assert.equal(links.find(node => node.props.children === 'Sign in').props.href, `/login?redirect=${encodeURIComponent(expected)}`)
    assert.equal(links.some(node => node.props.href === '/forgot-password'), next === '/reset-password')
    assert.doesNotMatch(JSON.stringify(tree), /Recovery link|Email verified|verification succeeded/)
  }
})

test("signup page keeps account creation copy inside the form", () => {
  assert.match(source, /Create an account/)
  assert.doesNotMatch(source, /Create your workspace|Turn your ideas into progress with your team|GET STARTED/)
})

test("authentication forms render recoverable errors inline", () => {
  assert.match(source, /const \[formError, setFormError\] = useState<string \| null>\(null\)/)
  assert.match(source, /role="alert"/)
  assert.match(source, /Create an account/)
  assert.doesNotMatch(source, /WELCOME BACK|Sign in to your workspace|Clarity today/)
  assert.doesNotMatch(source, /saathi-grid/)
  assert.doesNotMatch(source, /Workspace gateway|SSE task updates/)
})

test("signup preserves a safe return destination through email confirmation", () => {
  assert.match(source, /signup\(email, username, password, redirect\)/)
  assert.match(authActions, /signup\(email: string, username: string, password: string, next\?: string \| null\)/)
  assert.match(authActions, /emailRedirectTo: getAuthCallbackUrl\(safeAuthRedirect\(next\)\)/)
})

test("authentication suite follows the approved reference layout", () => {
  assert.match(source, /src="\/saathi-auth-background-v2\.png"/)
  assert.match(source, /fill/)
  assert.match(source, /flex min-w-0 flex-1 items-center/)
  assert.match(source, /sm:items-start/)
  assert.match(source, /w-\[48%\]/)
  assert.match(source, /sm:w-\[clamp\(14rem,34vw,33\.75rem\)\]/)
  assert.doesNotMatch(source, /sm:h-\[100svh\] sm:overflow-hidden/)
  assert.match(source, /Forgot password\?/)
  assert.match(source, /loginWithGoogle\(next\)/)
  assert.match(source, /Continue with Google/)
  assert.doesNotMatch(source, /GitHub|Github/)
  assert.doesNotMatch(source, /keepSignedIn|Keep me signed in/)
  assert.match(source, /Show password/)
  assert.match(source, /Back/)
})
