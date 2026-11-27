"use client"
import s from "../app.module.css"

// A failed read says so, with a retry, instead of looking like an empty Home.
export default function HomeError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <header className={s.tb}><h1>Home</h1></header>
      <div className={s.wrap}>
        <div className={s.clear} role="alert">
          <div><h2>Couldn&apos;t load Home</h2><p>Your tasks are safe. Check your connection and try again.</p></div>
          <button className={`${s.btn} ${s["btn-line"]}`} type="button" onClick={retry}>Try again</button>
        </div>
      </div>
    </>
  )
}
