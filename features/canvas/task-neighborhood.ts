type Link = { prerequisiteTaskId: string; dependentTaskId: string }
type TaskState = { id: string; completed?: boolean; status?: string }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Presentation only: callers must supply one complete, authorized workspace graph. */
export function taskNeighborhood(tasks: readonly TaskState[], dependencies: readonly Link[], selectedId: string, limit = 40) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const levels = new Map<string, number>()
  if (!byId.has(selectedId)) return { ids: [] as string[], levels, omittedCount: 0 }
  const blockers = new Set<string>()
  for (const edge of dependencies) {
    const task = byId.get(edge.prerequisiteTaskId)
    if (edge.dependentTaskId === selectedId && task && task.id !== selectedId && !task.completed && task.status !== "done") blockers.add(task.id)
  }
  const candidates = [selectedId, ...[...blockers].sort(compare)]
  const ids = candidates.slice(0, Math.max(1, Math.min(40, Math.floor(limit) || 1)))
  for (const id of [...ids].sort(compare)) levels.set(id, id === selectedId ? 0 : -1)
  return { ids, levels, omittedCount: candidates.length - ids.length }
}
