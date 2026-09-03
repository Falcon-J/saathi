import { cn } from "@/lib/utils"
import { SaathiLogoMark } from "@/components/saathi-logo-mark"

interface SaathiLogoProps {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function SaathiLogo({ className, imageClassName, priority = false }: SaathiLogoProps) {
  return (
    <div
      role="img"
      aria-label="Saathi logo"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--saathi-radius-card)] border border-border bg-card p-1.5",
        className,
      )}
    >
      <SaathiLogoMark className={imageClassName} priority={priority} />
    </div>
  )
}
