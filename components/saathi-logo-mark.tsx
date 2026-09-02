import { cn } from "@/lib/utils"

interface SaathiLogoMarkProps {
  className?: string
}

export function SaathiLogoMark({ className }: SaathiLogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-full", className)}
    >
      <path
        d="M6.5 10.25 11.9 4.9a2.65 2.65 0 0 1 4.52 1.87v6.08c0 .52.63.79 1 .42l3.1-3.1a2.65 2.65 0 0 1 4.52 1.88v2.46"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m25.5 21.75-5.4 5.35a2.65 2.65 0 0 1-4.52-1.87v-6.08c0-.52-.63-.79-1-.42l-3.1 3.1a2.65 2.65 0 0 1-4.52-1.88v-2.46"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
