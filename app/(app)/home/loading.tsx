import s from "../app.module.css"

// Home's Loading state from home-v1: skeleton rows while the first read runs.
export default function Loading() {
  return (
    <>
      <header className={s.tb}><h1>Home</h1></header>
      <div className={s.split}>
        <div className={s.list}>
          <div className={s.wrap} role="status" aria-label="Loading">
            <ul className={`${s.rows} ${s.sk}`} aria-hidden="true">
              {["46%", "38%", "52%", "41%", "34%"].map(w => <li key={w}><i style={{ width: 14 }} /><i style={{ width: 44 }} /><i style={{ width: w }} /></li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
