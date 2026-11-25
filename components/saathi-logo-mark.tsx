import { cn } from "@/lib/utils"

interface SaathiLogoMarkProps {
  className?: string
  /** Kept for call-site compatibility; the mark is inline SVG and never lazy-loads. */
  priority?: boolean
}

/**
 * The Pair mark: two squares meeting at one corner. The ink square is the
 * person, the accent square is the agent. Colours follow the active theme.
 */
export function SaathiLogoMark({ className }: SaathiLogoMarkProps) {
  return (
    <svg viewBox="0 0 2 2" aria-hidden="true" focusable="false" shapeRendering="crispEdges" className={cn("size-full", className)}>
      <rect x="0" y="0" width="1" height="1" fill="var(--foreground)" />
      <rect x="1" y="1" width="1" height="1" fill="var(--primary)" />
    </svg>
  )
}
