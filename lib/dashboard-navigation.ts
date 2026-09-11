const dashboardSectionIds = [
  "workspace-header",
  "project-board",
  "team-panel",
] as const

export type DashboardSectionId = (typeof dashboardSectionIds)[number]

export type DashboardSectionVisibility = {
  id: string
  isIntersecting: boolean
  ratio: number
}

export function getDashboardNavigationTarget(id: DashboardSectionId): {
  sectionId: DashboardSectionId
  view: "overview" | "board" | "team" | null
} {
  if (id === "workspace-header") {
    return { sectionId: id, view: "overview" }
  }

  return { sectionId: id, view: id === "team-panel" ? "team" : "board" }
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
