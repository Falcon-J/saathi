import { notFound } from "next/navigation"
import { Home } from "../../home/home"
import { load } from "../../home/load"

// A bad escape in the URL is a missing task, not a crash.
const decode = (ref: string) => { try { return decodeURIComponent(ref) } catch { notFound() } }

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: decode((await params).ref).toUpperCase() }
}

// The full task page: the same task view as Home's pane, given the whole width.
export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const props = await load(decode((await params).ref))
  if (!props.task) notFound()
  return <Home {...props} full />
}
