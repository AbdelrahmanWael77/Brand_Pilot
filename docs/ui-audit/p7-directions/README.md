# P7 checkpoint 0, round 2: three brand directions (mockups only)

Static HTML mockups, not the app. Real FlowNest content: last 28 days (21 Sep – 18 Oct 2026); the small trend lines use the
demo's daily data (`series.json`). Regenerate with `node docs/ui-audit/p7-directions/make.mjs`; `contrast.json` holds the
WCAG contrast ratio of every text colour pair (all ≥ 4.5:1).

- `violet-*` Midnight Violet: confident and sharp (Geist + Readex Pro)
- `night-*` Night Signal: smart and techy (Inter + Noto Kufi Arabic)
- `sun-*` Sunroom: warm and human (Fraunces + Manrope, Noto Naskh Arabic + Tajawal)

Fonts in `fonts/` are from Fontsource (`@fontsource/*@5.3.0`), all under the SIL Open Font License 1.1. Only the
direction that is chosen would be shipped with the app (with its licence file), as the current fonts are.
