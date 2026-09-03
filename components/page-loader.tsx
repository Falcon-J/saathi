import { Spinner } from "@/components/ui/spinner"

export function PageLoader({ label = "Loading Saathi..." }: { label?: string }) {
  return (
    <main className="saathi-shell flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-3 text-center" role="status" aria-live="polite">
        <Spinner className="size-8 text-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </main>
  )
}
