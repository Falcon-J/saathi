"use client"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import s from "./signup.module.css"

type State = "idle" | "wait" | "cancelled" | "done" | "sent"

const notes: Record<string, string> = {
  idle: "Name and email only. No code access.",
  wait: "Finish in the GitHub tab.",
  cancelled: "Cancelled. Nothing was saved.",
  failed: "Sign-in didn't finish. Try again.",
  expired: "That link expired or was already used. Send a new one.",
}
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function SignupForm({ error }: { error: string }) {
  const [state, setState] = useState<State>(error && error !== "expired" ? "cancelled" : "idle")
  const [note, setNote] = useState(notes[error] ?? notes.idle)
  const [invalid, setInvalid] = useState(false)
  const [sending, setSending] = useState(false)
  const router = useRouter()
  const popup = useRef<Window | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const supabase = useRef(createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!))
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const show = (next: State, text = notes[next]) => { stateRef.current = next; setState(next); setNote(text) }

  // The popup reports back on this channel; if it closes without a word, the person cancelled.
  useEffect(() => {
    const channel = new BroadcastChannel("saathi-auth")
    channel.onmessage = async ({ data }: MessageEvent<{ error: string }>) => {
      if (data.error) return show("cancelled", notes[data.error] ?? notes.failed)
      show("done", "Signed in") // before the await, so the closed-popup check can't call it cancelled
      const { data: user } = await supabase.current.auth.getUser()
      const meta = user.user?.user_metadata ?? {}
      show("done", `Signed in as ${meta.user_name ?? user.user?.email ?? "you"}`)
      router.replace("/home")
    }
    const timer = setInterval(() => {
      if (stateRef.current === "wait" && popup.current?.closed) show("cancelled")
    }, 500)
    return () => { channel.close(); clearInterval(timer) }
  }, [router])

  async function github() {
    if (stateRef.current === "wait" || stateRef.current === "done") return
    // Open the window inside the click so popup blockers allow it, then point it at GitHub.
    const w = window.open("", "saathi-github", "popup,width=520,height=720")
    popup.current = w
    show("wait")
    const { data, error } = await supabase.current.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback${w ? "?popup=1" : ""}`, skipBrowserRedirect: true },
    })
    if (error || !data.url) { w?.close(); return show("cancelled", notes.failed) }
    if (!w) return location.assign(data.url)
    w.location.href = data.url
  }

  function openAgain() {
    if (popup.current && !popup.current.closed) popup.current.focus()
    else { stateRef.current = "idle"; void github() }
  }

  async function sendLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = emailRef.current!.value.trim()
    if (!emailPattern.test(email)) {
      setInvalid(true); setNote("Enter an email like you@company.com."); emailRef.current!.focus(); return
    }
    setInvalid(false); setSending(true)
    const { error } = await supabase.current.auth.signInWithOtp({ email })
    setSending(false)
    if (error) return setNote(error.status === 429 ? "Too many links sent. Try again in a minute." : "Couldn't send the link. Try again.")
    show("sent", notes.idle)
  }

  const busy = state === "wait" || state === "done"
  const label = { idle: "Continue with GitHub", sent: "Continue with GitHub", wait: "Waiting for GitHub", cancelled: "Try again", done: "Opening your workspace" }[state]
  return (
    <>
      <button className={`${s.btn} ${s.github}`} type="button" onClick={github} aria-busy={busy} data-done={state === "done" || undefined}>
        {busy ? <span className={s.spin} aria-hidden="true" /> : <GitHubMark />}
        <span>{label}</span>
      </button>
      <p className={s.note} role="status" data-done={state === "done" || undefined}>
        {state === "idle" || state === "sent" || state === "done" ? <Lock /> : null}
        <span>{note}</span>
        {state === "wait" ? <button type="button" className={s.again} onClick={openAgain}>Open again</button> : null}
      </p>
      <div className={s.or} aria-hidden="true"><span>or</span></div>
      {state === "sent" ? (
        <p className={s.sent} role="status"><Check /><span>Link sent. Check your inbox.</span></p>
      ) : (
        <form className={s.email} onSubmit={sendLink} noValidate>
          <label className={s.sr} htmlFor="email">Work email</label>
          <input ref={emailRef} id="email" type="email" autoComplete="email" placeholder="you@company.com" required aria-invalid={invalid} />
          <button className={`${s.btn} ${s.line}`} type="submit" disabled={sending}>{sending ? "Sending…" : "Email me a link"}</button>
        </form>
      )}
    </>
  )
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
function Lock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
