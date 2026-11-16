type Link = { prerequisiteTaskId: string; dependentTaskId: string }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Presentation only: callers must supply one complete, authorized workspace graph. */
export function taskNeighborhood(tasks: readonly { id: string }[], dependencies: readonly Link[], selectedId: string, relatedOnly: boolean, limit = 40) {
  const known = new Set(tasks.map(task => task.id))
  const levels = new Map<string, number>()
  if (!known.has(selectedId)) return { ids: [] as string[], levels, omittedCount: 0 }
  const before = new Map<string, string[]>(), after = new Map<string, string[]>()
  for (const edge of dependencies) {
    if (!known.has(edge.prerequisiteTaskId) || !known.has(edge.dependentTaskId)) continue
    before.set(edge.dependentTaskId, [...before.get(edge.dependentTaskId) ?? [], edge.prerequisiteTaskId])
    after.set(edge.prerequisiteTaskId, [...after.get(edge.prerequisiteTaskId) ?? [], edge.dependentTaskId])
  }
  levels.set(selectedId, 0)
  const walk = (links: Map<string, string[]>, direction: number) => {
    const seen = new Set([selectedId]), queue = [{ id: selectedId, depth: 0 }]
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]
      for (const id of [...links.get(current.id) ?? []].sort(compare)) {
        if (seen.has(id)) continue
        seen.add(id)
        const depth = current.depth + 1
        if (!levels.has(id)) levels.set(id, direction * depth)
        queue.push({ id, depth })
      }
    }
  }
  walk(before, -1); walk(after, 1)
  const related = new Set(levels.keys())
  const candidates = [...(relatedOnly || tasks.length > limit ? related : known)]
  const lastLevel = Math.max(...levels.values()) + 1
  for (const id of candidates) if (!levels.has(id)) levels.set(id, lastLevel)
  candidates.sort((a, b) => Number(b === selectedId) - Number(a === selectedId)
    || Math.abs(levels.get(a)!) - Math.abs(levels.get(b)!) || compare(a, b))
  const ids = candidates.slice(0, Math.max(1, Math.min(40, Math.floor(limit) || 1)))
  // Deterministic map order is part of the projection contract.
  const orderedLevels = new Map([...levels].sort(([a], [b]) => compare(a, b)))
  return { ids, levels: orderedLevels, omittedCount: (relatedOnly ? related.size : known.size) - ids.length }
}
