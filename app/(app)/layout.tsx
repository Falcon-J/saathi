import Link from "next/link"
import { getMe } from "@/lib/supabase"
import { Nav } from "./nav"
import s from "./app.module.css"

// The app frame: the nav with the needs-you count, then the page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = (await getMe())?.workspaces[0]
  const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
                 strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const
  return (
    <div className={s.app}>
      <nav className={s.sb} aria-label="Main">
        <Link className={s.brand} href="/home" aria-label="Saathi home">
          <svg width="26" height="26" viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="8" width="20" height="20" rx="5" fill="var(--ink)" /><rect x="18" y="14" width="20" height="20" rx="5" fill="var(--primary)" /></svg>
          <span>Saathi</span>
        </Link>
        <Nav counts={{ "/home": ws?.needs_you ?? 0, "/agents": ws?.silent ?? 0 }} />
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
