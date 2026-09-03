"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Activity, Home, LayoutGrid, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDashboardNavigationTarget,
  normalizeDashboardActiveSection,
  selectActiveDashboardSection,
  type DashboardSectionId,
} from "@/lib/dashboard-navigation"

const dashboardNavigationItems = [
  { id: "workspace-header", label: "Home", Icon: Home },
  { id: "project-board", label: "My work", Icon: LayoutGrid },
  { id: "team-panel", label: "Team", Icon: Users },
  { id: "realtime-panel", label: "Realtime", Icon: Activity },
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
        "flex items-center justify-center rounded-[var(--saathi-radius-control)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        compact ? "min-h-10 flex-1 gap-2 px-3 text-xs font-medium" : "size-11",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {compact && <span>{label}</span>}
    </button>
  )
}

export function DashboardNavigation({
  mode,
  hasWorkspace,
  showSecondary = true,
  onOpenBoard,
}: {
  mode: "rail" | "mobile"
  hasWorkspace: boolean
  showSecondary?: boolean
  onOpenBoard?: () => void
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

    if (target.view === "board" && onOpenBoard) {
      onOpenBoard()
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTarget))
      return
    }

    scrollToTarget()
  }

  const compact = mode === "mobile"
  if (!hasWorkspace) return null
  const visibleItems = showSecondary ? dashboardNavigationItems : dashboardNavigationItems.slice(0, 2)

  return (
    <nav
      aria-label="Workspace navigation"
      className={cn(
        compact ? "flex gap-1 border-b border-border bg-card px-2 py-2" : "flex w-full flex-col items-center gap-2",
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
    </nav>
  )
}
