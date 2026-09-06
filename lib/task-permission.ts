export function canChangeTask(task: { ownerId: string; creatorId: string; assigneeId?: string | null }, actor: string, action: "edit" | "delete" | "toggle") {
  return actor === task.ownerId || actor === task.creatorId || (action === "toggle" && actor === task.assigneeId)
}
export function matchesTaskVersion(version: number, updatedAt: string, expected: number | string | undefined) {
  return typeof expected === "number" ? expected === version : typeof expected === "string" && expected === updatedAt
}
