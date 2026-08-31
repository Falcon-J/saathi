import { realtimeService } from "@/lib/realtime"
import { isLoadTestSecretValid } from "@/lib/load-test"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 })
  }

  if (!isLoadTestSecretValid(
    request.headers.get("x-load-test-secret"),
    process.env.LOAD_TEST_SECRET,
  )) {
    return new Response("Forbidden", { status: 403 })
  }

  let body: { workspaceId?: unknown; eventId?: unknown }
  try {
    body = await request.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  if (typeof body.workspaceId !== "string" || body.workspaceId.length === 0
    || typeof body.eventId !== "string" || body.eventId.length === 0) {
    return new Response("workspaceId and eventId are required", { status: 400 })
  }

  await realtimeService.publishEvent({
    type: "task-created",
    workspaceId: body.workspaceId,
    userId: "load-test",
    timestamp: Date.now(),
    data: { loadTestId: body.eventId },
  })

  return Response.json({ accepted: true, eventId: body.eventId })
}
