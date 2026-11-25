import { redirect } from "next/navigation"
import { canvasUrl } from "@/features/canvas/navigation-url"

export const dynamic = "force-dynamic"

/** The legacy dashboard is retired: the canvas is Saathi's only home. Old links keep working. */
export default async function DashboardRedirect({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {}
  const workspace = typeof params.workspace === "string" && params.workspace ? params.workspace : undefined
  redirect(workspace ? canvasUrl({ focus: { kind: "workspace", workspaceId: workspace }, view: null, group: null }) : "/canvas")
}
