> **Superseded by `PASS4_BRIEF.md`** (owner rejected passes 1–3 as a reskin). Sections 2–5 below still describe useful content changes for later screens.

# Redesign pass 3 — task list for the next developer

Branch `redesign/new-product-identity` (owner review only — **never merge into `dev`** until the owner approves).
Read first: `STRATEGY.md` (why "Evidence Desk"), `MASTER.md` (tokens, type, components). All UI lives in `public/index.html` (one file: CSS in `<style>`, views are `V.<name>=c=>html`, actions are `A.<name>(value, el, event)` wired by `data-a="name" data-v="value"`, forms by `data-s`).

## Rules for every task
1. **Change layout, not behaviour.** Keep every action (`data-a`), form (`data-s`), label, number and warning the screen has today. Business logic, `server/`, `public/compare.js` stay untouched.
2. Use the existing tokens (`--ink`, `--paper`, `--signal`, `--rule`, `--pos/--neg/--warn/--info`, `--f-display/--f-ui/--f-mono`, `--r-2`, `--lift`). No new colours, fonts or libraries.
3. Arabic: logical properties only (`inset-inline`, `margin-inline-start`, `text-align:start`); `dir="auto"` on user text; mono/uppercase labels reset under `[dir=rtl]`.
4. Mobile ≤ 900px: one column, no horizontal page scroll.
5. **One screen = one commit + push** to `origin/redesign/new-product-identity` (owner's rule). Update the "REDESIGN — pass 3" line in `IMPLEMENTATION_STATUS.md` and the top of `NEXT_AGENT_PROMPT.md` in the same commit.

## How to check a screen
```
npm install && npm test            # must stay 545/545 (or more)
# run a copy so the owner's data is untouched:
cp data/brandpilot.db* /tmp/bpdb/ && PORT=3100 BRANDPILOT_DB=/tmp/bpdb/brandpilot.db npm start
PORT=3100 npm run seed:dev         # local dev login from scripts/seed-dev-user.js
```
Demo data in the browser console (local copy only): `const c=C();c.demo='flownest';A.loadDemo();R()`.
Switch language with the العربية button (or `S.lang='ar';R()`). Check: EN, AR, 390px width, console clean.

## Status
| # | Screen | State |
|---|---|---|
| 1 | Knowledge Hub → review desk | **Done** (commit "Knowledge Hub becomes a review desk") |
| 2 | Analytics — Compare channels | To do |
| 3 | Sources (company setup) | To do |
| 4 | Campaign Studio — review step | To do |
| 5 | Brand QA + Export | To do |
| 6 | Integrations & Data, Growth, Automation, Settings (`V.trust`) | To do (lower priority) |
| 7 | Dark mode (tokens are ready, see MASTER §8) | To do (last) |

## 1. Knowledge Hub — done (reference pattern for the others)
`V.know`, `kdRow`, `KD`, CSS `.kd-*`; keys at the bottom of the script (`A.kSel`, wrappers on `A.kApprove` / `A.kReject`).
Pattern: **counted filter strip → dense list → sticky detail pane**. Reuse it where a screen is "review many items one by one".

## 2. Analytics — Compare channels (`cxView`, `V.analytics`, CSS `.cx-*`)
Problem: six identical finding cards with two buttons each, then the table; the reader must scroll to learn which channel leads and whether the lead is trustworthy.
Do:
- **Channel scoreboard first**: one column per channel (Facebook, Instagram, LinkedIn, Organic search, Website). Show the headline numbers, the data period and source / freshness, and a data-sufficiency mark ("Enough data to rank" / "Not ranked: reach 600 of 1,000 needed"). Take everything from the existing `compare()` result (`rank[k]`, `top`, `obs`, `out`).
- Keep the 15b rule: never show a winner without the higher unranked channel and its reason, e.g. Instagram 15.9% "▲ Highest observed — not ranked: …" next to Facebook 3.68% "★ Best eligible".
- Show the **findings as a compact ruled list**: kind badge · sentence · channel. Put "Ask the Marketing Director" / "Plan a campaign" as small buttons at the end of the row (`A.cmpAsk`, `A.cmpCamp`, same `data-v`).
- Below that, keep the side-by-side table, "What this comparison cannot tell yet", Sources and freshness, and the unassigned-leads table unchanged.

Done when the first screen (1440×900) answers "who leads, on what, and can I trust it" without scrolling. Every number matches the current table.

## 3. Sources / company setup (`V.onboard`)
Problem: three equal columns (Website / Documents / Text) plus a long form; the user must work out which one to use.
Do: **one intake bar**. The input takes a URL (→ existing "Read the website" fetch), pasted text (→ existing text source), or dropped / chosen files (→ existing upload). Detect a URL with `/^https?:\/\//` or a bare domain. The source list sits below as rows: type icon · title · status ("Read", "Text not readable", "Synthetic") · facts found · open in Knowledge. Company basics (name, industry, objective, socials) go in a collapsible "Company profile" block. Keep the discovery step (`S.ui.disc`) and the page picker for the website scan.
Done when adding a website, a PDF and pasted text all work from the same place in EN and AR.

## 4. Campaign Studio — review step (`makerView`, `V.studio`)
Steps 1–2 (choose what to make, details and look) are good. Step 3 "Review, refine, approve": large previews on a neutral canvas (Canva result or `bannerSVG`), version strip, editing panel on the side; Approve / Export as the primary action. Keep every Canva call, design direction, logo and colour control. Avoid text-heavy panels.

## 5. Brand QA + Export (`V.qa`, `V.export`)
Make QA the last step of the campaign, not a separate place: a per-asset checklist (pass/fail with the failing text quoted) beside the asset preview, "Fix in Studio" deep links, the version history as a timeline, and Export unlocked inline once all checks pass. Keep server checks (`srvQa`, `qaRows`, `draftLine`) exactly as they are.

## Known limits (do not claim otherwise)
- No real AI Director answer, Canva generation, Meta or Google flow was exercised in pass 3. Only the local demo (synthetic) data was used.
- Not tested on a real phone or with a screen reader.
