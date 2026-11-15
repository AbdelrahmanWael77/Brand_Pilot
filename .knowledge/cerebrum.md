# Cerebrum

Conventions, decisions and corrections that cannot be derived from reading the
code. Maintained by hand by the team. Never read this file whole. Search it.

## Conventions
## Key Learnings
- 2026-11-15: `htmlToText` (public/index.html) keeps the text of `<title>`. A page built by scripts therefore looks non-empty; when deciding whether a fetched page has readable text, remove `<head>` / `<title>` first (see `siteAdd`).
- 2026-11-15: progress and "busy" flags of background work belong in `SRV` (memory), never in `S.ui` (saved with the state): a reload in the middle would leave the flag set for good.

## Do-Not-Repeat
- 2026-11-15: patching `public/index.html` from `node -e "..."` in the shell loses backslashes in regexes (`\\w` arrived as `w`). Write the patch as a script file and use `String.raw` for code that holds a regex.
- 2026-11-15: do not judge "is this a grey?" by HSL saturation — it calls very light and very dark tints saturated (`#E2E8F0` scored 0.32). `colorRole` in server/brand.js uses chroma (max - min of the channels) plus lightness cut-offs.
- 2026-11-15: when several reads run in parallel, collect their failures from the results in input order, not at the moment each one fails — otherwise the order of the notes changes from run to run (a test in brand.test.js caught this).

## Decision Log
- 2026-11-15 (9.8): other content types (CSS, images) are a per-read option of the guarded reader that only server code can pass; the `fetch-url` route never forwards options from the request body. Why: the browser must not be able to turn the reader into a general download proxy.
- 2026-11-15 (9.7): the website page chooser never fails the request because of the model: any model failure, unusable answer or answer with no listed page falls back to the keyword rule and says `chosenBy: 'rules'`. Why: the scan must work the same with the AI off. Same site = same host with a leading `www.` ignored and the same port; subdomains are other sites. Every page is still read by the guarded reader, one `fetch-url` per page, so the SSRF rules are untouched.
- 2026-11-15 (9.23–9.25, owner): which logo version goes on which background is decided by measuring the logo (canvas luminance of its visible pixels, contrast against the background with the Brand QA formula), never by the website's class names ("logo-dark" means a dark logo on some sites and a logo for dark backgrounds on others) and never by a model call. Why: the result must be the same on every run and work with the AI off; the user can override per version. Finding the logo on the website is rule-based too (`server/brand.js`), so there is no prompt to tune there.
