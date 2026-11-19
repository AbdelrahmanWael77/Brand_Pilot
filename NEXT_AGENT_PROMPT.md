> 2026-11-19 UX RECOVERY (branch improve-UIUX): B1–B5 and P0 (handover from brand-pilot-8b) DONE and committed; demo mode = BRANDPILOT_DEMO=1 (off by default) enables Ctrl K "Create FlowNest demo company (synthetic)" (shell + menu 10→8, guide closed by default, true storage copy; shorter Company knowledge + onboarding; Insights cards; Studio/Series/Export journeys incl. honest no-AI series flow; trend partial weeks, command menu, task wording). NEXT: the numbered "UX RECOVERY — remaining" list in IMPLEMENTATION_STATUS.md, item (1) first if an AI key is in .env, else item (2). Test setup used: PORT=3100 BRANDPILOT_DB=<scratch>/bp.db npm start; npm run seed:dev (PORT=3100); company MD Labs from md-labs.net + sample-data/*.csv imported through Your data (synthetic test data). Playwright scripts were in the session scratchpad (not in the repo).

> 2026-11-19: 69 DONE (not committed) — Studio header: title switcher no longer inherits the global dashed details border/margin (it sat below the breadcrumb); New / Edit answers / ⋯ all 38px and centred; meta line flush with the breadcrumb. Company knowledge: topic cards cannot grow past their column (.ks single minmax(0,1fr) track; long theme badges wrap) — fixes Content themes spilling under Restrictions. Next: owner reviews; commit. npm test 355/355.

> 2026-11-18: 58–68 committed (0b76490) and pushed on redesign/new-product-identity (owner: "make push"). Next: owner reviews; phone-width check of the redesigned screens.

> 2026-11-18: 68 DONE (not committed) — AI scene tile: shows progress on the tile while creating; when the scene is already in use the click opens the Picture tab options (it used to do nothing). 58–68 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 67 DONE (not committed) — Studio header: breadcrumb "Campaign Studio / <name> ▾" with a styled content switcher (replaces the native select), pipeline back under the header, gallery "Continue editing" card; details menus close on outside click / Escape. 58–67 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 66 DONE (not committed) — Studio editor header is one compact row with "← Campaign Studio" back to the Studio home; the gallery button reads "← Back to <campaign>". 58–66 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 65 DONE (not committed) — Director chat: navy question bubbles, centred 780px reading column, AI answers formatted into paragraphs and numbered steps with bold roles (display only), grounding line moved to the conversation header. 58–65 uncommitted. Next: owner reviews; phone-width check; commit.

> 2026-11-18: 64 DONE (not committed) — Lead quality tables → ranked bars with a "best with enough leads" line and faded small samples; Your data: quiet Remove data, compact import history with dataset tags and folded reading notes. 58–64 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 63 DONE (not committed) — Home: Performance-style hero band (company, goal, verdict, Needs/Priorities/Health pills, period) and colour-coded KPI cards with trend chips and 12-week sparklines that open Performance. 58–63 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 61c DONE (not committed) — fact sheet: Brand identity full width; HTML character codes (&#039; &rsquo; &quot;) decoded when pages are read (client + server) and cleaned from saved companies on load. 58–62 uncommitted. Next: owner reviews; phone-width check; commit. npm test 620/620.

> 2026-11-18: 61b DONE (not committed) — Company knowledge reads as a fact sheet: two columns of topic cards, one line per statement with a short source label, Details on hover, and statements cut off mid-sentence flagged "Looks cut off — fix". 58–62 uncommitted. Next: owner reviews; phone-width check; commit. npm test 619/619.

> 2026-11-18: 62 DONE (not committed) — Company sources: list first with "+ Add a source" opening the add box, quiet AI line, clean rows (name / address / one meta line / facts), Analyse again + Remove in a ⋯ menu, creative assets collapsed. 58–62 uncommitted. Next: owner reviews; phone-width check; commit. npm test 619/619.

> 2026-11-18: 61 DONE (not committed) — Company knowledge: summary leads with missing essentials (chips jump to the section), lede says what confirmed knowledge is used for, contents list has counts + dot legend, confirmed rows lighter with clean source labels. 58–61 uncommitted. Next: owner reviews; phone-width check; commit.

> 2026-11-18: 60b DONE (not committed) — full-campaign brief: picker dropdown font fixed, pipeline under the header without the repeated name, brief form in 3 numbered groups with English | Arabic side by side and missing fields marked inline. 58–60b uncommitted. Next: owner reviews; phone-width check; commit. npm test 619/619.

> 2026-11-18: 60 DONE (not committed) — Campaign Studio: Create content page tabbed (Create · Your content · Templates · Pictures · Brand kit), quiet delete/remove, template actions in ⋯; editor header = campaign picker as title + honesty line, no post column for one-post campaigns, one primary action in the bottom bar. 58–60 uncommitted. Next: owner reviews; phone-width check of 58–60; commit. npm test 619/619.

> 2026-11-18: 59 DONE (not committed) — Home redesigned: goal editable in place, duplicate ask box removed, compact priorities with "Ask the Director", Marketing health as a rail scorecard (weakest first), activity 4 + Show more. 58 (AI Director) also uncommitted. Next: owner reviews Home + Director; check both at phone width; then commit. npm test 619/619.

> 2026-11-18: 58 DONE (not committed) — AI Director redesigned: composer first, questions suggested from the company audit, popular questions in topic tabs, right rail folded into one grounding line + "Can’t measure yet" chips, Rename/Delete in the conversation header. Next: owner reviews it; check phone width (≤860px: list under the chat) in a resizable browser; then commit. npm test 619/619.

> 2026-11-18: 57 DONE — new-series flow: "What do you want to post?" type cards first (set kind + knowledge), then name/purpose/audience, then channel/goal. Tasks 41–57 committed and pushed; dev fast-forwarded to redesign/new-product-identity (owner asked).

> 2026-11-18: 55 + 56 DONE (not committed) — Export & delivery redesign; series "Start from" starting points (Teach a topic = general explainer series in one click). 41–56 uncommitted.

> 2026-11-18: 54 DONE (not committed) — new series: the kind is inferred from name / purpose / approved facts and shown on one line (Change opens the tiles); step 4 follows it. 41–54 uncommitted.

> 2026-11-18: 53 DONE (not committed) — Growth & leads: band, honest funnel/empty states; evidence on all recommendation cards = 2 clean lines + Show all. 41–53 uncommitted.

> 2026-11-18: 52 DONE (not committed) — Your data screen: status band, one drop zone, colour-coded source cards with "Unlocks"; duplicate tiles and the internal "Why these integrations" card removed. 41–52 uncommitted.

> 2026-11-18: 51 DONE (not committed) — Settings has a Company card to rename the company. 41–51 uncommitted.

> 2026-11-18: 50c DONE (not committed) — series setup step 4 ("What it writes from") now follows the kind in step 2; no contradictory combinations; server guard too. Restart :3000. 41–50c uncommitted.

> 2026-11-18: 50b DONE (not committed) — series can be "General knowledge — not about us": no company facts sent, prompt forbids company claims, drafts without approved facts. Restart :3000. 41–50b uncommitted.

> 2026-11-18: 50 DONE (not committed) — series setup step 4: Automatic (recommended) vs Only from topics I choose; clean grouped topics with fact counts instead of URL pills. 41–50 uncommitted.

> 2026-11-18: 49 DONE (not committed) — Brand identity is one card (colours with roles, font, logos, each with Details); the separate "Brand identity in use" card and duplicate rows are gone. 41–49 uncommitted.

> 2026-11-18: 48b DONE (not committed) — clicks inside an open panel/dialog no longer replay its slide/pop animation (looked like a refresh). 41–48b uncommitted.

> 2026-11-18: 48 DONE (not committed) — website pages read 4 at a time, AI analysis 3 at a time, per-user allowances 60/10 min (was 20 fetch / 10 AI); Brand panel keeps its scroll on ↑/✕. Restart :3000 for the server part. 41–48 uncommitted.

> 2026-11-18: 47 DONE (not committed) — website brand colours ignore framework palettes (Bootstrap etc.) and read the site's own CSS first; md-labs.net now gives #4CABE3 / #152B44. Owner: re-read the brand to replace the old pending list. 41–47 uncommitted.

> 2026-11-18: 46 DONE (not committed) — Compare channels: question cards (answer sentence + ranked bars) replace the side-by-side table, which is folded under See all numbers. 41–46 uncommitted.

> 2026-11-18: 45 DONE (not committed) — Compare channels lower half: cleaner table (no Search-only group, (i) notes, folded rules), gap alert cards, other lead sources as bars. 41–45 uncommitted.

> 2026-11-18: 44 DONE (not committed) — Performance channel tabs (Facebook, Instagram, LinkedIn, Website, Google search) get the Summary look: colour band, sparkline cards, top posts, bar lists. 41–44 uncommitted.

> 2026-11-18: 43 DONE (not committed) — Compare channels: headline band, channel cards, finding cards; removed How-it-works box, Sources and freshness, and the 'no earlier period' text. 41–43 uncommitted.

> 2026-11-18: 42 DONE (not committed) — Performance Summary upgrade: headline band, coloured step cards with 12-week sparklines, bars in What changed, insight icons. Owner to look (not seen in a screenshot). 41 + 42 uncommitted.

> 2026-11-18: 41 DONE (not committed) — AI suggestions card: full-width "Get AI suggestions" button; fixed CSS that task 34 had inserted inside a media rule (card had no border; .studio>.ed-side lost its prefix).

> 2026-11-18 MERGE: two sessions both used task numbers 34–39 (see the numbering note at the top of IMPLEMENTATION_STATUS.md). Both sets are below — Set B (AI suggestions card … series parts 40b, .env.example removed) first, then Set A (Read-all warning … colour boxes). New work starts at 41.

> 2026-11-18: .env.example removed from the repo on the owner's instruction (git rm staged, `!.env.example` dropped from .gitignore). Only the git-ignored .env holds settings. Tasks 34–40b still uncommitted.

> 2026-11-18: 40b DONE (not committed) — editing a series post keeps its part number; wrong part lines in a caption are detected and fixed; part bar under the caption. Tasks 34–40b uncommitted.

> 2026-11-18: 40 DONE (not committed) — series posts numbered as parts (badge on the design, "<Series> — Part N" + previous part + series hashtag in the caption, settings in About this series). Owner to look at the badge (not seen in a screenshot). Possible next pieces the owner did NOT pick yet: AI plan of parts, per-part tracking card, follow CTA. Tasks 34–40 uncommitted.

> 2026-11-18: 39 DONE (not committed) — post preview action buttons moved to the fixed top bar. Tasks 34–39 uncommitted.

> 2026-11-18: 38 DONE (not committed) — "What works in your posts" removed from the series side panel; preview avatar shows the full logo on white. Tasks 34–38 uncommitted.

> 2026-11-18: 37 DONE (not committed) — "View post" preview in AI Content Series: feed mock-up (LinkedIn/Facebook/Instagram) + full post details. Owner to try; check a carousel post and Arabic. Tasks 34–37 uncommitted.

> 2026-11-18: server on :3000 restarted with the owner's new .env (Anthropic key + ANTHROPIC_MODEL=claude-sonnet-5-5, no OpenAI key). Saved AI choice switched to anthropic:claude-sonnet-5-5 (was OpenRouter nemotron); a test call to Claude answered. Tasks 34–36 still uncommitted.

> 2026-11-18: 36 DONE (not committed) — AI Content Series Words step redesigned: two zones (On the creative + live preview / Under the post), counters, gradient generate bar. Owner to review; check Arabic and phone width.

> 2026-11-18: 35 DONE (not committed) — ANTHROPIC_MODEL read for the Claude option; OpenAI removed from the Settings help. Owner: restart :3000, then choose Claude in Settings → AI model (saved choice is still OpenRouter nemotron).

> 2026-11-18: 34 DONE (not committed) — "AI suggestions" card at the top of Campaign Studio → Words: better headline / supporting line / button / caption + campaign tips from the post, brief and approved facts (server/postHelp.js, route ai-help, test/postHelp.test.js). Restart the :3000 server to load the new route. Next: owner tries it on a real post (EN + AR), then commit. npm test 620/620.

> Latest local run check, 2026-11-18. User requested run again. Existing app serves http://localhost:3000. Fresh Invoke-WebRequest checks for /api/health and / returned HTTP 200 with expected content. Working tree was clean before this check. Only the two handoff files were updated, uncommitted. Next single task is browser verification of task 33 in EN and AR: generic AI explanation wording and model selection in Settings. Read AGENTS.md, status and Git state before continuing.

> 2026-11-18: 39 DONE — colour boxes in Review the signature style aligned (public/series.css).

> 2026-11-18: 38 DONE (committed + pushed) — Performance page redesign: opens on Summary (journey steps → What changed → What it may mean → trend), one-line period, cleaner tabs, comparison rules/sources folded. 348/348 tests; EN/AR/mobile screenshots checked (data/check-perf-steps.mjs). Owner to review. The colour-box fix in public/series.css is still uncommitted.

> 2026-11-18: 37 DONE — AI "Suggest everything from the name" on the campaign brief (server/campaignBrief.js, route campaigns/suggest-brief, 5 tests). Owner asked about a colour-box UI bug with a screenshot that is NOT from BrandPilot — clarify.

> 2026-11-18: 36 DONE — full campaign card first in Campaign Studio. Still offered to the owner: prefill every purpose from facts, or AI campaign copy (9.10/9.11).

> 2026-11-18: 35 DONE — larger compass in the logo. Owner was offered: full campaign first in the Studio, prefill every purpose from facts, or start AI campaign copy (9.10/9.11) — waiting for a choice.

> 2026-11-18: 34 DONE — token/time warning under Read all in the page popup. 32–33 pushed (6367951).

> 2026-11-18: 33 DONE — model name removed from the AI Director "How answers are made" card. 32 committed c8ccf59 (not pushed).

> 2026-11-18: 32 DONE — user-facing "Meta" labels for the posts dataset renamed to Social posts (Facebook, Instagram, LinkedIn); Meta only means the Facebook+Instagram connection.

> 2026-11-18: 31 DONE — progress bar in the Knowledge Hub analysing bar. 27–30 pushed (561d938).

> 2026-11-18: 30 DONE — Read all button in the page popup; Home keeps its loader until the AI analysis ends. 28 + 29 are committed in 35fc667.

> 2026-11-18: 30 DONE — Knowledge Hub shows website logo candidates as images (light + dark tiles) in review, and "Brand identity in use" lists pending logos with Confirm/Dismiss instead of "none". Owner to check on MD Geeks; then commit 28–30.

> 2026-11-18: 28 + 29 DONE (not committed) — no AI page cap on website reading (rate limits now wait and continue), and a Knowledge Hub status bar for running/finished analysis. Owner to try both on a real site; then commit.

> 2026-11-18: 27 DONE (9d6ca62) — website reading waits for the page choice (popup picker, facts + brand scan only after pages are read or skipped). Owner to try it on Home with a real site.

> 2026-11-18: 26 DONE (not committed) — synthetic MD Labs example imports for GA4 / Search Console / Leads, derived from the real FB/IG/LinkedIn exports: run `node scripts/make-mdlabs-examples.js`, files + README in git-ignored data/examples/. Not yet imported through the browser. Owner items from 25b still open (logo pick; Facebook export time zone).

> 2026-11-18: 25b DONE (296122b, not pushed) — schedule minors fixed, Instagram export = Pacific, logo dot removed. WAITING ON OWNER: (1) pick a logo from https://claude.ai/artifact/8ifu3St6VWBnFLhuBo8ByE, then replace IC.logo + public/favicon.svg; (2) is the Facebook export column publish_time_pacific really Cairo time? (evidence in IMPLEMENTATION_STATUS 25b) — if yes, set htz to the audience zone for Facebook files.

> 2026-11-18: 25 DONE — posting schedule v2 committed (b89ad34..ad4dfd4, not pushed): EN/AR same day, carousel on one day, start date, 14-day cap, sourced MENA/global peak windows, synced posts keep the hour. Logic in public/schedule.js (tests test/schedule.test.js). Next single task: owner to choose — optional deferred minor: compute own-data weekdays in the audience zone (BPSchedule.bestTimes uses r.date; with r.hour+r.htz the local date can be derived) — Sonnet 5.5 · medium · 1h.

> 2026-11-18: tasks 23–24c COMMITTED on redesign/new-product-identity and, on the owner's instruction, dev fast-forwarded to it and pushed.

> 2026-11-18: 24c DONE (not committed) — When to post (own results + labelled peak guidance, audience time zone), Tracking links card removed, 8 creative references. dev = b2ec073.

> 2026-11-18: 24b DONE (not committed) — Check & export → Export, browser Back works, compact colour cards, template cards open, no dashed line on ⋯. dev = b2ec073.

> 2026-11-18: 24 DONE (not committed) — one add-your-business box on Home + Sources, step tracker while a website is read (inline page chooser), website fact filters (631 → 64 on stripe.com). dev = b2ec073.

> 2026-11-18: 23d DONE (not committed) — Guide button bottom-right + panel. dev = b2ec073.

> 2026-11-18: 23c DONE (not committed) — guide is a bottom-left card (pill when small); menu plain. dev = b2ec073.

> 2026-11-18: 23b DONE (not committed) — guidance completed for a new company (do-next buttons, honest checks, step order warnings). dev = b2ec073.

> 2026-11-18: 23 DONE (not committed) — guided flow: 9-step path in the menu, a step guide on every screen, Home overview. dev = b2ec073.

> 2026-11-17: tasks 17d–22b COMMITTED on redesign/new-product-identity and, on the owner's instruction, dev fast-forwarded to it and pushed (origin/dev = origin/redesign/new-product-identity).

> 2026-11-17: 22b DONE (not committed) — one Create button per series card. 17d–22b NOT pushed (dev = 56a473f).

> 2026-11-17: 22 DONE (not committed) — AI Content Series home: series first, recommendation inside each card, details folded. 17d–22 NOT pushed (dev = 56a473f).

> 2026-11-17: 21 DONE (not committed) — Improvement center (was Automation): weekly review in 3 blocks, honest Update now, Plan with AI Director per task. 17d–21 NOT pushed (dev = 56a473f).

> 2026-11-17: 20d DONE (not committed) — Content library left Create content; series editing + per-post series list now in AI Content Series. 17d–20d NOT pushed (dev = 56a473f).

> 2026-11-17: 20c DONE (not committed) — single-post view, vision text check + one retry for AI pictures, honest daily-allowance error. Cloudflare free image allowance used up today (resets 00:00 UTC). 17d–20c NOT pushed (dev = 56a473f).

> 2026-11-17: 20b DONE (not committed) — Studio step 2: thumbnail post list, EN/AR switch, Extras. 17d–20b NOT pushed (dev = 56a473f).

> 2026-11-17: 20 DONE (not committed) — Campaign Studio cleanup step 1 (one navigation, brief summary, one template picker, pictures in the Picture tab, sticky Approve/Next bar, Delete in ⋯). Next = step 2: thumbnail post list + EN/AR switch + Extras. 17d–20 NOT pushed (dev = 56a473f).

> 2026-11-17: 19e DONE (not committed) — Campaign Studio Create content = business posts only; series via AI Content Series. 17d–19e NOT pushed (dev = 56a473f).

> 2026-11-17: 19d DONE (not committed) — AI scene options (3 per post), scenes kept out of template looks, AI scenes for all posts. 17d, 17e, 19, 19b, 19c, 19d NOT pushed (dev = 56a473f).

> 2026-11-17: 19c DONE (not committed) — Studio side panel scrolls independently; live preview pinned in Colours. 17d, 17e, 19, 19b, 19c NOT pushed (dev = 56a473f).

> 2026-11-17: 19b DONE (not committed) — Look tab colours: brand kit + any colour, cards, live contrast. 17d, 17e, 19, 19b NOT pushed (dev = 56a473f).

> 2026-11-17: 19 DONE (not committed) — Campaign Studio "AI scene" look (AI picture made for the layout fills the post; real text/logo on top). 17d, 17e and 19 are NOT pushed (dev = 56a473f).

> 2026-11-17: 17e DONE (not committed) — redesigned New series form with live preview; Delete series. 17d + 17e are NOT pushed (dev = 56a473f).

> 2026-11-17: 17d DONE (not committed) — series understand their subject (kind, about, audience; facts that name the series lead every topic and draft prompt). Last push to dev was 56a473f; 17d is NOT pushed.

> 2026-11-17: 18 DONE — AI Director as saved conversations. COMMITTED a1a76be on redesign/new-product-identity and, on the owner's instruction, dev fast-forwarded to it and pushed (origin/dev = origin/redesign/new-product-identity). Open owner question: web/market research for series topics — not started.

> 2026-11-17: 17c — "What to post next" moved from Performance into AI Content Series home; "What works in your posts" box in each series. NOT committed. Pending owner decision: web/market research for topic ideas.

> 2026-11-17: fixed Studio carousel slide selection (caption missing on slides 2..n crashed assetPreview/assetFile). NOT committed.

> Newest (2026-11-17): 17a done (owner review): series panel removed from Performance; "Topic ideas" panel inside each series (recommended topic + topic list + AI ideas via POST /series/topics). NOT committed. Next task is still 17b (Open in Canva for a saved series post) — see IMPLEMENTATION_STATUS.md first entries.

> Newest (2026-11-17): task 17 AI Content Series workspace — first vertical slice DONE and verified with real AI (vision style read, AI draft, FLUX creatives) on a DB copy; NOT committed. Read the first entry of IMPLEMENTATION_STATUS.md (files, data model, what is verified, what is not). Exact next task 17b: "Open in Canva" for a saved series post (upload illustration + official logo as Canva assets, editable text design via the Canva MCP tools listed by tools/list; honest message when not connected). Restart the app on :4000 first — it still runs the old server code.

> 2026-11-17: free image backup (Cloudflare FLUX) is configured and verified for real. Canva still blocked by the owner's Canva AI credits until 2026-12-01.

> 2026-11-17: Canva generation is blocked by the owner's Canva AI credit quota (resets 2026-12-01); BrandPilot now says so (canva_credits). 16d (real Canva check of the two strategies) waits for credits.

> Newest (2026-11-17): 16, 16b and 16c are DONE (first three entries of IMPLEMENTATION_STATUS.md). Exact next task (16d): with the owner signed in and Canva connected, run "Generate with Canva" for one hiring post and one Build Smarter carousel slide, check the two prompt strategies against real Canva results (logo never redrawn, text accurate and editable), and fix what the real answers show. Then: a PDF of a carousel for LinkedIn (slides download as separate images today).

> Newest (2026-11-17): 16b Content library + New post from insight is DONE (first entry of IMPLEMENTATION_STATUS.md). Next: 16c — Creative Studio adapts to the content type (structured business posts vs. signature series posts), see the owner brief in that entry once written.

> Newest (2026-11-17): task 16 "What to post next" is DONE on this branch (see the first entry of IMPLEMENTATION_STATUS.md). Files: public/recs.js, server/recs.js, server/companies.js (route recs/draft), public/index.html (nx* functions above V.analytics, mkBriefHTML, mkBuild camp.idea, CSS .nx-*), test/recs.test.js, test/recs-draft.test.js. Next for this feature (only if the owner asks): use the Analytics period for the comparison; show "content made from this series" results 7 days after publishing on the recommendation card; unit-test the series form logic. Otherwise continue the redesign pass below.

# START HERE — BrandPilot redesign pass 4 (branch `redesign/new-product-identity`)

The owner rejected passes 1–3 as a "visual reskin". Read `design-system/brandpilot/PASS4_BRIEF.md` first, then AGENTS.md and the "REDESIGN — pass 4" line at the top of IMPLEMENTATION_STATUS.md.

State: **4.1 (identity + goal sidebar) and 4.2 (Knowledge Hub "Company profile") done, committed and pushed.** Next, in the owner's order, apply the same shell and look (cobalt on slate, Plus Jakarta Sans, 15.5px body, cards with 14–16px radius, plain-language labels, one primary action per area) to: 1. onboarding / sources + brand identity (DONE, 4.4) → **2. analytics (next: PASS3_TASKS §2 scoreboard)** → 3. audit + AI Director → 4. Studio/Canva → 5. QA/approvals → 6. integrations/settings. `PASS3_TASKS.md` §2–5 still describes the right content changes (Analytics scoreboard, single Sources intake, Studio review step, QA as the last step of a campaign). One screen per commit.

Rules: UI only in `public/index.html`; keep every `data-a` action, the server and the data; EN + AR/RTL; no text smaller than now. Test on a COPY of the DB (`cp data/brandpilot.db* <tmp>/`, `PORT=3100 BRANDPILOT_DB=<tmp>/brandpilot.db npm start`, `PORT=3100 npm run seed:dev`). Browser checks: headless Chrome with `--remote-debugging-port=9333`, then `PORT=3100 SHOTS=data/shots/p4 node data/check-11-run.mjs data/check-p4-42.mjs` (git-ignored helpers in `data/`; `check-p4-42.mjs` shows how to make a fresh account with the FlowNest demo: `A.loadDemo();A.discover()`). `npm test` = 280 pass on this branch. After each screen: update both handoff files, commit, `git push origin redesign/new-product-identity`. Never merge into `dev`/`main`.

---

# Continue BrandPilot — Analytics channel comparison (task 15), next slice

Read AGENTS.md and IMPLEMENTATION_STATUS.md ("Newest — 15" under Next atomic task, and "In progress / uncommitted"). Run `git status`, `npm install`, `npm test` first. If a test fails with `fetch failed … bad port`, re-run it: that is a pre-existing flaky random port (`listen(0)`), not a regression.

Numbering: the analytics comparison was first handed off as "12" / "12b". Dev independently used 12, 13 and 14 for creative-studio work (any colour and logo position on a design, PNG / SVG downloads, Tag posts finish card — see "Also new — 14" and "Also new — 12" in the status file), so the analytics work is now **15 / 15b**. Code comments that still say "task 12" / "12b" in `public/compare.js`, `server/channels.js`, `public/index.html` and the two test files mean the analytics task.

State on branch `feat/12-analytics-compare`: 15 committed as e49e79f (by the owner); origin/dev merged in as ca1f866 (2026-11-16, conflicts only in the two handoff files, both sides kept); 15b committed on top; `dev` was fast-forwarded to this branch and pushed to origin/dev on 2026-11-16 (owner approved). Work on `dev` from here. `stash@{0}` is 15b as it was before the merge (now committed — safe to drop); `stash@{1}` (from `feat/10.6a-canva-real-replies`) is byte-identical to dev commit 8d2c4e6 and can be dropped once the owner agrees.

What 15 built (details in the status file):
- `public/compare.js` — pure channel-comparison math, global `BPCompare` (unit tests: `test/compare.test.js`). Rules: missing column = null ("Not measured"); leads only by the CRM source text; "Google" unassigned; GA4 social pooled; ranking only above minimum data with a 10% lead.
- `public/index.html` — Analytics opens on "Compare channels" (`cxView`, `cxSource`, `cxText`, `cxCell`, `cxRow`, CSS `.cx-*`); actions `A.cmpAsk` (Director) and `A.cmpCamp` (Studio draft).
- `server/channels.js` runs the same `public/compare.js` in `node:vm`; `buildContext(db, id, { range })` adds `context.channels`; citation type `channel` (`<channel>.<metric>`) checked in `server/director.js`; the page sends `range` with `/director/ask` (tests: `test/channels.test.js`).

15b (committed): ranking explanations — `compare().rank[k]` (status ranked / close / few, best eligible `top`, highest observed `obs`, not-ranked `out` with the exact unmet minimum), cell markers "★ Best eligible" / "▲ Highest observed" / "Not ranked: …", a "Why:" row under the metric (`cxRankNote`), visible comparability reasons (`CXW`), winner cards that name the better-looking unranked channel, a "Too little data to rank" card, and `channels.ranking` in the Director context. Keep that rule: never show a winner without the higher unranked channel and its reason; never call the minimums a confidence or significance test.

Next single task (15c): add the per-channel table to the report (`server/report.js` Markdown + printable HTML, EN/AR) using `channelSummary` from `server/channels.js`, for the report's own range. Success: for the same period, the report and the Compare channels tab show the same per-channel numbers, and the report says "Not measured" where the tab does. Other open items: campaign-by-campaign comparison across platforms, rules-engine Director using `channels`, LinkedIn live sync (needs LinkedIn partner approval).

Reply in at most 6 lines: changed / tested / blocker / next.
