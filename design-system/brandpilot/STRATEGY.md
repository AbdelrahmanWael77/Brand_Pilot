# BrandPilot — market research and challenger experience strategy

Branch `redesign/new-product-identity`, 2026-11-16. Companion to `MASTER.md` (visual system).
Research method: public web pages, vendor docs and third-party reviews found by web search on 2026-11-16.
**No competitor product was used hands-on** (no accounts); statements below are labelled *verified (source)* or *assumption*.

## 1. What BrandPilot is (from the code, not invented)

| | Evidence in the repo |
|---|---|
| Category | AI-assisted **marketing intelligence + campaign creation** for one company at a time (B2B SaaS, account → companies). `AGENTS.md` "Product priority" |
| Core loop | Create company → add sources → extract / approve facts → import data → audit → AI Marketing Director → editable **bilingual (EN/AR)** campaign → analytics → learning. |
| Distinctive rules | Facts are approved by a person and keep their evidence; synthetic data is labelled; the Director answers only from approved facts and imported data and its citations are checked (`server/director.js`); missing data is "Not measured", never 0. |
| Data sources | Website / documents, Meta, GA4, Search Console, CRM lead exports, LinkedIn exports; Canva, Cloudflare image model, Claude. |
| Market signals | Currencies EGP/SAR/AED/KWD/QAR/BHD/OMR/JOD; Arabic RTL everywhere; demo companies are Egyptian SMBs → **MENA SMBs and the agencies serving them** (*assumption, from code*). |
| Users | Founder / marketing manager / agency strategist, weekly decision sessions (*assumption*). One role per account — **there are no team, permission, WhatsApp, conversation-inbox or admin-console features in this product**; the brief's references to those do not apply. |

## 2. Competitors and reference products

| Product | Type | What it sets as expectation (verified unless marked) | Where it leaves room |
|---|---|---|---|
| **HubSpot Marketing Hub / Breeze** | Direct (incumbent) | Brand identity built by crawling a website (voice, tone, ICP, products); a brand assistant checks content; knowledge vaults. Pro/Enterprise only. *(knowledge.hubspot.com)* | If no knowledge sources are added it falls back to general knowledge *(HubSpot docs)*; third-party guides say content-agent drafts often need heavy editing. Expensive tier gate for SMBs. |
| **Jasper (Jasper IQ, Canvas, Grid, agents)** | Direct (AI content) | Brand IQ + Marketing IQ + knowledge base as a context layer; Canvas and Grid workspaces; agent selector carried across chat / canvas / grid *(jasper.ai, July 2026 update; marketscale)* | Content-first, not decision-first: no audit of the company's own performance data (*assumption from public positioning*). 100+ agents → choice overload (*assumption*). |
| **Semrush (incl. Semrush One)** | Adjacent (audit / analytics) | Deep audits and reporting. *(reviews)* | Reviews repeatedly cite interface density, overlapping reports, steep learning curve, cost *(G2, Capterra, diyai.io)*. |
| **MATTE (FAST Ventures, Dubai)** | Direct, regional | AI marketing studio for MENA SMB agencies and in-house teams; bilingual Arabic/English campaigns; one workspace; **approval layers at key decision points** *(campaignme.com, menastartupdigest.com)* | New entrant — UI quality unknown (*not verified*). Execution-first (launch/optimise ads). |
| **Simbel AI, Lahjty** | Direct, Arabic-first | "Arabic first, not translated", dialect-aware copy, brand profile *(self-published pages, stork.ai)* | Copy generation; no evidence-grounded audit (*assumption*). |
| **Canva (Brand Kit, Magic Studio)** | Adjacent creative | Users already make social posts there; BrandPilot integrates it. | Knows nothing about performance. |
| **Linear** | Aspirational interaction | Cmd+K command menu with every action for the current view; **Triage** inbox where incoming items land first; single-key shortcuts; optimistic UI *(linear.app changelog)* | Keyboard model does not carry to touch *(925studios)*. |
| **Attio** | Aspirational data workspace | Clean, fast, keyboard shortcuts, Notion/Airtable-like views *(TechRadar, G2)* | Setup complexity *(Lightfield, G2)*. |

## 3. Challenger strategy

**Positioning:** *the marketing director that shows its working.* Competitors generate; BrandPilot decides — from the company's own evidence, in English and Arabic.

1. **Why it feels more modern than incumbents:** it opens on *what needs you*, not on a wall of reports (Semrush's main complaint); every answer, priority and campaign line carries its evidence.
2. **Recognisably different:** editorial "Ledger" identity (paper/ink/one signal colour) where the category is blue/orange/purple; serif headlines like an analyst brief; evidence shown as quotations.
3. **Simpler, faster workflows:**
   - The navigation **is the workflow** (01 Understand → 02 Diagnose → 03 Create → 04 Measure) in one bar, with a single "Next" step strip — replacing a 14-item sidebar *and* a separate progress bar.
   - **Command menu (Ctrl/⌘ K, or /)**: jump to any page, campaign, fact or audit finding, switch company, start a campaign, or type a question and send it to the Director.
   - **Triage keyboard for facts** (J/K move, A approve, R reject) — approving extracted facts is the most repetitive task in the product.
   - **"Needs you" queue** on the Briefing: pending facts, conflicts, open questions, campaigns made stale by a knowledge change, missing data — each with the one action that resolves it.
4. **Conventions kept:** left-to-right workflow order, tables for numbers, period selector, tabs for filters, chat for the Director, explicit Approve/Reject buttons (keyboard is an accelerator, not a replacement), the full audit sheet.
5. **Conventions challenged:** dashboard-as-home (→ decision queue + brief), sidebar-of-features (→ workflow bar), chat-only AI (→ answers are documents with evidence and proposed actions), separate search box (→ one command menu that also asks the AI).
6. **Signature experiences:** "Needs you" queue · workflow bar with Next strip · evidence quotations · Ctrl K that ends in "Ask the Director" · J/K/A/R triage.

## 4. Directions explored (ui-ux-pro-max `--design-system` with dials)

| | A. Operator console | B. Campaign canvas | **C. Evidence desk (chosen)** |
|---|---|---|---|
| Skill run | `productivity tool keyboard command dark developer workspace --density 9 --variance 3` → Minimalism & Swiss, dark `#0F172A`, JetBrains Mono / Plex Sans | `creative content studio visual board social media --density 4 --variance 8` → Brutalism, rose `#E11D48` + blue, Inter / Playfair | `decision workflow approvals evidence analytics B2B --density 7 --variance 6` → Trust & Authority + Accessible & Ethical, ink `#0F172A` primary |
| Navigation | Icon rail + Cmd K only | Board of campaigns as home, creation first | Workflow bar + Next strip + Cmd K |
| Home | Dense KPI grid | Kanban of campaigns / posts | "Needs you" queue + brief |
| Density / type | Very dense, mono-heavy | Airy, poster type | Medium-dense, serif display + Plex |
| For | Daily power users | Content teams | Weekly deciders who must trust the numbers |
| Verdict | Interaction model adopted (Cmd K, single-key triage); dark dense look rejected — weekly SMB users, long Arabic reading, mono has no Arabic. | Rejected as structure: creation is step 3 of 4 and depends on approved facts; Brutalism undermines trust. Big creative previews kept inside Studio. | **Wins** on market relevance (evidence is the gap competitors leave), differentiation, accessibility, RTL and feasibility. Skill's sky-blue accent `#0369A1` overridden by vermilion: blue is the category default. |

## 5. Honest limits
- Competitor UIs were not inspected first-hand; comparisons rest on public docs and reviews.
- Team/permissions, WhatsApp, conversations inbox and an admin console do not exist in BrandPilot; nothing was invented for them.
