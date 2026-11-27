import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// A client that acts as the signed-in person, for server components, actions and route handlers.
export async function serverClient() {
  const store = await cookies()
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components can't set cookies; proxy.ts refreshes the session instead.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {}
      },
    },
  })
}

// Every sign-in path ends here: make sure the person has a workspace.
// If that fails, sign out again so they land on the error and can retry, not on an empty Home.
export async function bootstrap(supabase: Awaited<ReturnType<typeof serverClient>>) {
  const { data, error } = await supabase.rpc("bootstrap_workspace")
  if (!error && data?.ok === true) return true
  await supabase.auth.signOut()
  return false
}
