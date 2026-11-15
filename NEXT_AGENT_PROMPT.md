# Continue BrandPilot — Creative Studio brief, next slice

Read AGENTS.md and IMPLEMENTATION_STATUS.md (Next atomic task; Task queue rows 10.4a–10.4c, 10.5, 10.6, 10.7). Run `git status`, `npm install`, `npm test` first (264 pass on 2026-11-15).

Done 2026-11-15 (Claude Fable 5.2), task 10.5: banner text fits (`fitHead`, `clampL`, `fitCta` before `bannerSVG` in `public/index.html`), design-direction gallery on every post (`dirStrip`, `A.dirPick`), AI short headline for the artwork (`server/visualCopy.js`, `vcBox`, `A.vcopy`).

Canva state: the owner's app "Brand-Pilot" in the Canva Developer Portal has MCP + REST APIs on, the scopes of `CANVA_SCOPES` ticked, redirect `http://127.0.0.1:3000/api/integrations/canva/callback`; `.env` holds the client id / secret (never print them), that redirect and `CANVA_SCOPES` without `brandkit:read` (the portal does not offer it). The real connect WORKS (2026-11-15): connected at `http://127.0.0.1:3000`, 8 scopes granted, Check connection answered. "Generate with Canva" has not been tried for real yet — ask the owner before creating designs in their Canva account. If Canva refuses the consent URL, try `code_challenge_method=s256` (Canva's own generator uses lower case); if the token exchange fails, set `CANVA_TOKEN_URL=https://api.canva.com/rest/v1/oauth/token`.

Next single task: 10.6 — the Canva result gallery (see its row). To test with realistic data without touching the owner's database: copy the MD Labs state into the throwaway server (read `company_state.data` for the company named MD Labs from `data/brandpilot.db` read-only, PUT it to a new company on port 3100 as the dev user). Reply in at most 6 lines: changed / tested / blocker / next.
