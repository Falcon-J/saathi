"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Bot, BookOpen, Archive, Inbox, LogOut, Monitor, Moon, Plug, Plus, Sun } from "lucide-react"
import { SaathiLogo } from "@/components/saathi-logo"

type SidebarWorkspace = { id: string; name: string }

/** Two letters that stand for a name, for the workspace dots and the account mark. */
export function initials(name: string) {
  const words = name.trim().split(/[\s@._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "?"
}

const THEMES = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
  { value: "system", label: "Match system theme", Icon: Monitor },
] as const

const row = "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"

/**
 * The workspace rail on large screens: every workspace one click away, then the
 * places people go between tasks. Small screens keep the header menu instead.
 */
export function WorkspaceSidebar({ email, username, workspaces, currentWorkspaceId, busy, signingOut, onWorkspace, onCreateWorkspace, onAgents, onInvitations, onNavigate, onSignOut }: {
  email: string; username?: string; workspaces: readonly SidebarWorkspace[]; currentWorkspaceId?: string | null; busy?: boolean; signingOut?: boolean
  onWorkspace: (id: string) => void; onCreateWorkspace: () => void; onAgents?: () => void; onInvitations: () => void
  onNavigate: (event: { preventDefault(): void }) => void; onSignOut: () => void
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const name = username || email

  return <aside aria-label="Workspaces and account" className="absolute inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
    <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
      <SaathiLogo className="size-7 border-border bg-card p-1" />
      <span className="saathi-display text-base">Saathi</span>
    </div>
    <nav aria-label="Workspaces" className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
      <p className="saathi-label px-2.5 pb-2 text-muted-foreground">Workspaces</p>
      <ul className="space-y-0.5">
        {workspaces.map(item => {
          const active = item.id === currentWorkspaceId
          return <li key={item.id}>
            <button type="button" data-workspace-id={item.id} aria-current={active ? "page" : undefined} disabled={busy} onClick={() => onWorkspace(item.id)}
              className={row + (active ? " bg-accent font-medium text-foreground" : "")}>
              <span aria-hidden="true" className={"grid size-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold " + (active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border")}>{initials(item.name)}</span>
              <span className="min-w-0 truncate">{item.name}</span>
            </button>
          </li>
        })}
        <li><button type="button" className={row} disabled={busy} onClick={onCreateWorkspace}><Plus className="size-4" aria-hidden="true" />New workspace</button></li>
      </ul>

      <p className="saathi-label mt-6 px-2.5 pb-2 text-muted-foreground">Work</p>
      <ul className="space-y-0.5">
        {onAgents && <li><button type="button" className={row} disabled={busy} onClick={onAgents}><Bot className="size-4" aria-hidden="true" />Agent runs</button></li>}
        <li><button type="button" className={row} onClick={onInvitations}><Inbox className="size-4" aria-hidden="true" />Invitations</button></li>
        <li><Link href="/connections" className={row} onClick={onNavigate}><Plug className="size-4" aria-hidden="true" />Connections</Link></li>
        <li><Link href="/archive" className={row} onClick={onNavigate}><Archive className="size-4" aria-hidden="true" />Archive</Link></li>
        <li><Link href="/guide" className={row} onClick={onNavigate}><BookOpen className="size-4" aria-hidden="true" />Guide</Link></li>
      </ul>
    </nav>
    <div className="space-y-3 border-t border-border p-3">
      <div role="group" aria-label="Theme" className="grid grid-cols-3 rounded-md border border-border bg-background p-0.5">
        {THEMES.map(({ value, label, Icon }) => <button key={value} type="button" aria-label={label} title={label} aria-pressed={mounted ? (theme ?? "system") === value : undefined} onClick={() => setTheme(value)}
          className="grid h-8 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </button>)}
      </div>
      <div className="flex items-center gap-2.5 px-1">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-card font-mono text-xs font-semibold ring-1 ring-border">{initials(name)}</span>
        <span className="min-w-0 flex-1 truncate text-sm" title={email}>{name}</span>
        <button type="button" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={onSignOut} className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </aside>
}
