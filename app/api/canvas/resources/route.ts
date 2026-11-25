import { getCanvasResources } from "@/features/access/actions"

export const dynamic = "force-dynamic"

/** GET twin of the getCanvasResources action, so it loads alongside the workspace list instead of after it. */
export async function GET() {
  return Response.json(await getCanvasResources(), { headers: { "Cache-Control": "private, no-store" } })
}
