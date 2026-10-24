import { getSession } from "@/lib/auth-simple"
import { getWorkspaceUsage } from "@/lib/usage"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
    const id = new URL(request.url).searchParams.get("workspaceId")
    if (!id) return Response.json({ error: "Workspace required" }, { status: 400 })
    const usage = await getWorkspaceUsage(id, session.id)
    if (!usage) return Response.json({ error: "Forbidden" }, { status: 403 })
    return Response.json({ workspaceId: id, usage }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "Service unavailable" }, { status: 503 })
  }
}
