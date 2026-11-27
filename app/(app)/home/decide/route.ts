// The same decisions as the server action, for the page's last moments: a keepalive POST survives unload.
import { decide, type Decision } from "../../actions"

const kinds = new Set(["approve", "send_back", "answer"])

export async function POST(req: Request) {
  // Cookies ride along with any cross-site POST, so only this site's own pages may call it.
  const origin = req.headers.get("origin")
  if (!origin || origin !== new URL(req.url).origin) return Response.json({ ok: false, code: "forbidden" }, { status: 403 })
  const body = await req.json().catch(() => null) as { ws?: unknown; task?: unknown; d?: Decision } | null
  if (typeof body?.ws !== "string" || typeof body.task !== "string" || !kinds.has(body.d?.kind as string))
    return Response.json({ ok: false, code: "invalid" }, { status: 400 })
  return Response.json(await decide(body.ws, body.task, body.d!))
}
