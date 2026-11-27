"use client"
// The main nav links, marked current by the path.
import Link from "next/link"
import { usePathname } from "next/navigation"
import s from "./app.module.css"

const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
               strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const
const LINKS = [
  { href: "/home", label: "Home", also: "/tasks", path: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></> },
  { href: "/agents", label: "Agents", path: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M9 13v2M15 13v2" /></> },
]

export function Nav({ counts }: { counts: Record<string, number> }) {
  const at = usePathname()
  return (
    <div className={s.nav}>
      {LINKS.map(l => {
        const n = counts[l.href] ?? 0
        const current = at.startsWith(l.href) || (l.also && at.startsWith(l.also))
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            <svg {...icon}>{l.path}</svg><span>{l.label}</span>
            {n > 0 && <em className={s.n} aria-label={`${n} need you`}>{n}</em>}
          </Link>
        )
      })}
    </div>
  )
}
