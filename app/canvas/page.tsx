import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-simple"
import { CanvasShell } from "@/components/canvas/canvas-shell"

export const dynamic = "force-dynamic"

export default async function CanvasPage() {
  const session = await getSession().catch(() => undefined)
  if (session === undefined) return <main className="grid min-h-screen place-items-center bg-background p-6"><section role="alert" className="max-w-md space-y-4"><h1 className="text-xl font-semibold">Account unavailable</h1><p>We could not verify your account. Try again.</p><a href="/canvas" className="underline">Retry</a></section></main>
  if (!session) redirect("/login?redirect=/canvas")
  return <CanvasShell email={session.email} actorId={session.id} />
}
