function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function calendarDateKey(value?: string): string | null {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null
    }

    return value
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function todayCalendarDate(timeZone = "UTC", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function calendarDateAt(value?: string, timeZone = "UTC"): string {
  if (!value) return ""
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "" : todayCalendarDate(timeZone, parsed)
}

export function formatCalendarDate(value?: string, timeZone = "UTC"): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", year: "numeric" }).format(parsed)
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
