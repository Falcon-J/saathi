import { getSession } from "@/lib/auth-simple"
import { JoinInvitation } from "@/components/join-invitation"
import { connection } from "next/server"

export const metadata = { title: "Join workspace", referrer: "no-referrer" as const, robots: { index: false, follow: false } }

export default async function JoinPage() {
  await connection()
  const session = await getSession()
  return <main className="saathi-shell min-h-screen px-4 py-12"><JoinInvitation key={session?.id ?? "guest"} signedIn={Boolean(session)} /></main>
}
