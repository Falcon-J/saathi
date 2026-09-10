import { redirect } from "next/navigation"
import Image from "next/image"
import { getSession } from "@/lib/auth-simple"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession().catch(() => undefined)
  if (session === undefined) return <main className="saathi-dashboard grid min-h-screen place-items-center px-4 py-10"><section className="w-full max-w-xl rounded-[var(--saathi-radius-container)] border border-border bg-card p-8 text-center shadow-[0_24px_80px_rgb(44_50_89/0.1)] sm:p-12"><Image src="/saathi-unavailable-illustration.png" alt="Workspace unavailable" width={176} height={176} className="mx-auto h-44 w-44 object-contain" /><h1 className="mt-5 text-3xl font-semibold tracking-tight">Workspace unavailable</h1><p className="sr-only">Workspace temporarily unavailable</p><p className="mt-3 text-sm leading-6 text-muted-foreground">We could not verify your account right now. Your data is safe and no changes were made.</p><a className="mt-7 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground" href="/dashboard">Try again</a></section></main>

  if (!session) {
    redirect("/login")
  }

  return <>{children}</>
}
