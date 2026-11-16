# Pass 4 — replace the UX model (owner brief of 2026-11-16 + ready-to-build plan)

**Status: 4.1 and 4.2 done. Next: apply the shell and look to the other screens (§5).**
Branch `redesign/new-product-identity`. Push after every screen (`git push`). **Never merge into `dev`** until the owner approves.
Previous passes ("Ledger" look, "Evidence Desk" workflow bar, pass-3 Knowledge review desk) were **rejected by the owner** as a visual reskin. Do not polish them; replace them.

## 1. Owner brief (summary, owner's words where possible)
- "This is a visual reskin, not the fundamental UX and product redesign I requested." Stop adjusting the beige palette, serif type, compact navigation and current screen arrangements.
- Problems seen in the rendered app: overcrowded navigation, weak hierarchy, too much small text, scattered interactions, screens that feel like admin tools, little focus on the customer's goals, not different from ordinary SaaS dashboards.
- Design from the customer's goals: (1) understand my company, (2) understand performance across all platforms, (3) know what works and what to improve, (4) get intelligent recommendations, (5) create professional branded campaigns, (6) review, approve and improve results. Do not make one page per feature; combine or restructure workflows where that helps.
- Use the `ui-ux-pro-max` skill for IA, navigation, workflow, layout, hierarchy, interaction, forms, accessibility and responsiveness, not just colours.
- **Knowledge Hub first.** Goal: help a company build a trustworthy knowledge base the whole marketing system uses. Users must be able to:
  - understand what BrandPilot learned
  - see what needs attention
  - review evidence naturally
  - resolve conflicts and correct details
  - approve safely and see what is missing
  - see how approved knowledge feeds campaigns and recommendations

  It must work with hundreds of facts. Bulk review must not encourage blind approval of unsupported claims. Keep evidence, status, versions, conflict resolution and data integrity.
- Quality bar: clear identity, excellent type, strong hierarchy, comfortable density (**do not shrink text to fit more**), clear primary actions, discoverable interactions, responsive, accessible, EN + AR/RTL equal.
- Then apply it everywhere, in this order:
  1. onboarding and brand identity
  2. analytics
  3. Audit and the Director
  4. Studio and Canva
  5. QA and approvals
  6. integrations, settings and navigation

  Keep every feature and the backend as it is.
- Work in small verified increments; update `IMPLEMENTATION_STATUS.md` and `NEXT_AGENT_PROMPT.md` each time; spend tokens on code, not reports.

## 2. Direction chosen (three models considered)
| | A. Feature workflow bar (current) | B. AI-feed home (everything as cards in one stream) | **C. Goal workspace (chosen)** |
|---|---|---|---|
| Navigation | 14 links in 4 stages | one feed + search | **dark left sidebar with the 6 customer goals**; a goal's sub-pages become tabs at the top of the page |
| Why not / why | owner: overcrowded | hides structure, hard to find things again | conventional and easy to learn, but organised by outcome, not by module |

ui-ux-pro-max output used (`--design-system "marketing intelligence SaaS B2B confident modern" --density 6 --variance 4`; `--domain ux "bulk actions review queue"`; `--domain typography "arabic latin sans pairing"`):
- **Type: Plus Jakarta Sans** for headings and UI, **Noto Sans Arabic** for Arabic. Body 15.5–16px. h1 28px/700. No serif, no mono uppercase labels.
- **Neutrals** from the skill: background `#F4F6FA`, surface `#FFFFFF`, border `#E2E7EF`, text `#0E1726` / `#3A4556` / `#5E6A7D`.
- **Brand: cobalt `#2F55E4`** for primary buttons, current item and focus; hover `#1B3BB8`; tint `#EAF0FF`. Sidebar navy `#0C1422`. Status colours stay semantic only (`--pos/--neg/--warn/--info`).
- **Rejected from the skill:** glassmorphism (contrast risk on data screens) and the orange CTA (one accent is enough).
- **Bulk actions** (skill: "checkbox + action bar") — with a safety rule, see §4.

## 3. Task 4.1 — new identity + goal shell (one commit)
File: `public/index.html` only.
1. `<head>` fonts link → `Plus+Jakarta+Sans:wght@400;500;600;700;800` + `Noto+Sans+Arabic:wght@400;500;600;700`; `theme-color` `#F4F6FA`.
2. Append at the END of `<style>` a `:root{...}` override:
   - `--paper:#F4F6FA; --paper-2:#EBEEF4; --surface:#fff; --surface-2:#F8F9FC`
   - `--ink:#0E1726; --ink-2:#3A4556; --ink-3:#5E6A7D; --rule:#E2E7EF; --rule-2:#CDD5E1`
   - `--signal:#2F55E4; --signal-soft:#EAF0FF`; new `--brand:#2F55E4; --brand-ink:#1B3BB8; --side:#0C1422`
   - `--f-display`, `--f-ui` and `--f-mono` all → `"Plus Jakarta Sans","Noto Sans Arabic",system-ui,sans-serif`
   - `--r-1:8px; --r-2:12px`

   Then: `.btn.pri{background:var(--brand);border-color:var(--brand)}`, `h1{font-weight:700;font-size:28px;font-variation-settings:normal}`, `body{font-size:15.5px}`. Kill every uppercase label with a script: collect all selectors in `<style>` whose rule has `text-transform:uppercase` and emit `sel{text-transform:none;letter-spacing:0}`.
3. In `render0()` replace the `<header class="tb">…</header>` shell with:
   - `<aside class="side">`, containing:
     - logo
     - company select (`id="coSel" data-c="setCo"`, keep) + new company (`data-a="newCo"`)
     - goal nav: one `data-a="go" data-v="<first view>"` button per goal, using the GOALS table below; badge = pending facts on Company, stale campaign items on Review
     - footer: Automation (`auto`), Settings (`trust`), language (`data-a="lang"`), account `details.acct` with sign out (`data-a="logout"`)
   - `<div class="scrim" data-a="navT">`
   - `<div class="work">`, containing:
     - `<header class="wtop">`: menu button (mobile, `data-a="navT"`), page tabs for the current goal's views (only when the goal has more than one), the command button (`data-a="cmdk"`, keep `aria-keyshortcuts`), `aiBadge()`
     - `${nextStrip(c,v)}`
     - `<main id="main">`
   - Remove the J/K/A/R legend (`.kh`).
4. GOALS (view keys must not change — `S.ui.view`, `data-a="go"` and the command menu use them):
   - Home → `dash`
   - Your company → `know`, `onboard`
   - Performance → `analytics`, `integ`
   - Insights → `audit`, `growth`
   - AI Director → `director`
   - Create → `studio`
   - Review & publish → `qa`, `export`
   - Footer: Automation → `auto`; Settings → `trust`
5. Actions:
   - `A.navT` toggles `S.ui.navOpen`.
   - Wrap `A.go` so it also closes the nav.
   - Escape closes the nav.
6. `ph()`: the eyebrow shows the goal name instead of `STAGE()`.
7. CSS:
   - `.app` grid `248px | 1fr`; `.side` sticky, full height, navy background, items 14.5px/550; the current item gets a `#1D2B47` background and an inset brand bar (mirror it in RTL)
   - `.wtop` sticky, 60px, translucent paper background with a bottom border
   - `main` padding `28px 32px 80px`, max-width 1240px
   - **≤900px:** one column; `.side` is an off-canvas drawer (`translateX(-100%)`, `100%` in RTL; `.open` shows it); the scrim shows; the menu button shows; the command button text is hidden
8. Check: all 14 views open from the sidebar and the tabs; command menu (Ctrl K and `/`) still works; EN + AR; 390px wide with no horizontal scroll; `npm test` passes.

## 4. Task 4.2 — Knowledge Hub as a "Company profile" (one commit)
Replace `V.know` and pass 3's `KD` / `kdRow` / `.kd-*` / `A.kSel` / `kApprove`-`kReject` wrappers and key handler (bottom of the script). **Keep** `findCard`, `kScope`, `kDialog`, `kBulk`, `kGo`, `kCat`, `kApprove`, `kReject`, `kUnreject`, `kKeep`, `kAnswer`, `kAdd`, `kEdit`/`kSave`, `kPrimary`, `brandEdit`, `kPublish`, `brandBox`, `themeHint`, `themeForm` — the new UI calls the same actions.

Page structure, top to bottom:
1. **Header.** Title "Company knowledge". Lede: "What BrandPilot knows about {name}, where each statement comes from, and what still needs you." Actions: "Add a source" (`go onboard`); "Review all N pending" (`kBulk` — the existing dialog that separates claims).
2. **Summary band.**
   - A progress ring of confirmed vs to-check.
   - The headline: "BrandPilot has learned N things about {name}"; then "X confirmed · Y to check · Z of 9 essentials covered". Essentials are the `REQ` categories: overview, products, audiences, markets, diff, tone, ctas, acquisition, competitors.
   - A "Only confirmed knowledge is used by" line with links: AI Director (`director`), Campaign Studio (`studio`), Brand QA (`qa`).
   - Version box: the version in use (`c.kver`) with date and count; "Publish vN" (`kPublish`) when `c.kdirty`; a history list (in `<details>`) with export (`data-a="ex" data-v="knowledge"`). Show the "proposed updates" (`isNew`) note here.
3. **"Needs you first"** (only if not empty):
   - **Conflict card per pending `type==='conflict'`.** Show the disagreement text, then each `confOpts(c)` option side by side: text, quoted evidence, source and date, and "Keep this one" (`kKeep`). Below them: "Neither — mark resolved" (`kReject` on the conflict).
   - **Question card per pending `type==='unknown'`.** Show the `reqQ(cat)` question and "None of your sources says this; your answer becomes confirmed knowledge with you as the source", with the inline `form data-s="kAnswer" data-v=id`.
   - **Missing essentials** (no fact at all): chips that jump to the section.
4. **Profile document.** Two columns: a sticky contents column on the left and the chapters on the right.
   - The contents column has a search box (`data-i="kQ"`, filters statements by text) and each section with a status dot (confirmed / to check / missing).
   - The right column holds five chapters:
     - Who you are: overview, model, markets, competitors
     - What you sell: products, offers, value, diff, claims
     - Who you serve: audiences, acquisition, channels, campaigns
     - How you sound: positioning, personality, tone, pillars, themes, restrictions
     - Brand identity & calls to action: brandid (+ `brandBox(c)`), ctas
   - Any category not listed goes into an "Other" chapter.
   - **Each section:**
     - Header: name, status chip, and "Confirm the N quoted" (`kGo` with `plain|<cat>` — source-stated only).
     - A "Used for:" line for the categories that really feed campaigns: products → proof points; offers → campaign offer (checked by Brand QA); ctas → calls to action (checked by Brand QA); tone → tone of campaign copy; brandid → colours, font and logo of every design; themes → post tags in Analytics.
     - Pending rows first, then confirmed rows: the first 5, then "Show all N" (`S.ui.kOpen[cat]`).
     - An empty state: the `reqQ` question for essentials, otherwise "Nothing in your sources about this yet".
     - "+ Add a fact" (an inline `kAdd` form with a hidden `cat`); for themes, `themeHint` + `themeForm` instead.
     - Conflict options and `unknown` facts are not listed in sections; they are in "Needs you first".
   - **Pending row:**
     - Checkbox (`data-a="kPick"`).
     - Statement in readable 15.5px text with colour swatches if `f.colors`.
     - The evidence as a quote with the source name.
     - When not `supF`, one plain sentence saying why it needs a decision: claim → "confirm only if true and provable"; interpretation → "check the wording"; hypothesis; brand read from the website; `noEv` → "cannot be confirmed until edited or a source is added".
     - Buttons "Confirm" (`kApprove`, hidden when `noEv`), "Dismiss" (`kReject`), "Evidence & edit" (`kEv`).
   - **Confirmed row:** a small check, the statement, the source (+ type if not a plain fact, + "Primary CTA"), and "Details" (`kEv`).
5. **Dismissed (N)** in `<details>`, with "Restore" (`kUnreject`).
6. **Bulk bar** (fixed at the bottom while `S.ui.kPick` is not empty).
   - Shows "N selected" and either "M need individual review and will be skipped" or "All are quoted from your sources".
   - Buttons: "Confirm M" (only `supF` facts that pass `brandOk(c,f,true)`, via `approveF`), "Dismiss N", "Clear".
   - **Claims, interpretations, hypotheses and unevidenced facts are never confirmed in bulk.**
7. **Evidence drawer** (`S.ui.kEv`; a side sheet on the end side, full screen on mobile).
   - Scrim (`data-a="kEvX"`); header with the category and "Check this statement" / "Confirmed knowledge"; a close button.
   - Body: `findCard(c,f)` (keeps edit, brand editor, conflict options, approve/reject), then **"Where it appears in {source}"**: about 280 characters either side of `f.ev` found in `source.text`, with the quote in a `<mark>`.
   - Escape closes it and focus returns to the button that opened it.

New actions:
- `kPick(id)` toggles `S.ui.kPick`; `kPickGo('ok'|'no'|'x')`.
- `kEv(id)` / `kEvX()`; `kMore(cat)`; `kJump(cat)` (scrolls to `#ks-<cat>`, no smooth scroll under reduced motion); `kQ(value)`.
- Wrap `A.go` so it closes the drawer.

Mobile: one column; the contents column shrinks to the search box; the drawer fills the screen; the bulk bar stays at the bottom.

Check (record results in the status file):
- Pick a pending fact → open the evidence → edit the text → confirm.
- Resolve the conflict and answer the question.
- Select 3 rows including a claim → bulk confirm (the claim stays pending).
- Dismiss → restore; publish a version.
- Search; EN + AR; 1440px and 390px; `npm test`; screenshots before and after.

## 5. After 4.1 + 4.2
Apply the same shell and identity to the other screens in the owner's order (§1). The remaining specs in `PASS3_TASKS.md` §2–5 (Analytics scoreboard, single Sources intake, Studio review step, QA as the last step of a campaign) still describe the right content changes.

## How to run a safe copy
```
npm install && npm test
cp data/brandpilot.db* <tmp>/ && PORT=3100 BRANDPILOT_DB=<tmp>/brandpilot.db npm start
PORT=3100 npm run seed:dev     # local dev login (scripts/seed-dev-user.js)
# browser console, local copy only: const c=C();c.demo='flownest';A.loadDemo();R()
```
