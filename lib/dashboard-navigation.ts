const dashboardSectionIds = [
  "workspace-header",
  "project-board",
  "team-panel",
  "realtime-panel",
] as const

export type DashboardSectionId = (typeof dashboardSectionIds)[number]

export type DashboardSectionVisibility = {
  id: string
  isIntersecting: boolean
  ratio: number
}

export function getDashboardNavigationTarget(id: DashboardSectionId): {
  sectionId: DashboardSectionId
  view: "overview" | "board" | null
} {
  if (id === "workspace-header") {
    return { sectionId: id, view: null }
  }

  return { sectionId: id, view: "board" }
}

export function normalizeDashboardActiveSection(
  activeSection: DashboardSectionId,
  showSecondary: boolean,
): DashboardSectionId {
  if (!showSecondary && (activeSection === "team-panel" || activeSection === "realtime-panel")) {
    return "workspace-header"
  }

  return activeSection
}

const isDashboardSectionId = (id: string): id is DashboardSectionId =>
  dashboardSectionIds.includes(id as DashboardSectionId)

export function selectActiveDashboardSection(
  sections: readonly DashboardSectionVisibility[],
  currentSection: DashboardSectionId,
): DashboardSectionId {
  const visibleSection = sections
    .filter((section): section is DashboardSectionVisibility & { id: DashboardSectionId } => (
      section.isIntersecting && isDashboardSectionId(section.id)
    ))
    .sort((left, right) => right.ratio - left.ratio)[0]

  return visibleSection?.id ?? currentSection
}
