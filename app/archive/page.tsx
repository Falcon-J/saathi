import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/auth-simple"
import { ArchiveHistory } from "@/components/archive-history"

export const dynamic = "force-dynamic"

export default async function ArchivePage() {
  if (!await getSession()) redirect("/login")
  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/dashboard#workspace-header" className="text-sm text-primary underline underline-offset-4">Back to workspace</Link>
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Archived workspaces</h1>
      <p className="text-sm text-muted-foreground">Review retained tasks, comments, and activity. Archived work is read-only.</p>
    </header>
    <ArchiveHistory />
  </main>
}
