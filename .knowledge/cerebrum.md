# Cerebrum

Conventions, decisions and corrections that cannot be derived from reading the
code. Maintained by hand by the team. Never read this file whole. Search it.

## Conventions
## Key Learnings
- 2026-11-15: `htmlToText` (public/index.html) keeps the text of `<title>`. A page built by scripts therefore looks non-empty; when deciding whether a fetched page has readable text, remove `<head>` / `<title>` first (see `siteAdd`).
- 2026-11-15: progress and "busy" flags of background work belong in `SRV` (memory), never in `S.ui` (saved with the state): a reload in the middle would leave the flag set for good.

## Do-Not-Repeat
- 2026-11-15: patching `public/index.html` from `node -e "..."` in the shell loses backslashes in regexes (`\\w` arrived as `w`). Write the patch as a script file and use `String.raw` for code that holds a regex.
## Decision Log
- 2026-11-15 (9.7): the website page chooser never fails the request because of the model: any model failure, unusable answer or answer with no listed page falls back to the keyword rule and says `chosenBy: 'rules'`. Why: the scan must work the same with the AI off. Same site = same host with a leading `www.` ignored and the same port; subdomains are other sites. Every page is still read by the guarded reader, one `fetch-url` per page, so the SSRF rules are untouched.
