const dashboardSectionIds = [
  "workspace-header",
  "project-board",
  "team-panel",
  "activity-history",
] as const

export type DashboardSectionId = (typeof dashboardSectionIds)[number]

export type DashboardSectionVisibility = {
  id: string
  isIntersecting: boolean
  ratio: number
}

export function getDashboardNavigationTarget(id: DashboardSectionId): {
  sectionId: DashboardSectionId
  view: "overview" | "board" | "team" | "activity" | null
} {
  if (id === "workspace-header") {
    return { sectionId: id, view: "overview" }
  }

  if (id === "team-panel") return { sectionId: id, view: "team" }
  if (id === "activity-history") return { sectionId: id, view: "activity" }
  return { sectionId: id, view: "board" }
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
