// Placeholder until the landing page lands (PR 11).
export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <picture>
          <source srcSet="/saathi-lockup-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/saathi-lockup.svg" alt="Saathi" width={160} height={40} />
        </picture>
        <p className="text-muted">Task coordination for people and AI agents. Being rebuilt.</p>
      </div>
    </main>
  )
}
