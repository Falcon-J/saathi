import { serverClient } from "@/lib/supabase"

export const metadata = { title: "Home" }

type Me = { name: string; workspaces: { id: string; name: string }[] }

// A stand-in until Home lands: proves the session and the first-run workspace.
export default async function Page() {
  const supabase = await serverClient()
  const { data } = await supabase.rpc("whoami")
  const me = data as Me | null
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="font-pixel text-3xl">{me?.workspaces[0]?.name ?? "Your workspace"}</h1>
      <p className="text-muted">Signed in as {me?.name}. A demo agent and two tasks are waiting for you.</p>
      <form action="/auth/signout" method="post">
        <button className="h-9 rounded-lg px-3.5 font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-2">Sign out</button>
      </form>
    </main>
  )
}
