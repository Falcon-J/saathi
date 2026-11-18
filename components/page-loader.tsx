import { Spinner } from "@/components/ui/spinner"

export function PageLoader({ label = "Loading Saathi...", embedded = false }: { label?: string; embedded?: boolean }) {
  const Container = embedded ? "div" : "main"
  return (
    <Container className={`saathi-shell flex items-center justify-center bg-background px-6 ${embedded ? "min-h-64" : "min-h-screen"}`}>
      <div className="flex flex-col items-center gap-3 text-center" role="status" aria-live="polite">
        <Spinner className="size-8 text-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </Container>
  )
}
