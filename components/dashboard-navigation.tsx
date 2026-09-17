"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { History, Home, LayoutGrid, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDashboardNavigationTarget,
  selectActiveDashboardSection,
  type DashboardSectionId,
} from "@/lib/dashboard-navigation"

const dashboardNavigationItems = [
  { id: "workspace-header", label: "Overview", Icon: Home },
  { id: "project-board", label: "Board", Icon: LayoutGrid },
  { id: "team-panel", label: "Team", Icon: Users },
  { id: "activity-history", label: "Activity", Icon: History },
] as const

function NavigationItem({
  id,
  label,
  Icon,
  active,
  compact,
  onNavigate,
}: {
  id: DashboardSectionId
  label: string
  Icon: LucideIcon
  active: boolean
  compact: boolean
  onNavigate: (id: DashboardSectionId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      aria-current={active ? "location" : undefined}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        compact ? "min-h-10 flex-1 justify-center gap-2 px-3 text-xs font-medium" : "min-h-10 w-full justify-start gap-3 px-3 text-sm font-medium",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

export function DashboardNavigation({
  mode,
  hasWorkspace,
  activeView,
  onOpenBoard,
  onOpenOverview,
  onOpenTeam,
  onOpenActivity,
  isOwner,
  settingsActive,
  onOpenSettings,
}: {
  mode: "rail" | "mobile"
  hasWorkspace: boolean
  activeView?: "overview" | "board" | "team" | "activity" | "settings"
  onOpenBoard?: () => void
  onOpenOverview?: () => void
  onOpenTeam?: () => void
  onOpenActivity?: () => void
  isOwner?: boolean
  settingsActive?: boolean
  onOpenSettings?: () => void
}) {
  const [activeSection, setActiveSection] = useState<DashboardSectionId>(activeView === "board" ? "project-board" : activeView === "team" ? "team-panel" : activeView === "activity" ? "activity-history" : "workspace-header")

  useEffect(() => {
    if (activeView === "board") setActiveSection("project-board")
    else if (activeView === "team") setActiveSection("team-panel")
    else if (activeView === "activity") setActiveSection("activity-history")
    else if (activeView === "overview") setActiveSection("workspace-header")
  }, [activeView])

  useEffect(() => {
    if (activeView) return

    const sections = dashboardNavigationItems
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => section !== null)

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        setActiveSection((currentSection) => selectActiveDashboardSection(
          entries.map((entry) => ({
            id: entry.target.id,
            isIntersecting: entry.isIntersecting,
            ratio: entry.intersectionRatio,
          })),
          currentSection,
        ))
      },
      { rootMargin: "-22% 0px -65% 0px", threshold: [0, 0.1, 0.5, 1] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [activeView, hasWorkspace])

  const navigateTo = (id: DashboardSectionId) => {
    const target = getDashboardNavigationTarget(id)
    setActiveSection(id)
    const scrollToTarget = () => {
      const section = document.getElementById(target.sectionId)
      if (!section) return
      section.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.replaceState(null, "", `#${target.sectionId}`)
    }

    const openView = target.view === "team" ? onOpenTeam : target.view === "activity" ? onOpenActivity : target.view === "overview" ? onOpenOverview : onOpenBoard
    if (openView) {
      openView()
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTarget))
      return
    }

    scrollToTarget()
  }

  const compact = mode === "mobile"
  if (!hasWorkspace) return null
  const visibleItems = dashboardNavigationItems

  return (
    <nav
      aria-label="Workspace navigation"
      className={cn(
        compact ? "flex gap-1 border-b border-border bg-card px-2 py-2" : "flex w-full flex-col gap-1",
      )}
    >
      {visibleItems.map((item) => (
        <NavigationItem
          key={item.id}
          {...item}
          active={activeSection === item.id && activeView !== "settings"}
          compact={compact}
          onNavigate={navigateTo}
        />
      ))}
      {isOwner && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-current={settingsActive ? "location" : undefined}
          aria-label="Settings"
          title="Settings"
          className={cn(
            "flex items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            compact ? "min-h-10 flex-1 justify-center gap-2 px-3 text-xs font-medium" : "min-h-10 w-full justify-start gap-3 px-3 text-sm font-medium",
            settingsActive ? "bg-accent text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Settings className="size-5" aria-hidden="true" />
          <span>Settings</span>
        </button>
      )}
    </nav>
  )
}
