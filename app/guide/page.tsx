import type { Metadata } from "next"
import Link from "next/link"
import { AppPage } from "@/components/app-page"

export const metadata: Metadata = { title: "How Saathi works", description: "Create work, connect blockers, and collaborate in Saathi." }
export const dynamic = "force-dynamic"

const guides = [
  { id: 'create-work', title: 'Create work', steps: ['Create a workspace for one project. A goal and a target date are optional.', 'The workspace opens as a board: Up next, In progress, Waiting and Done. Choose New task to add work.', 'Open a task to see what it waits on. Choose Edit task to change it or assign someone, or Mark done when it is finished.'] },
  { id: 'dependencies', title: 'Connect blockers', steps: ['Open a task, expand Task details and add a prerequisite: the task it waits on.', 'A task with unfinished prerequisites sits in Waiting and its card names them.', 'When the last prerequisite is done, the task moves to Up next on its own, for you and for your agents.'] },
  { id: 'navigation', title: 'Board and Map', steps: ['Board lists every task in lanes, so you can read what to do next without tracing arrows.', 'Map shows the same tasks as a graph when you want to see how work connects. Switch in the header; Saathi remembers your choice.', 'Use Search tasks or commands at the top. Ctrl or Command + K focuses it.'] },
  { id: 'collaboration', title: 'Work with your team', steps: ['Owners create single-use invite links in Team. Each link expires after seven days.', 'History shows every recorded change. Archive keeps a workspace read-only; deleting it removes its tasks, comments and memberships for good.', 'Agents connect over MCP. Their runs appear under Agents, and work they hand back waits for your review.'] },
]

export default function GuidePage() {
  return <AppPage eyebrow="Guide" title="How Saathi works" description="Saathi keeps one task graph for you, your team and your AI agents. These are the four things to know.">
    <nav aria-label="Guide sections" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-primary">{guides.map(guide => <a key={guide.id} href={'#' + guide.id} className="underline underline-offset-4">{guide.title}</a>)}<a href="#connect-agent" className="underline underline-offset-4">Connect an agent</a></nav>
    {guides.map(guide => <section key={guide.id} id={guide.id} className="scroll-mt-6 space-y-4 border-t border-border pt-6"><h2 className="saathi-display text-2xl">{guide.title}</h2><ol className="list-decimal space-y-3 pl-5 text-sm leading-6">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></section>)}
    <section id="connect-agent" className="scroll-mt-6 space-y-4 border-t border-border pt-6"><h2 className="saathi-display text-2xl">Connect an agent</h2><ol className="list-decimal space-y-3 pl-5 text-sm leading-6"><li>Open <Link href="/connections" className="text-primary underline">Agent connections</Link> and expand Connect an agent to find your server URL.</li><li>Add Saathi in a supported MCP client. Start sign-in there, then approve specific workspaces, permissions and an expiry in Saathi. A client that is not registered for Saathi needs administrator setup.</li><li>Agent runs shows progress and evidence. Follow moves the canvas to the task; Stop following changes your view without cancelling the run.</li><li>For expired or revoked access, use Reconnect on the connection. Disconnect retained consent first, then add the connection again in your client and approve fresh access.</li></ol></section>
    
  </AppPage>
}
