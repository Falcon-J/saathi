export function taskDeadline(input: { dueDate?: string | null; dueAt?: string | null }) {
  if (input.dueAt) {
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueAt) || Number.isNaN(Date.parse(input.dueAt))) throw new Error("Task due time requires a valid timezone")
    return { date: null, instant: new Date(input.dueAt).toISOString() }
  }
  if (input.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(input.dueDate)) || new Date(input.dueDate).toISOString().slice(0, 10) !== input.dueDate) throw new Error("Task due date is invalid")
    return { date: input.dueDate, instant: null }
  }
  return { date: null, instant: null }
}
