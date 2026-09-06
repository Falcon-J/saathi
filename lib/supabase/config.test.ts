import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAuthCallbackUrl, getSupabaseConfig } from './config.ts'

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
