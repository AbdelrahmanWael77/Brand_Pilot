# Continue BrandPilot — owner input first

Read AGENTS.md and IMPLEMENTATION_STATUS.md (Next atomic task; Task queue rows 9.12, 9.13, 10.4a–10.4c). Run `git status`, `npm install`, `npm test` first (260 pass on 2026-11-15).

State (2026-11-15, Claude Opus 5.5): 9.12 + 9.13 done — AI pictures for campaign posts with Cloudflare Workers AI FLUX.1 [schnell] (`server/imageAi.js`, `server/campaignImage.js`, `aiImgBox` / `A.aiImg` in `public/index.html`). Tested with a stubbed network and a stand-in reply in the browser only.

Next, once the owner has put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` in `.env` (never print them): restart, Campaign Studio → a post → "Generate image with AI"; record whether the reply was `result.image`, the image size and bytes, the time taken, and whether any text appears in the picture. If Cloudflare answers in another shape, adjust `generate` in `server/imageAi.js` and its test.

Canva (10.4): blocked until the owner sets a password + MFA on their Canva account (the Developer Portal asks for it before creating the app's auth client). Then: app Brand-Pilot → Outside Canva → Start integrating; the owner pastes the client secret into `.env` themself.

Browser checks: launch config `brandpilot-check` (port 3100, `data/browser-check.db`), dev account from `npm run seed:dev` with `PORT=3100`. Reply in at most 6 lines: changed / tested / blocker / next.
