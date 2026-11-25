export const saathiDesign = {
  // Mirrors the light tokens in app/globals.css. Prefer the CSS variables in components.
  colors: {
    ink: "#0a0a0b",
    inkMuted: "#5c5c66",
    canvas: "#fafafa",
    surface: "#ffffff",
    surfaceSubtle: "#f4f4f5",
    accent: "#6936f5",
    accentSoft: "#f1ecff",
    green: "#15803d",
    amber: "#b45309",
    red: "#b42318",
  },
  radii: {
    control: "0.375rem",
    card: "0.5rem",
    container: "0.75rem",
    pill: "999px",
  },
  shadows: {
    card: "0 1px 2px rgb(10 10 11 / 0.06)",
    elevated: "0 12px 32px rgb(10 10 11 / 0.14)",
  },
} as const

export const saathiAssetManifest = {
  logo: "/saathi-lockup.svg",
  logoDark: "/saathi-lockup-dark.svg",
  icon: "/icon.svg",
  logoMark: "/saathi-logo-mark.png",
} as const

export type SaathiAssetKey = keyof typeof saathiAssetManifest
