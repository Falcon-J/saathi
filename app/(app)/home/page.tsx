import { Home } from "./home"
import { load } from "./load"

export const metadata = { title: "Home" }

// Home: the list, with the open task (?task=SAA-14, or the first that needs you) in the pane.
export default async function Page({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  return <Home {...await load((await searchParams).task)} />
}
