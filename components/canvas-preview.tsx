import { cn } from "@/lib/utils"

type Card = { x: number; y: number; title: string; meta: string; state: "done" | "next" | "waiting" | "open" }

const cards: Card[] = [
  { x: 40, y: 70, title: "Agree on scope", meta: "Done", state: "done" },
  { x: 40, y: 330, title: "Draft the API", meta: "Done", state: "done" },
  { x: 300, y: 200, title: "Build export", meta: "Up next · High", state: "next" },
  { x: 300, y: 450, title: "Write tests", meta: "Ready", state: "open" },
  { x: 560, y: 200, title: "Ship to customers", meta: "Waiting on 2", state: "waiting" },
]
const edges: [number, number][] = [[0, 2], [1, 2], [1, 3], [2, 4], [3, 4]]
const W = 200
const H = 76

/** Decorative picture of the Canvas: tasks joined by dependencies, with the next task highlighted. Follows the theme tokens. */
export function CanvasPreview({ className, fit = "slice" }: { className?: string; fit?: "slice" | "meet" }) {
  return (
    <svg viewBox="0 0 800 620" aria-hidden="true" focusable="false" className={cn("pointer-events-none select-none", className)} preserveAspectRatio={`xMidYMid ${fit}`}>
      <defs>
        <pattern id="saathi-preview-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="var(--border)" />
        </pattern>
      </defs>
      <rect width="800" height="620" fill="var(--muted)" />
      <rect width="800" height="620" fill="url(#saathi-preview-dots)" />
      {edges.map(([from, to]) => {
        const a = cards[from], b = cards[to]
        const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2
        const live = cards[to].state === "next"
        return <path key={`${from}-${to}`} d={`M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={live ? "var(--primary)" : "var(--saathi-line-strong)"} strokeWidth={live ? 2.5 : 1.5} />
      })}
      {cards.map(card => {
        const next = card.state === "next"
        return (
          <g key={card.title} transform={`translate(${card.x} ${card.y})`} opacity={card.state === "done" ? 0.6 : 1}>
            <rect width={W} height={H} rx="10" fill={next ? "var(--accent)" : "var(--card)"} stroke={next ? "var(--primary)" : "var(--border)"} strokeWidth={next ? 2.5 : 1.5} />
            <circle cx="20" cy="27" r="5" fill={card.state === "done" ? "var(--saathi-success)" : card.state === "waiting" ? "var(--saathi-warning)" : "var(--primary)"} />
            <text x="34" y="32" fontSize="16" fontWeight="600" fill="var(--foreground)">{card.title}</text>
            <text x="20" y="57" fontSize="13" fill={next ? "var(--accent-foreground)" : "var(--muted-foreground)"}>{card.meta}</text>
          </g>
        )
      })}
    </svg>
  )
}
