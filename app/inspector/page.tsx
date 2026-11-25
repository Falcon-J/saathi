import Link from "next/link"
import { RunInspector } from "@/components/run-inspector/run-inspector"
import { SaathiLogo } from "@/components/saathi-logo"
import { demoRun } from "@/lib/run-trace-demo"

export const metadata = { title: "Agent Run Inspector · Saathi" }

export default function InspectorPage() {
  return (
    <main className="saathi-shell min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home"><SaathiLogo className="size-8" /><span className="font-semibold">Saathi</span></Link>
          <Link href="/canvas" className="text-sm text-muted-foreground hover:text-foreground">Open Canvas</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Agent Run Inspector</h1>
          <p className="text-muted-foreground">When an agent run fails, the error shows up at the end but the mistake happened earlier. The Inspector replays the run as a graph and traces the failure back to the step that caused it.</p>
          <p className="text-sm text-muted-foreground">This is a sample run. Each step records what it read and wrote, with versions, so the trace is computed rather than guessed.</p>
        </div>
        <RunInspector run={demoRun} />
      </div>
    </main>
  )
}
