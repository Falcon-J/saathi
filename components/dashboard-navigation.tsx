"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { CalendarDays, Home, LayoutGrid, Sparkles, Users, FolderKanban, Inbox, UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDashboardNavigationTarget,
  normalizeDashboardActiveSection,
  selectActiveDashboardSection,
  type DashboardSectionId,
} from "@/lib/dashboard-navigation"

const dashboardNavigationItems = [
  { id: "workspace-header", label: "Home", Icon: Home },
  { id: "project-board", label: "My Tasks", Icon: LayoutGrid },
  { id: "team-panel", label: "People", Icon: Users },
] as const

const secondaryNavigationItems = [
  { label: "Inbox", Icon: Inbox, href: "/dashboard", disabled: true },
  { label: "Workspaces", Icon: UsersRound, href: "/dashboard", disabled: false },
  { label: "Projects", Icon: FolderKanban, href: "/tasks", disabled: false },
  { label: "Calendar", Icon: CalendarDays, href: "/dashboard", disabled: true },
  { label: "AI Assistant", Icon: Sparkles, href: "/guide", disabled: false },
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
  showSecondary = true,
  onOpenBoard,
  onOpenOverview,
  onOpenTeam,
}: {
  mode: "rail" | "mobile"
  hasWorkspace: boolean
  showSecondary?: boolean
  onOpenBoard?: () => void
  onOpenOverview?: () => void
  onOpenTeam?: () => void
}) {
  const [activeSection, setActiveSection] = useState<DashboardSectionId>("workspace-header")

  useEffect(() => {
    setActiveSection((currentSection) => normalizeDashboardActiveSection(currentSection, showSecondary))

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
  }, [hasWorkspace, showSecondary])

  const navigateTo = (id: DashboardSectionId) => {
    const target = getDashboardNavigationTarget(id)
    setActiveSection(id)
    const scrollToTarget = () => {
      const section = document.getElementById(target.sectionId)
      if (!section) return
      section.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.replaceState(null, "", `#${target.sectionId}`)
    }

    const openView = target.view === "team" ? onOpenTeam : target.view === "overview" ? onOpenOverview : onOpenBoard
    if (openView) {
      openView()
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTarget))
      return
    }

    scrollToTarget()
  }

  const compact = mode === "mobile"
  if (!hasWorkspace) return null
  const visibleItems = dashboardNavigationItems.slice(0, 3)

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
          active={activeSection === item.id}
          compact={compact}
          onNavigate={navigateTo}
        />
      ))}
      {!compact && <div className="my-3 border-t border-border" aria-hidden="true" />}
      {!compact && secondaryNavigationItems.map(({ label, Icon, href, disabled }) => disabled ? (
        <span key={label} title={`${label} is not available yet`} aria-disabled="true" className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground/55"><Icon className="size-5" aria-hidden="true" /><span>{label}</span></span>
      ) : (
        <Link key={label} href={href} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><Icon className="size-5" aria-hidden="true" /><span>{label}</span></Link>
      ))}
    </nav>
  )
}
