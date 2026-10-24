# Mobile sign-in browser evidence

- Build: local Next.js production build from `9da6551`, including the current uncommitted Compact B shell and Activity edits.
- Browser viewport: 390 × 844 CSS pixels.
- Route: `/dashboard` correctly redirected this isolated, unauthenticated browser to `/login?redirect=%2Fdashboard`.
- Visual check: sign-in form fits the mobile viewport, inputs and actions remain visible, and email input shows a clear keyboard focus ring. Screenshots: `2026-10-06-mobile-login-390.png` and `2026-10-06-mobile-login-390-keyboard.png`.
- Keyboard check: Tab reached Saathi home, Back, Email, Password, Show password, Forgot password, Sign in, Continue with Google, and Create an account in order. No form was submitted.
- Console: one local-only 404 for `/_vercel/insights/script.js`; no console warnings. The page UI loaded normally.
- Scope: this proves the local sign-in route at mobile width only. It does not prove authenticated dashboard, hosted, persistence, or realtime behavior. The dashboard was not accessed because this browser had no disposable test session.

## Updated 360px production capture

- Build: current local Next.js production build after the sign-in contrast correction.
- Browser viewport: 360 × 780 CSS pixels.
- Route: `/login`.
- Screenshot: `2026-10-06-mobile-login-360.png`.
- Result: all sign-in controls fit, with no horizontal overflow or development overlay. Keyboard and axe results are recorded in `../2026-10-06-ui-suite-evidence.md`.
