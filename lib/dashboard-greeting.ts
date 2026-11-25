export type DashboardGreeting = "Good morning" | "Good afternoon" | "Good evening"

export function getDashboardGreetingForHour(hour: number): DashboardGreeting {
  const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24
  if (normalizedHour < 12) return "Good morning"
  if (normalizedHour < 18) return "Good afternoon"
  return "Good evening"
}
