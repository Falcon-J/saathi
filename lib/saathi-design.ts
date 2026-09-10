export const saathiDesign = {
  colors: {
    ink: "#111936",
    inkMuted: "#66708f",
    canvas: "#f7f8fc",
    surface: "#ffffff",
    surfaceSubtle: "#f1f2f8",
    violet: "#5b4df7",
    violetSoft: "#eeecff",
    green: "#34c759",
    amber: "#ff9f0a",
    red: "#ff3b30",
  },
  radii: {
    control: "0.375rem",
    card: "0.5rem",
    container: "0.75rem",
    pill: "999px",
  },
  shadows: {
    card: "0 10px 30px rgb(44 50 89 / 0.06)",
    elevated: "0 24px 80px rgb(44 50 89 / 0.10)",
  },
} as const

export const saathiAssetManifest = {
  logo: "/saathi-logo.png",
  logoMark: "/saathi-logo-mark.png",
  heroTexture: "/saathi-hero-texture.png",
  authIllustration: "/saathi-auth-illustration.png",
  unavailableIllustration: "/saathi-unavailable-illustration.png",
} as const

export type SaathiAssetKey = keyof typeof saathiAssetManifest
