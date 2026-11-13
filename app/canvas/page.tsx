import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-simple"
import { CanvasShell } from "@/components/canvas/canvas-shell"
import { canvasUrl, parseCanvasUrl } from "@/features/canvas/navigation-url"

export const dynamic = "force-dynamic"

export default async function CanvasPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const params = await searchParams ?? {}
  const query = new URLSearchParams()
  for (const key of ["resource", "workspace", "task", "view", "group"]) {
    const value = params[key]
    for (const item of value === undefined ? [] : Array.isArray(value) ? value.slice(0, 2) : [value]) query.append(key, item)
  }
  const requested = parseCanvasUrl("/canvas?" + query.toString())
  const destination = requested ? canvasUrl(requested) : "/canvas"
  const session = await getSession().catch(() => undefined)
  if (session === undefined) return <main className="grid min-h-screen place-items-center bg-background p-6"><section role="alert" className="max-w-md space-y-4"><h1 className="text-xl font-semibold">Account unavailable</h1><p>We could not verify your account. Try again.</p><a href={destination} className="underline">Retry</a></section></main>
  if (!session) redirect("/login?redirect=" + encodeURIComponent(destination))
  return <CanvasShell email={session.email} actorId={session.id} />
}
