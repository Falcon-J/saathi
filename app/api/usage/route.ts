import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-simple"
import { authorizeWorkspaceMember } from "@/lib/workspace-policy"
import { redis } from "@/lib/redis"
import { getWorkspaceUsage } from "@/lib/usage"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspaceId = new URL(request.url).searchParams.get("workspaceId")
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace ID required" }, { status: 400 })
  }

  const authorization = authorizeWorkspaceMember(
    await redis.get(`workspace:${workspaceId}`),
    session.email,
  )
  if (!authorization.allowed) {
    return NextResponse.json({ error: authorization.message }, { status: authorization.status })
  }

  return NextResponse.json({ workspaceId, usage: await getWorkspaceUsage(workspaceId) })
}
