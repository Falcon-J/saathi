import { redirect } from "next/navigation"

// Help and the guide had drifted into two copies of the same content; the guide is the one source.
export default function HelpPage() {
  redirect("/guide")
}
