import { execFileSync } from "node:child_process"
import { expect } from "@playwright/test"

const local = process.env.SUPABASE_DB_URL && process.env.MAILPIT_URL
  ? {}
  : JSON.parse(execFileSync("npx", ["-y", "supabase", "status", "-o", "json"], { encoding: "utf8" }))
const dbUrl: string = process.env.SUPABASE_DB_URL ?? local.DB_URL
const mailpit: string = process.env.MAILPIT_URL ?? local.MAILPIT_URL

export const sql = (q: string) => execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", q], { encoding: "utf8" }).trim()

// The newest sign-in link Mailpit holds for this address, waiting for it to arrive.
export async function signInLink(email: string, after: number) {
  let link = ""
  await expect(async () => {
    const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()
    const latest = list.messages.find((m: { Created: string }) => Date.parse(m.Created) >= after - 1000)
    expect(latest).toBeTruthy()
    const message = await (await fetch(`${mailpit}/api/v1/message/${latest.ID}`)).json()
    link = message.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)[1].replaceAll("&amp;", "&")
  }).toPass({ timeout: 15_000 })
  return link
}
