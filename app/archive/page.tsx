import { redirect } from "next/navigation"
import { AppPage } from "@/components/app-page"
import { getSession } from "@/lib/auth-simple"
import { ArchiveHistory } from "@/components/archive-history"

export const dynamic = "force-dynamic"

export default async function ArchivePage() {
  if (!await getSession()) redirect("/login")
  return <AppPage eyebrow="Archive" title="Archived workspaces" description="Archived work is read-only. Review its tasks, comments and history here.">
    <ArchiveHistory />
  </AppPage>
}
