# BrandPilot design system — "Ledger"

Source of truth for the product's look and feel (branch `redesign/new-product-identity`, 2026-11-16).
Page-specific overrides go in `pages/<view>.md`; none exist yet.

## 1. What the product is (discovery)

| | |
|---|---|
| Industry | B2B marketing intelligence for small and mid-size companies, MENA-first (EN/AR, EGP/SAR/AED currencies). |
| Model | Account → companies → sources, facts, imports → rules-engine audit → AI Marketing Director → bilingual campaigns → analytics loop. |
| Users | Founders, in-house marketing managers, agency strategists. Weekly, focused sessions; they read, decide and approve more than they type. |
| Personality | A rigorous strategist: evidence first, honest about gaps, never invents numbers. Every claim carries a label (fact / interpretation / hypothesis / synthetic). |
| Competitor conventions | HubSpot and Semrush (orange on white), Similarweb and most BI tools (trust blue), Jasper / Brandwatch (purple/navy gradients), Sprout Social (green). All "SaaS dashboard" in look. |
| Trust expectations | Numbers must read as precise; AI must read as accountable; customer brand colours must be shown faithfully in the Studio. |

## 2. Directions explored (ui-ux-pro-max `--design-system`, `--domain style/color/typography --rtl`)

| Direction | Skill source | Verdict |
|---|---|---|
| A. Trust blue + glassmorphism, Calistoga/Inter | `"B2B marketing analytics SaaS"` default | Rejected — the category default; indistinguishable from Similarweb and from the old indigo UI. Glass hurts contrast on dense tables. |
| B. Brutalism, pink + cyan, Playfair | `"marketing agency"` product row | Rejected — suits an agency's own site; reads as playful where the product's promise is rigour. Pink/cyan would also clash with every customer's brand colours in the Studio. |
| C. Data-dense BI, blue + amber, Fira | `"business intelligence research analyst"` | Partly adopted (density, tabular numerals, sticky headers) — rejected as identity: cold, code-like, wrong for the creative and advisory halves of the product. |
| D. Black + gold luxury, Motion-driven dark | `"brand management creative studio"`, `"premium warm"` palette | Rejected as dark-first (long reading sessions, Arabic text at small sizes) — kept the idea of an ink-neutral chrome. |
| **E. "Ledger" — editorial strategist's brief** | Editorial Grid (rtl caveats → mirrorable variant), Luxury/Premium palette (ink neutral), Bento for the dashboard, Data-Dense for tables | **Chosen.** |

### Why "Ledger" fits
- **Evidence is the product.** An editorial / research-brief language (serif headlines, mono labels, footnote-like evidence, hairline rules) says "this was checked" — the same cue an analyst report or a board memo gives.
- **Neutral chrome, faithful customer colour.** Paper + ink chrome never competes with the customer's palette in Campaign Studio previews; a coloured chrome (blue, pink, green) tints every judgement of their creative.
- **Differentiation.** No direct competitor uses a warm paper + ink + single vermilion signal. It is recognisable in one screenshot.
- **Green was not kept.** Green carries "positive / passed" in an app full of verdicts; using it as brand colour would blur that signal. Green is a semantic colour only.
- **RTL.** Editorial Grid has `rtl_level: caveats` (drop caps, reading-direction motion). Ledger drops drop caps and directional reveals; all layout uses logical properties, so it mirrors fully.

## 3. Tokens

### Colour (light, the only mode for now — dark mode deferred, see §8)
| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5F2EC` | App background |
| `--paper-2` | `#ECE8DF` | Sidebar, sunken wells, tab tracks |
| `--surface` | `#FFFFFF` | Sheets (cards), inputs |
| `--surface-2` | `#FBF9F5` | Raised rows, table zebra |
| `--ink` | `#16161D` | Text, primary buttons, structure |
| `--ink-2` | `#45454F` | Secondary text (9.6:1 on paper) |
| `--ink-3` | `#65656F` | Tertiary text, labels (5.3:1 on paper) |
| `--rule` | `#E2DDD2` | Hairlines |
| `--rule-2` | `#CFC8BA` | Input borders, strong rules |
| `--signal` | `#C8401A` | Vermilion — selection, the current item, the "next step", focus. Never a status. (5.0:1 on white) |
| `--signal-soft` | `#FBE9E1` | Signal tint |
| `--pos` / `--pos-bg` | `#1F6B4A` / `#E3F1E8` | Passed, strength, up |
| `--neg` / `--neg-bg` | `#A3241A` / `#F9E3DF` | Failed, weakness, risk, down |
| `--warn` / `--warn-bg` | `#8A5A00` / `#F8EDCF` | Pending, needs review, hypothesis |
| `--info` / `--info-bg` | `#4B45A8` / `#ECEBF8` | Interpretation, AI |
| `--data-1..4` | `#16161D`, `#C8401A`, `#2B6F8F`, `#B88A2E` | Chart series in this order |

Status colour is never the only signal: every status badge carries a glyph (✓ ✕ ! ~ ?) or a word.

### Typography
| Role | Family | Size / weight |
|---|---|---|
| Display (page titles, KPI numbers, answer titles) | Fraunces (opsz, 600) → IBM Plex Sans Arabic in Arabic | 30–40px, -0.02em |
| UI and body | IBM Plex Sans + IBM Plex Sans Arabic | 15px / 1.55, 400–600 |
| Labels, eyebrows, numerals in tables | IBM Plex Mono | 11–12px, uppercase eyebrows +0.08em |

Arabic: Fraunces has no Arabic glyphs, so Arabic headings fall through to Plex Sans Arabic 600 — same family as the body, which keeps Arabic pages calm. Letter-spacing is reset to 0 under `[dir=rtl]` (tracking breaks Arabic joining).

### Space, shape, depth
- 4px base: 4 8 12 16 20 24 32 40 56.
- Radius: 6 (controls), 10 (sheets), 999 (pills). Sharper than the old 14–18px — documents, not bubbles.
- Depth: hairlines first; one shadow (`--lift`) only for things that float (menus, modals, toasts, hover lift).

### Motion
- 140ms state changes, 220ms entrances, `cubic-bezier(.2,.7,.2,1)`; exits faster than entrances.
- Page enter: fade + 6px rise, children staggered 30ms (max 8).
- Hover: sheet lift 1px + shadow; buttons darken; nav marker slides.
- Skeleton shimmer for every server wait (Director answer, server audit check, reports).
- `prefers-reduced-motion`: all of it off.

## 4. Shell (revised 2026-11-16, "Evidence Desk" — see STRATEGY.md)
- **Workflow bar instead of a sidebar.** Top row: wordmark, company switcher (+ new company), command button (Ctrl/⌘ K, `/`), AI status, settings gear, language, account menu (email, settings, sign out). Second row: the four stages `01 Understand · 02 Diagnose & decide · 03 Create · 04 Measure & improve`, each with its pages (short labels; full name in `title`), pending counts, a vermilion underline on the current page.
- **Next strip** (every page except the Briefing): the six journey segments (each opens its stage) + the single next step and its button.
- **Command menu**: pages, actions, companies, campaigns, audit findings, facts; anything typed can be sent to the Director.
- **Knowledge triage keys**: J/K move, A approve, R reject (legend pinned at the bottom of the Knowledge Hub; hidden on touch).
- **Mobile (<820px):** the top row wraps (search on its own line), the stage bar scrolls sideways with a fade edge; Settings via the account menu.

## 5. Screen compositions
- **Dashboard → "Briefing".** "Needs you" decision queue first, then masthead (date, company, objective) · KPI ledger strip (numbers on hairlines, not cards) · numbered priorities (01/02/03) with evidence and the same actions · health scorecard rows with segmented meters · campaigns and an activity timeline in a side rail.
- **Marketing Director → "Advisor desk".** Conversation in a reading column (question in ink, answer as a sheet with a signal rule, citations as footnotes, proposed actions in a tray), a sticky composer, and a context rail (what the Director knows, how answers are made, suggested questions, Claude import/export).
- **Audit → "Findings dossier".** Each finding is a sheet with a coloured kind spine, serif title, and a two-column spec list.
- **Auth → split cover.** Brand statement on ink, form on paper.
- Every other screen inherits the new header, sheets, tables, tabs, forms, badges, notes, empty states and skeletons.

## 6. Components (class → role)
`.card` sheet · `.btn` / `.pri` (ink) / `.sm` / `.dng` · `.badge` + `b-*` statuses · `.note` (+`.w .b .g`) callouts with icon rule · `.tabs` segmented control · `table` ledger table · `.empty` empty state with icon · `.sk` skeleton · `.toast` · `.modal` · `.rec` finding sheet · `.kpi` / `.ledger` · `.hl` health row.

## 7. Icons
Lucide (ISC licence, commercial use permitted), inlined as SVG paths in `IC` (no network request). 1.75 stroke, 18px in navigation, 16px in buttons.

## 8. Known limits / deferred
- Dark mode not built (tokens are ready for it).
- Fonts load from Google Fonts; offline, the stack falls back to system UI fonts.
- The single-file prototype `BrandPilot.html` is untouched (reference only).
