import Image from "next/image"
import { cn } from "@/lib/utils"

interface SaathiLogoProps {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function SaathiLogo({ className, imageClassName, priority = false }: SaathiLogoProps) {
  return (
    <div
      className={cn(
        "relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/30 bg-[var(--surface-low)] shadow-[0_0_28px_rgb(78_222_163/0.14)]",
        className,
      )}
      >
      <Image
        src="/saathi-logo-mark.png"
        alt="Saathi logo"
        fill
        priority={priority}
        sizes="96px"
        className={cn("object-cover", imageClassName)}
      />
    </div>
  )
}
