import { cn } from "@/lib/utils"
import { SaathiLogoMark } from "@/components/saathi-logo-mark"

interface SaathiLogoProps {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function SaathiLogo({ className, imageClassName, priority = false }: SaathiLogoProps) {
  void priority

  return (
    <div
      role="img"
      aria-label="Saathi logo"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--saathi-radius-card)] border border-[color-mix(in_srgb,var(--saathi-success)_32%,var(--border))] bg-[color-mix(in_srgb,var(--saathi-success)_10%,var(--card))] p-1.5 text-[var(--saathi-success)]",
        className,
      )}
    >
      <SaathiLogoMark className={imageClassName} />
    </div>
  )
}
