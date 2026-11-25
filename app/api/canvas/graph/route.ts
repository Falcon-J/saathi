import { getTaskGraph } from "@/app/actions/task-dependencies"

export const dynamic = "force-dynamic"

/** GET twin of the getTaskGraph action. Server actions run one at a time on the client; GET reads run in parallel. */
export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")
  if (!workspaceId) return Response.json({ error: "Workspace required", code: "validation" }, { status: 400 })
  return Response.json(await getTaskGraph(workspaceId), { headers: { "Cache-Control": "private, no-store" } })
}
