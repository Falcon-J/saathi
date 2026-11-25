import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "How Saathi works", description: "Create work, connect blockers, and collaborate in Saathi." }
export const dynamic = "force-dynamic"

const guides = [
  { id: 'create-work', title: 'Create work', steps: ['Open Canvas menu → Create workspace. Add a name; goal and target date are optional.', 'Open a workspace and choose Tasks → New task. Add a title, then use Add details for a description or date.', 'Open a task to inspect it. Choose Edit task to change its fields or assign a teammate, or Mark done to complete it.'] },
  { id: 'dependencies', title: 'Connect blockers', steps: ['Select a task. The graph shows that task and its unfinished direct blockers.', 'Open Task details to inspect or edit prerequisites. Your workspace permissions determine which actions are available.', 'Select a blocker to work on it. Completing it removes it from the dependent task’s graph; once all blockers are done, the task becomes Ready.'] },
  { id: 'navigation', title: 'Find and navigate work', steps: ['Use Search tasks or commands at the top of the canvas. Ctrl or Command + K focuses search.', 'All tasks returns from an inspected task to the workspace list. Filter that list by Ready, Waiting, Done or Review.', 'Drag with the Hand tool or hold Space to pan. Use Fit View to frame work, and + or − to change zoom.'] },
  { id: 'collaboration', title: 'Manage your workspace', steps: ['Use the workspace panel selector for Team, History and Settings.', 'Owners can create single-use invite links in Team. Each link expires after seven days. Incoming invitations are in Canvas menu → Invitations; viewing them requires verified email.', 'History identifies recorded changes. Older records may have less detail. Archive keeps work read only; deleting a workspace permanently removes its tasks, comments and memberships.'] },
]

export default function GuidePage() {
  return <main className="mx-auto min-h-screen max-w-4xl space-y-8 px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold">How Saathi works</h1><Button asChild variant="outline"><Link href="/canvas">Back to workspace</Link></Button></header>
    <nav aria-label="Guide sections" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-primary">{guides.map(guide => <a key={guide.id} href={'#' + guide.id} className="underline underline-offset-4">{guide.title}</a>)}<a href="#connect-agent" className="underline underline-offset-4">Connect an agent</a></nav>
    {guides.map(guide => <section key={guide.id} id={guide.id} className="scroll-mt-6 space-y-4 border-t border-border pt-6"><h2 className="text-xl font-semibold">{guide.title}</h2><ol className="list-decimal space-y-3 pl-5 text-sm leading-6">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></section>)}
    <section id="connect-agent" className="scroll-mt-6 space-y-4 border-t border-border pt-6"><h2 className="text-xl font-semibold">Connect an agent</h2><ol className="list-decimal space-y-3 pl-5 text-sm leading-6"><li>Open <Link href="/connections" className="text-primary underline">Agent connections</Link> and expand Connect an agent to find your server URL.</li><li>Add Saathi in a supported MCP client. Start sign-in there, then approve specific workspaces, permissions and an expiry in Saathi. A client that is not registered for Saathi needs administrator setup.</li><li>Agent runs shows progress and evidence. Follow moves the canvas to the task; Stop following changes your view without cancelling the run.</li><li>For expired or revoked access, use Reconnect on the connection. Disconnect retained consent first, then add the connection again in your client and approve fresh access.</li></ol></section>
    
  </main>
}
