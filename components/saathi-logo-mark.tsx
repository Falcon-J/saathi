import Image from "next/image"
import { cn } from "@/lib/utils"

interface SaathiLogoMarkProps {
  className?: string
  priority?: boolean
}

export function SaathiLogoMark({ className, priority = false }: SaathiLogoMarkProps) {
  return (
    <Image
      src="/saathi-logo-mark.png"
      alt=""
      width={512}
      height={512}
      priority={priority}
      className={cn("size-full object-contain", className)}
    />
  )
}
