function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function localDateTimeToIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined
  const parsed = new Date(`${date}T${time}`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export function toLocalTime(value?: string): string {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

export function toLocalDate(value?: string): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

function parseDate(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
}

export function formatTaskDue(dueAt?: string, dueDate?: string): string | null {
  const value = dueAt || dueDate
  if (!value) return null
  const parsed = parseDate(value)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat(undefined, dueAt
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" },
  ).format(parsed)
}

export function formatTaskCreatedAt(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed)
}
