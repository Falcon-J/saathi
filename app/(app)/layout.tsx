import Link from "next/link"
import { getMe } from "@/lib/supabase"
import s from "./app.module.css"

// The app frame: the nav with the needs-you count, then the page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const n = (await getMe())?.workspaces[0]?.needs_you ?? 0
  const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
                 strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const
  return (
    <div className={s.app}>
      <nav className={s.sb} aria-label="Main">
        <Link className={s.brand} href="/home" aria-label="Saathi home">
          <svg width="26" height="26" viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="8" width="20" height="20" rx="5" fill="var(--ink)" /><rect x="18" y="14" width="20" height="20" rx="5" fill="var(--primary)" /></svg>
          <span>Saathi</span>
        </Link>
        <div className={s.nav}>
          <Link href="/home" aria-current="page">
            <svg {...icon}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></svg>
            <span>Home</span>{n > 0 && <em className={s.n} aria-label={`${n} need you`}>{n}</em>}
          </Link>
        </div>
        <form className={`${s.nav} ${s["sb-end"]}`} action="/auth/signout" method="post">
          <button type="submit">
            <svg {...icon}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            <span>Sign out</span>
          </button>
        </form>
      </nav>
      <main className={s.mn}>{children}</main>
    </div>
  )
}
