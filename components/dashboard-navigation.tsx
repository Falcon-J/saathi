"use client"

import Link from "next/link"
import { Home, LayoutGrid, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkspaceView } from "@/lib/dashboard-navigation"

const dashboardNavigationItems = [
  { view: "overview", label: "Overview", Icon: Home },
  { view: "board", label: "Board", Icon: LayoutGrid },
  { view: "team", label: "Team", Icon: Users },
] as const

export function DashboardNavigation({ mode, hasWorkspace, activeView = "overview", onOpenBoard, onOpenOverview, onOpenTeam }: {
  mode: "rail" | "mobile"
  hasWorkspace: boolean
  activeView?: WorkspaceView
  onOpenBoard?: () => void
  onOpenOverview?: () => void
  onOpenTeam?: () => void
}) {
  const compact = mode === "mobile"
  const actions = { overview: onOpenOverview, board: onOpenBoard, team: onOpenTeam }
  return (
    <nav aria-label="Workspace navigation" className={cn(compact ? "flex gap-1 border-b border-border bg-card px-2 py-2" : "flex w-full flex-col gap-1")}>
      <Link href="/canvas" aria-label="Canvas" className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", compact ? "min-w-0 flex-1 flex-col justify-center gap-1 px-2 text-xs" : "w-full justify-start text-sm")}><LayoutGrid className="size-5" aria-hidden="true" />Canvas</Link>
      {hasWorkspace && dashboardNavigationItems.map(({ view, label, Icon }) => (
        <button key={view} type="button" onClick={actions[view]} aria-current={activeView === view ? "location" : undefined} aria-label={label}
          className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", compact ? "min-w-0 flex-1 flex-col justify-center gap-1 px-2 text-xs" : "w-full justify-start text-sm", activeView === view ? "bg-accent text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
          <Icon className="size-5" aria-hidden="true" />{label}
        </button>
      ))}
    </nav>
  )
}
