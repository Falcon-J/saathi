import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAuthCallbackUrl, getCanonicalAuthEntryUrl, getSupabaseConfig } from './config.ts'

test('missing auth configuration is rejected at use, not module import', () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    assert.throws(getSupabaseConfig, /not configured/)
  } finally {
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', saved.url], ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', saved.key], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', saved.anon]]) {
      if (value === undefined) delete process.env[name!]
      else process.env[name!] = value
    }
  }
})

test('auth entry uses the configured origin before creating PKCE state, never moves callbacks', () => {
  const saved = process.env.NEXT_PUBLIC_APP_URL
  try {
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview.example'
    const redirect = getCanonicalAuthEntryUrl('https://build.example/login?redirect=%2Finvite%2Fowned&reset=success')
    assert.equal(redirect?.origin, 'https://preview.example')
    assert.equal(redirect?.pathname, '/login')
    assert.equal(redirect?.searchParams.get('redirect'), '/invite/owned')
    assert.equal(redirect?.searchParams.get('reset'), 'success')
    assert.equal(getCanonicalAuthEntryUrl('https://preview.example/register'), null)
    for (const path of ['/auth/callback?code=private', '/api/users', '/dashboard', '/reset-password']) {
      assert.equal(getCanonicalAuthEntryUrl('https://build.example' + path), null)
    }
    assert.equal(getCanonicalAuthEntryUrl('https://build.example/login?code=private&access_token=private')?.search, '')
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = saved
  }
})

test('email callback uses configured origin and requires secure production transport', () => {
  const saved = process.env.NEXT_PUBLIC_APP_URL
  try {
    delete process.env.NEXT_PUBLIC_APP_URL
    assert.throws(() => getAuthCallbackUrl(), /not configured/)
    process.env.NEXT_PUBLIC_APP_URL = 'http://saathi.example'
    assert.throws(() => getAuthCallbackUrl(), /HTTPS/)
    process.env.NEXT_PUBLIC_APP_URL = 'https://saathi.example/subpath'
    const callback = new URL(getAuthCallbackUrl('/reset-password'))
    assert.equal(callback.origin, 'https://saathi.example')
    assert.equal(callback.pathname, '/auth/callback')
    assert.equal(callback.searchParams.get('next'), '/reset-password')
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    assert.equal(new URL(getAuthCallbackUrl()).origin, 'http://localhost:3000')
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = saved
  }
})

test('auth entry compares the browser host when Next normalizes loopback URLs', () => {
  const saved = process.env.NEXT_PUBLIC_APP_URL
  try {
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3111'
    assert.equal(getCanonicalAuthEntryUrl('http://localhost:3111/login', '127.0.0.1:3111'), null)
    assert.equal(getCanonicalAuthEntryUrl('http://localhost:3111/login', 'localhost:3111')?.origin, 'http://127.0.0.1:3111')
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview.example'
    assert.equal(getCanonicalAuthEntryUrl('https://internal.example/login', 'preview.example'), null)
    assert.equal(getCanonicalAuthEntryUrl('https://preview.example/login', 'build.example')?.origin, 'https://preview.example')
    assert.equal(getCanonicalAuthEntryUrl('http://preview.example/login', 'preview.example')?.protocol, 'https:')
    assert.equal(getCanonicalAuthEntryUrl('https://internal.example/login', 'evil.example')?.origin, 'https://preview.example')
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = saved
  }
})
