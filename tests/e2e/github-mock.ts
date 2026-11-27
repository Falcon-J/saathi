// A stand-in for github.com that Supabase Auth talks to in local runs and CI.
// Start it with `node tests/e2e/github-mock.ts`; it listens on GITHUB_MOCK_PORT (default 54399).
import { createServer } from "node:http"

const user = { id: 4242, login: "falcon-j", name: "Falcon J", email: "falcon@example.com", avatar_url: "https://avatars.githubusercontent.com/u/4242" }

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://mock")
  const path = url.pathname.replace(/^\/api\/v3/, "")
  const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }
  if (path === "/login/oauth/authorize") {
    const back = (q: string) => `${url.searchParams.get("redirect_uri")}?${q}&state=${encodeURIComponent(url.searchParams.get("state") ?? "")}`
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<title>Authorize Saathi</title><a href="${back("code=mock-code")}">Authorize</a> <a href="${back("error=access_denied")}">Cancel</a>`)
  } else if (path === "/login/oauth/access_token") {
    json({ access_token: "mock-token", token_type: "bearer", scope: "user:email" })
  } else if (path === "/user") {
    json(user)
  } else if (path === "/user/emails") {
    json([{ email: user.email, primary: true, verified: true }])
  } else {
    res.writeHead(404).end()
  }
}).listen(Number(process.env.GITHUB_MOCK_PORT ?? 54399), "0.0.0.0")
