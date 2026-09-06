import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig } from './config'

export async function createClient({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { url, key } = getSupabaseConfig()
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        // Server Components cannot write cookies. Proxy refreshes them before rendering.
        if (readOnly) return
        values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })
}
