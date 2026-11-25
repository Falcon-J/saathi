import { getSession } from "@/lib/auth-simple"
import { JoinInvitation } from "@/components/join-invitation"
import { connection } from "next/server"
import { AuthFrame } from "@/components/auth-shell"

export const metadata = { title: "Join workspace", referrer: "no-referrer" as const, robots: { index: false, follow: false } }

export default async function JoinPage() {
  await connection()
  const session = await getSession()
  return <AuthFrame wide backHref="/canvas" backLabel="Go to canvas"><JoinInvitation key={session?.id ?? "guest"} signedIn={Boolean(session)} /></AuthFrame>
}
