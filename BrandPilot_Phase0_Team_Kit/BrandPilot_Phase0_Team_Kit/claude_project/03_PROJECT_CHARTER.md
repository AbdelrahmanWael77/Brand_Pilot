# BrandPilot — Product Charter

## Why

Create a functioning, reusable local-first creative production system that turns a structured brand kit and campaign brief into a consistent, editable, bilingual campaign kit and keeps it consistent through revisions. Avoid one-off static mockups or disconnected captions.

## Users

- **Campaign owner:** creates brand, brief, edits, asks for revisions, sees diff/QA, approves, exports.
- **Brand/copy specialist:** develops tone, copy, creative concept while respecting approved facts.
- **Localization reviewer:** checks Egyptian-market Arabic, mixed scripts, and RTL design.
- **Designer/developer:** edits HTML/CSS/SVG templates and landing/email assets.
- **QA/release reviewer:** checks consistency, provenance, freshness and warning labels.

## Scope

Brand Kit Manager; Campaign Brief Builder; template-based asset composer; FlowNest demonstration; three editable social layouts per language; bilingual landing page with local demo form; bilingual responsive email with subject/preheader; messaging guide; preview and targeted manual editing; versioned change-impact engine; QA dashboard; review/approval states; editable exports and a package manifest; automated tests including a second fictional brand.

## Operating mode

Default generation uses **deterministic templates and human-authored seed content**, not a pretend autonomous model. Optional model provider, only if an API is genuinely supplied; require validation and approval of proposed facts regardless of provider. Entire demo must run with no third-party login.

## Non-goals for MVP

Public hosting, account registration, production email sending, external social posting, CRM integration, analytics/conversion tracking, rights-cleared photography, live payments, automatic legal certification, guaranteed creative/cultural quality, and autonomous model generation when no provider exists.

## Anti-goals

- Hardcode FlowNest-specific logic in the platform.
- Keep old offer/CTA hidden in an exported file after a brief revision.
- Generate unsupported claims or silently change approved product facts.
- 'Approve' an asset just because automated tests pass.
- Flatten an editable SVG/email/landing page to screenshot-only output.
- Pretend a team agent, model provider, test, or integration actually ran.

## Completion definition

A user can create two distinct brands, build and edit a campaign, preview EN and AR, inspect QA/reviews and versions, make a cross-asset change, preserve unrelated edits, inspect diffs and re-review, and export a current editable package with verifiable evidence. Surprising last-minute user change is handled by the system, not rebuilding assets manually. If unresolved human review remains, label exports accordingly.

## Deliverable accounting

For **each language**: `social-1.svg`, `social-2.svg`, `social-3.svg`, responsive `landing.html`, responsive `email.html` + subject/preheader metadata, and `messaging-guide.md`. This is **five channel assets plus one guide**, resolving the apparent five-vs-six counting mismatch in the original brief. Source `.json` and relevant editable CSS and asset metadata are included too.

## Project assumptions requiring confirmation

- Single-user local app is sufficient for product MVP, while developer collaboration happens through a shared Git repository.
- Local form captures *synthetic demo submissions* in the local DB or other explicitly documented local store, not a real lead pipeline.
- Egyptian Arabic adaptation is modern approachable Arabic with localized tone; human native review is mandatory before publish readiness.
