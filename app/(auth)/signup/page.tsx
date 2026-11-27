import Link from "next/link"
import { SignupForm } from "./signup-form"
import s from "./signup.module.css"

export const metadata = { title: "Sign up" }

// One page for sign up and sign in: both paths make the account on first use.
export default async function Page({ searchParams }: { searchParams: Promise<{ signin?: string; error?: string }> }) {
  const q = await searchParams
  const signin = q.signin !== undefined
  return (
    <div className={s.page}>
      <main className={s.left}>
        <Link className={s.brand} href="/" aria-label="Saathi home">
          <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="2" y="8" width="20" height="20" rx="5" fill="var(--ink)" />
            <rect x="18" y="14" width="20" height="20" rx="5" fill="var(--primary)" />
          </svg>
          <span>Saathi</span>
        </Link>
        <div className={s.mid}>
          <div className={s.inner}>
            <p className={s.label}>{signin ? "Sign in" : "Sign up"}</p>
            <h1 className={s.title}>One click, <span>and you&apos;re in.</span></h1>
            <SignupForm error={q.error ?? ""} />
            <p className={s.alt}>
              {signin ? <>New here? <Link href="/signup">Sign up</Link></> : <>Have an account? <Link href="/signup?signin">Sign in</Link></>}
            </p>
          </div>
        </div>
      </main>
      <aside className={s.right} aria-label="What you get after signing up">
        <p className={s.label}>Ready in seconds</p>
        <div className={s.grid} aria-hidden="true" />
        <ol className={s.chain}>
          <li><div className={s.card}><span className={s.square}>W</span><b>Your workspace</b><span className={`${s.chip} ${s.ok}`}><i />Created</span></div></li>
          <li><span className={s.link} /><div className={s.card}><span className={s.square}>a</span><b>demo-agent</b><span className={s.chip}><i />Working</span></div></li>
          <li><span className={s.link} /><div className={`${s.card} ${s.mine}`}><span className={s.square}>1</span><b>Approve your first task</b><span className={`${s.chip} ${s.you}`}><i />Needs you</span></div></li>
        </ol>
        <p className={s.caption}>No setup. A demo agent is already working.</p>
      </aside>
    </div>
  )
}
