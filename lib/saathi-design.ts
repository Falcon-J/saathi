export const saathiDesign = {
  // Mirrors the light tokens in app/globals.css. Prefer the CSS variables in components.
  colors: {
    ink: "#1c1b19",
    inkMuted: "#64625c",
    canvas: "#faf9f7",
    surface: "#ffffff",
    surfaceSubtle: "#f2f1ee",
    accent: "#2952cc",
    accentSoft: "#eaf0fc",
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
    card: "0 1px 2px rgb(28 27 25 / 0.06)",
    elevated: "0 12px 32px rgb(28 27 25 / 0.14)",
  },
} as const

export const saathiAssetManifest = {
  logo: "/saathi-lockup.svg",
  logoDark: "/saathi-lockup-dark.svg",
  icon: "/icon.svg",
  logoMark: "/saathi-logo-mark.png",
  heroTexture: "/saathi-hero-texture.png",
  authIllustration: "/saathi-auth-illustration.png",
  unavailableIllustration: "/saathi-unavailable-illustration.png",
} as const

export type SaathiAssetKey = keyof typeof saathiAssetManifest
