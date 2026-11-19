# BrandPilot — Trust & UI audit (2026-11-19)

Audit of the BrandPilot codebase against two goals set by the owner:

- **Part A — Trust ("Evidence Layer")**: every recommendation checkable; no invented numbers; useful "not enough data"; governed facts; track record; unchangeable audit trail.
- **Part B — Simple UI** around three questions, each within 2 clicks of login:
  (1) How is my marketing doing? (2) What should I do next, and why? (3) Give me a campaign I can use.

Folder contents:

- `README.md` — this report. Sections 1–6 were written against **`main` (aba13ba)**. The owner then chose to build on **`dev` (7566b18)**, which is 144 commits ahead; read **"Update for dev"** below first — it lists what is different on dev.
- `screenshots-before/` — **dev** (7566b18), every screen before any change, EN + AR, desktop 1366 px (`NN-view-lang.jpg` = full page scaled to 70%, `-fold.jpg` = first screen at full size; JPEG to keep the repo small), mobile 390 px for Home, the Director chat (rules engine — no AI key was set) and the open guide. All use the app's own **synthetic FlowNest demo data** (on dev no UI path creates a demo company; the audit set `c.demo` the way `seed()` does). In full-page captures the sticky header and sidebar can look odd; these are capture artifacts.
- `screenshots-main/` — first-screen shots of the old `main` screens (history only).
- `scripts/` — the Playwright scripts used for the `main` screenshots (`run.mjs`, `run2.mjs`); written for a throwaway copy on port 3917 with `BRANDPILOT_DB=:memory:`; paths inside need adjusting.
- Later phases add `screenshots-p0/`, … with after-shots.

## Update for dev (7566b18) — read this first

**Base branch.** Owner's decision 2026-11-19: all phases build on `dev`. Baseline `npm test` on dev: **355/355** (the "620" in dev's notes counts differently).

**Parallel session.** A second session ("UX RECOVERY", batches B1–B4 on branch `improve-UIUX`) is already simplifying the shell, Knowledge, Insights/Home and Studio. By the owner's decision, **P0 was handed to that session** so only one session edits `public/index.html`. The exact P0 list it received is section 7 below.

**What changed on dev that affects this report**

- **Live connections exist:** `server/meta.js` (Facebook Pages + Instagram, read-only) and `server/google.js` (GA4 + Search Console, one consent) return rows into the normal import pipeline. Canva is connected too. They need app credentials in `.env`; real checks wait for the owner's developer apps. Competitor gap #1 is therefore **partly built** (Meta, Google); TikTok, Snapchat and LinkedIn are not.
- **Currency per company** exists (`company_settings.currency`, default EGP, shown as ج.م in Arabic). The report still prints raw numbers with `toLocaleString('en-US')`.
- **Part A item 2 — partly improved:** `server/recs.js` (post drafts) returns `warnings` for numbers that appear neither in the topic nor in an approved fact. The Director (`server/director.js`) still does not check numbers inside its answer text; it now also cites `channel` ids and keeps conversation history (history is "never a source").
- **Part A item 4 — unchanged:** `server/knowledge.js` is identical to `main` (no approver, date or expiry).
- **Navigation on dev:** Home · Your company (Sources, Company knowledge) · Your data · Insights (Audit, Growth & leads) · AI Director · AI Content Series · Campaign Studio · Review & publish (Brand QA, Export) · Performance · Improvement · Settings, plus a Ctrl K command menu. The old `nav()` still feeds the command menu with old labels.
- **Clicks on dev (FlowNest):** Q1 0 clicks (KPI cards on Home; no plain-words verdict), Q2 0 clicks + scroll (Home "Priorities this week"), Q3 2 clicks to 12 template assets (placeholders such as ⟦p2⟧ still visible), +2 to download.
- **Design system on dev:** two token layers (the original `:root` and a redesign override; only Plus Jakarta Sans + Noto Sans Arabic are actually loaded), ~191 hard-coded hex colours, no dark mode, `series.css` separate, `design-system/brandpilot/MASTER.md` exists. Dates mix Western and Arabic-Indic digits (Home hero uses `ar-EG`; elsewhere `ar-EG-u-nu-latn`) — the owner's per-company digit setting (P1) fixes this. `--ink-4` small text ≈ 3.6:1 (estimate).

## 7. P0 targets on dev (handed to the UX RECOVERY session)

Line numbers as of 7566b18, `public/index.html`.

- **Wrong copy:** Settings subtitle (4381) and "Your data" bullets (4382: "stored in this browser's local storage… Nothing is uploaded", "kept locally"); capability table (4380: multi-user "Local only", website crawling "blocked / companion service", OAuth "not implemented", extraction "runs in this file / Claude", Director "Claude for reasoning", FlowNest row leaking demo names); AI-provider radios (4385–4386: "No data leaves the browser" is false — server AI is used unless mode = endpoint, see 4609) → keep, collapse under "Advanced", true wording; Sources extractor sentence (3003); "Computed in your browser — not yet verified on the server" badge (3207, 3188) → calm wording; companion-service toast (4560) and "(PDF, Word, text)" (2966, Word is never read); "too large for browser storage" (4554, 4650); rules "outside" answer (2501); old labels in the command menu (`nav()` 2706).
- **Demo:** gating on `c.demo` works; only the Settings FlowNest row leaks. Note: `seed()` (4875) is never called — no UI path creates a demo company.
- **Text direction:** rules-engine Director answers stored as HTML without `dir` (templates around 2481–2510) → English answers flip punctuation in Arabic (`screenshots-before/18-director-chat-ar-fold.jpg`). AI answers are fine.
- **Names:** `newCampaign` (2551) cuts the recommendation title at 48 characters; repair existing names from `recTitle`; add `title` where names end in a CSS ellipsis; rules-Director "Add task:" labels cut at 34/30.
- **Periods (label only; P1 aligns numbers):** Audit = all rows; Home / Performance / Growth = selected period (default 28 days); learning log = campaign-tagged rows; Studio "Why this campaign" = snapshot at creation; report = period KPIs + all-rows findings. Example: Organic Social enquiry rate 0.34% (Audit, all rows) vs 0.50% (Performance, 28 days) on the same page.

## Owner decisions (2026-11-19)

1. Arabic digits: **per-company setting**, default Western (1,234), Arabic-Indic (١٬٢٣٤) optional.
2. Playwright: added to the repo as a **dev dependency** for UI tests.
3. Phase order: **P0 → Phase 4.5 → P1 → P3 → P2 → P4 → P5 → P6.** P2 (new navigation) must be reconciled with the UX RECOVERY batches B1–B4 already in progress on `improve-UIUX`. If the AI key is not in `.env` when Phase 4.5 is reached: tell the owner, skip 4.5 and P3 for now, continue with P2. **Never fake or mock the AI in a demo path.**
4. The owner puts the key in `.env` personally; never ask for it in chat.
5. P1 moves all recommendations to the server. **Before changing anything**, a regression test records today's recommendations for the FlowNest demo data; after P1 results must match, or every difference is listed with a reason.
6. Every phase keeps all existing tests passing (138/138 at the start).

---

## 1. Part A — what exists today

| # | Item | Status | Where | Gap |
|---|---|---|---|---|
| 1 | Evidence card | **Partly** | `server/audit.js` items carry `basis`, `why`, `action`, `evidence[]` (`text`, `metric`, `value`, `rows`, `factId`); browser cards carry `conf` high/med (`public/index.html` `recCard`, audit export) | No calculation shown (thresholds `T` never surfaced); no per-item period — the server audit uses **all** rows while Analytics uses the selected period, so one rate shows three values on three screens; assumptions mixed into evidence lines; server has no confidence; browser has no "Low" and no reason |
| 2 | No-invented-numbers check | **Partly** | `server/director.js` `checkSupport` drops cited ids not in the context and flags `unsupported`; `server/campaignQa.js` flags %, "#1", guarantees, mismatched offer durations | Numbers **inside the answer text** are never extracted or matched. Pasted "Import Claude answer" content is only labeled |
| 3 | Useful "not enough data" | **Mostly** | `insufficient` items with `needs` in `audit.js`, some quantified; metrics return `null` + reason, never 0; Director returns `needs` | Not structured as have / need / unlocks; no "what you get"; Arabic wording static (`SRV_AR`) without live counts |
| 4 | Approved facts with approver / date / expiry | **Partly** | `server/knowledge.js`: approved needs an evidence quote or manual entry; QA matches CTA / offer text to approved facts | Approval is a browser change (`approveF`) sent in the state blob: the server cannot say who or when. No review/expiry date. Campaign uses are matched by text, not linked by fact id |
| 5 | Track record | **Not built** | Nearest: `campResult` / `learn` (campaign verdict vs non-campaign traffic) | Recommendations are recomputed, never saved, and carry no predicted result |
| 6 | Audit trail | **Partly** | `reports` snapshots are immutable; `data_mirror.hash` is a data fingerprint; Director returns `model` | Activity log is browser-side and editable; no server log per recommendation; no prompt version |

**Root cause for 4–6:** the browser's state blob is the source of truth and the server mirrors it. Anything that must be attestable has to move to server-owned, append-only tables written by dedicated endpoints.

---

## 2. Screen audit (before)

### Navigation (13 items in 5 groups)

| Group | Item | View |
|---|---|---|
| Understand / افهم | Dashboard, Company sources, Knowledge Hub (pending-count badge) | `V.dash`, `V.onboard`, `V.know` |
| Diagnose & decide / شخّص وقرّر | Marketing Audit, Marketing Director, Growth & Leads | `V.audit`, `V.director`, `V.growth` |
| Create / أنشئ | Campaign Studio, Brand QA & History | `V.studio`, `V.qa` |
| Measure & improve / قِس وحسّن | Analytics, Automation | `V.analytics`, `V.auto` |
| System / النظام | Integrations & Data, Export & Delivery, Trust & AI settings | `V.integ`, `V.export`, `V.trust` |

Topbar: company select, + New company, AI-mode badge, language switch, email, Sign out. Floating "Demo guide n/15" on every screen.

### Per screen

| Screen | Goal | Noise |
|---|---|---|
| Dashboard | How am I doing? | 7 health tiles fill the first screen; KPIs below the fold; 3 huge recommendation cards (8 rows + 3 buttons) repeat the Audit; "Priority basis 3/3…" jargon; red Weakness/Risk badges read as errors; developer-ish activity log; 2,312 px tall (4,934 px on phone) |
| Company sources | Give materials | Engine talk ("companion service", "running in your browser", "With Claude attached"); character-count badges; numbered steps split across cards |
| Knowledge Hub | Approve what is true | 8,480 px, 184 controls; Reject/Edit even on approved facts; 8 badge types; red Claim/Conflict badges; pipe-delimited portfolio rows; "Knowledge versions / publish" is a power-user concept |
| Marketing Audit | Full diagnosis | 23 cards, ~80 badges; "Computed in your browser — not yet verified on the server" ×13; same health tiles as Dashboard; 6,589 px |
| Marketing Director | Ask for advice | Developer actions on top (Export context / Import Claude answer); stale "No language model is running in this file"; 13 chips; English answers flip punctuation in Arabic (no `dir="auto"`); truncated "Add task" labels |
| Growth & Leads | Lead quality | Repeats 6 Audit cards; lead-definition editor mid-report; statistics caveats inline; experiment submit button without visible label |
| Campaign Studio | Get a campaign | 4 tabs, 16 brief fields; Brief and Change-impact duplicate fields; `utm_campaign=` and "not model-written" badges; "Why this campaign" numbers differ from Audit without label |
| Brand QA & History | Check before sending | Three wordings for "verified"; really a campaign step; "Approve all assets" buried |
| Analytics | Numbers in detail | Repeats 6 Dashboard KPIs; "What needs attention" is a third copy of priorities; rates differ from Audit (different windows, unlabeled) |
| Automation | Tasks & learning | Mixes tasks, log, weekly summary, checklist duplicating the Demo guide; stale "a static file cannot run on a schedule" |
| Integrations & Data | Bring data in | Grey "Not connected" beside imported data reads as failure; [Connect…] leads to an explanation only; roadmap essay |
| Export & Delivery | Download | 8 identical Download buttons; developer-only exports; a second period control |
| Trust & AI settings | Settings | **Wrong:** "stored in this browser's local storage… Nothing is uploaded", "Local only: one browser"; debug AI-mode radios; internal "product decisions" notes |

Cross-cutting: same metric with different values and no period label; campaign names cut at ~48 characters; Demo guide and demo buttons shown to real accounts; no web font (Arabic falls back to Tahoma); numbers forced to `'en'`, Western digits; currency hard-coded "EGP" (wrong for the Gulf and Europe); tabs without arrow keys; modals without focus trap; muted text ≈ 4.4:1.

**Clicks today:** Q1 0–1 + scroll past tiles; Q2 has **seven competing answers** (Dashboard, Audit, Growth, Analytics, Automation, Director, weekly summary); Q3 4+ clicks to a usable package.

### Every feature / control (so nothing is dropped later)

- **Global:** navigation, mobile menu, company switch, new company, language, sign out, demo guide, modals (Escape), skip link, toasts.
- **Auth:** login, register, language toggle, field errors.
- **Dashboard:** period, review banner → Knowledge, health "Show checks", recommendation → task / campaign / experiment, open full audit, Campaign Studio link, activity, empty-state hero.
- **Sources:** basics (name, industry, website, objective, Facebook/Instagram/LinkedIn), read website (`fetchUrl`), file upload (text; CSV routed to import; images become assets), paste source, remove source, run discovery, load synthetic demo.
- **Knowledge:** filters, approve, reject / mark resolved, edit, make primary, answer question, add fact, bulk approve, knowledge versions / publish, knowledge JSON export, ask the Director, portfolio analysis.
- **Audit:** tabs, audit MD export, recommendation → task / campaign / experiment, server verification.
- **Director:** questions (chips + free text), clear, export context, import Claude answer, per-answer "Add task", server AI.
- **Growth:** period, lead definitions, segment and source tables, funnel, 30/60/90 objectives, experiment chips, custom experiment form, delete experiment, significance test.
- **Studio:** campaign select / new / delete, tabs, brief fields, channels, name, target, generate, asset select, format, copy fields, design fields, image upload, approve / download / reset / review asset, landing-page preview, calendar and UTM CSV, change impact (CTA, offer, message, audience, objective, tone, colours, font, term replace, apply), jump to asset.
- **QA:** approve all, version diff, jump to asset, server QA.
- **Analytics:** period, platform tabs, trend metric, table view, turn into task, create experiment.
- **Automation:** generate weekly summary, auto weekly, learning log, adjustment → task, task table (status, delete), activity history, weekly MD.
- **Integrations:** connect (explanation modal), import CSV/JSON ×5, template ×5, remove data ×4, demo fixtures (base, campaign), import history.
- **Export:** campaign zip / strategy / calendar / JSON, executive summary, audit MD, knowledge JSON, Claude context package; marketing report (range, preview, download MD, printable, save), automatic report (off / weekly / monthly), saved reports.
- **Trust:** export / import company JSON, delete company, delete all, AI mode (rules / bridge / endpoint), endpoint URL + test, "what would be sent" JSON, capability table.

### Design system state

- One `:root` colour token block; no spacing or type scale (11–17 px hard-coded); raw hex outside tokens; no dark mode.
- Reusable classes: `.card`, `.btn`, `.badge` (9 variants), `.tabs`, `.rec`, `.note`, `.empty`, `.kpi`, `.chip`, `.modal`, `.toast`; JS helpers `ph`, `empty`, `kpi`, `healthTile`, `recCard`, `rangeSel`, `syn`.
- Same colour means different things across badge sets; same concept has 3–4 wordings.
- Fonts: no web font loaded; Arabic depends on the OS.
- Numbers: `toLocaleString('en')`, hand-built signs, literal "EGP"; dates `ar-EG-u-nu-latn`; ISO ranges not always isolated with `dir="ltr"`.
- Accessibility: good skip link, focus outline, `aria-current`, tablists, live toasts, reduced motion. Missing: arrow keys in tabs, modal focus trap/return, unique names for repeated buttons.

---

## 3. Proposed navigation — 13 items → 5 + 2

Main: **Home** (Q1, lands on the #1 next step) · **Next steps** (Q2, with Director chat) · **Campaigns** (Q3) · **Reports** · **Company** (sources + facts). Footer: **Data**, **Settings**.

Clicks after: Q1 = 0 (Home is the landing page); Q2 = 0 for the top step, 1 for the list; Q3 = "Make campaign" on a step creates brief **and** drafts (1) → "Download package" (2).

| Today | Moves to | How |
|---|---|---|
| Dashboard KPIs, period | Home | Top: 4–6 KPIs with change and period, data-freshness line |
| Health tiles | Home | One summary row; "See checks" expands |
| Dashboard priorities, Audit cards, Growth strategy, Analytics "attention", Automation adjustments | Next steps | Merged into one ranked list: one line + **Why?** |
| Audit tabs, audit MD export | Next steps (filter, collapsed); export → Reports | |
| Director chat, chips | Next steps | "Ask" box at top; 4 chips, more on demand |
| Export context / Import Claude answer / endpoint / AI-mode radios / "what would be sent" | Settings → Advanced | Hidden, marked technical |
| Analytics | Home → "All numbers" | Drill-down; insights become Next-steps items |
| Growth funnel, segment/source tables | Home → "Leads" tab | Lead definitions → Company → Settings |
| Experiments, significance test | Next steps | Action type "Test" + "Tests" tab |
| Tasks | Next steps → "My tasks" | One task list for the app |
| Learning log, verdicts | Campaigns → Results + Track record | |
| Weekly summary | Reports | |
| Studio brief, assets, calendar, UTM | Campaigns → campaign page | Steps: Brief → Drafts → Check & download |
| Change impact | Campaigns → Brief | Merged; editing the brief shows impact |
| Brand QA, versions, Approve all, campaign exports | Campaigns → "Check & download" | |
| Marketing report, saved, schedule, printable, exec / knowledge exports | Reports | |
| Claude context package, campaign JSON | Settings → Advanced | |
| Sources, website scan, social URLs, discovery | Company → Sources | |
| Knowledge Hub (all actions) | Company → Facts | "To review" default; approved facts compact |
| Integrations, import, templates, remove data, history | Data | "Not connected" → "File import" |
| Activity history | Settings → Activity | Later backed by the server trail |
| Export / import / delete company | Settings → Company data | |
| Capability table, product-decision notes | Removed from UI → docs | Only true removals (internal notes) |
| Demo guide, load demo, demo fixtures | Demo companies only | |

## 4. Main screens after (where Part A appears)

- **Home:** KPI row with period and "data up to {date}"; one-line health summary; **one "Your next step" card** (Why? / Make campaign); track-record chip ("7 of last 10 on target" or "Not enough history yet: 2 evaluated").
- **Next steps:** ranked one-liners, confidence chip, one action each. **Why?** opens the evidence card: data used (rows, source file, period), calculation (e.g. "7 enquiries ÷ 2,076 sessions = 0.34%; site 1.31%; rule: below 50% of average"), assumptions, confidence + reason, approved facts used (linked), engine, computed time. Ask box answers inline; numbers are checked — verified ones link to their source, unmatched ones show calm "unverified"; an answer whose core claim is unverified is blocked.
- **Campaigns:** list → campaign page in three steps; "Based on: {step} (Why?)"; "Facts used: 6 approved"; copy claims link to facts; expired/unapproved facts block download with a one-line fix.
- **Company → Facts:** review queue first; approved list shows approver, date, "review by"; "Expiring soon" filter.
- **Reports:** one period control shared with Home; snapshots freeze evidence cards and trail ids.
- **Settings:** correct storage statements; debug under Advanced.

Design system: keep vanilla JS; extend tokens (spacing, type scale, semantic trust tokens) and existing helpers; add an evidence-card component; ship IBM Plex Sans Arabic locally; `Intl` for numbers, dates, currency; company currency (EGP, SAR, AED, EUR…) and digit setting; trust states in calm blue/grey, red only for real problems. A framework rewrite is not clearly better: the frontend has no tests yet and a rewrite would risk every feature at once.

## 5. Top competitor capabilities BrandPilot lacks

| # | Capability (who) | Importance | Size |
|---|---|---|---|
| 1 | Live Meta / Google Ads / GA4 / Search Console / TikTok / Snapchat connections (MATTE, HubSpot, Converted) | Very high | L: Google (GA4 + GSC) ~2 wks; Meta ~2–3 wks + app review; TikTok, Snapchat ~2 wks each. Feeds existing `data_rows`. |
| 2 | Store revenue — Shopify / **Salla / Zid** (Converted via Shopify) | High for Gulf D2C; **no competitor found covering Salla/Zid** | S: orders CSV import; M per live connector |
| 3 | WhatsApp as lead / conversation channel (Lucidya, HubSpot beta, Converted) | High in Egypt and the Gulf | S: lead source + click-event template; L: Cloud API messaging |
| 4 | Running ads — launch, budgets, bids (Converted, MATTE) | High for e-commerce | XL; conflicts with approve-first. Later: push approved campaign as a paused Meta draft |
| 5 | Publishing & scheduling with approvals (HubSpot, Okara, MATTE) | Medium–high | L (Meta publishing app review) |

Not listed on purpose: Arabic social listening (Lucidya, dima) — a different category.

## 6. Phase plan (owner's order: P0 → 4.5 → P1 → P3 → P2 → P4 → P5 → P6)

S = 1–2 days, M = 3–5 days, L = 1–2 weeks.

| Phase | Scope | Size | Acceptance |
|---|---|---|---|
| P0 Fix wrong and confusing copy | False storage / AI / scheduling statements; demo UI only in demo companies; `dir="auto"` on answers; full campaign names; period next to rates | S | No screen contradicts the server architecture; real accounts show no demo UI; mixed-language answers read correctly; tests pass |
| 4.5 Real-model check of the AI Director | Needs the owner's key in `.env` | S | Grounded EN/AR answers with traceable support, isolation, empty company |
| P1 Evidence card + trust visuals + tokens | Server audit becomes the only source of recommendations (port remaining browser-only rules or label them); `calc`, `period`, `assumptions`, `confidence`, `confidenceWhy`; audit on selected period; evidence-card component; calm trust styles; Arabic font; `Intl`; currency and digit settings. **First: FlowNest regression test** | L | Every recommendation has a 5-part Why? card in EN and AR; same rate for same period on every screen; tests for confidence reasons; FlowNest differences listed with reasons |
| P3 No-invented-numbers + useful "not enough data" | Structured claims from the model; server extracts every number (incl. Arabic-Indic) and matches with rounding tolerance; unverified marked, core claim blocked; same check on campaign copy; insufficient = have / need / unlocks | M | Tests catch invented numbers, wrong rounding, swapped metrics, Arabic digits, fake percentages; true numbers pass |
| P2 New navigation | Section 3; one-click campaign + drafts; Playwright UI tests | L | Each question within 2 clicks in EN and AR (automated); every feature reachable; keyboard OK; AA contrast |
| P4 Server-side fact approvals | `approved_by`, `approved_at`, `review_by`; campaign fact ids; expired facts block | M | Approver recorded; expired facts excluded with reason; isolation tests; old facts "approved before tracking" |
| P5 Audit trail | Append-only `trail` table: data fingerprint, engine, prompt version, approver, time; reports keep trail ids | M | No route can update/delete trail rows; reports show the trail |
| P6 Track record | Saved steps with metric, baseline, expected direction / target, window; evaluated when data arrives | M | Score only after 5+ evaluated; otherwise "waiting for data until {date}"; attribution limits stated |

### What cannot be built honestly with today's data

- **Confidence** is not a probability: rule-based on sample size, distance from threshold and data completeness, labeled that way.
- **Predicted results**: rules do not forecast; a prediction is an expected direction plus the user's target.
- **Track record** fills only when new data is imported; until live connections exist it is slow and says so.
- **Number check** verifies numbers; a qualitative claim is verified only when it cites an approved fact.
- **Old approvals** have no approver: shown as "approved before tracking began".
