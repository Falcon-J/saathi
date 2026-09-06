import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-simple"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession().catch(() => undefined)
  if (session === undefined) return <main className='p-8'><h1>Workspace temporarily unavailable</h1><p>Please try again shortly.</p><a href='/dashboard'>Retry</a></main>

  if (!session) {
    redirect("/login")
  }

  return <>{children}</>
}
