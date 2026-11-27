import { Done } from "./done"

export const metadata = { title: "Signing in" }

// The GitHub popup ends here. It tells the sign-up page how it went, then closes.
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <Done error={error ?? ""} />
}
