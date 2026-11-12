# BrandPilot — Traceable Requirements and Acceptance

**All IDs are candidate acceptance tests pending Phase 0 signoff.** A gate passes only on actual evidence, not guessed outcomes.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| R01 | Reusable brand kits | Create/update two different brands; persisted fields palette/fonts/tone/claims; reload |
| R02 | Structured campaign briefs | Valid/invalid/incomplete briefs; product facts separate from wording; unknown fact flagged |
| R03 | Editable branded social | 3 SVG/HTML social layouts per language with captions/CTA and accessible content |
| R04 | Landing page | Responsive bilingual hero/benefits/CTA and functional local demo form with validation |
| R05 | Marketing email | HTML responsive body, subject, preheader, CTA, clear language and accessible markup |
| R06 | Messaging guide | One guide per language explains creative idea and channel roles |
| R07 | Locale quality | EN ltr, AR rtl, dir/lang attributes and bidi isolates; human Egyptian Arabic review pending |
| R08 | Shared source of truth | Brand tokens, supported fact IDs, CTA/offer entities; same approved values across assets |
| R09 | Revision + dependency | Offer/CTA/audience/tone/color/prohibited-word changes recompute affected content only |
| R10 | Immutable history + review | New brief version/diff, affected assets marked re-review, unrelated edits preserved |
| R11 | QA palette/content | Reject unapproved colors; detect prohibited phrases/unsupported claims/offer contradictions |
| R12 | QA technical | Check missing CTA/disclaimer, lang/dir, alt text, contrast risks and broken local links |
| R13 | Export gate | Editable exports + manifest; stale/unreviewed package blocked or explicitly warned/audited |
| R14 | Local-first | App starts locally, stores SQLite, no required account/API, model provider strictly optional |
| R15 | Robust tests | Executed Vitest and browser tests when available; malformed input; second brand; real logs |
| R16 | FlowNest demo | Only approved facts; no rankings/testimonials/security/results/discounts invented |
| R17 | Final surprise | User-specified change processed by engine; diffs/history/QA/new exports shown |

## Acceptance examples to lock in during detailed planning

- **Offer change:** In a *test fixture with newly authorized facts*, change duration; no old numeric duration appears in any current asset, including email subject/preheader and hidden metadata. A manually edited conflicting slot becomes BLOCKED/CONFLICT rather than silently passed.
- **CTA change:** `primaryCtaKey` changes; the five channel assets for each required language update, while an unrelated manually edited decorative subhead remains unchanged.
- **Palette change:** approved token update propagates to SVG, landing/email CSS, preview and export; no unapproved old token remains.
- **Forbidden term:** variants of prohibited terminology produce asset-specific findings, including reasonable Arabic normalization (with false-positive limitations documented).
- **Fact policy:** unknown factual claim cannot be auto-approved; it yields an error or human-review hold depending on evidence and policy.
- **Stale export:** export of a superseded campaign returns a block/explicit warning and logs any owner override. It cannot be silently accepted.
- **Arabic:** test `lang="ar" dir="rtl"`, isolated English product name/URLs/numbers, and responsive visual/keyboard testing; naturalness remains human-reviewed.
- **Form:** required fields, email format, sanitization, success message, local record, no fake production submission.
- **Completeness:** each language has 3 posts + 1 landing + 1 email + 1 messaging guide; HTML/SVG/metadata are nonempty and parse/read successfully.

## QA severity

**Error:** deterministic safety/consistency broken; blocks release and normally export.  
**Warning:** probable quality or accessibility problem; owner can explicitly acknowledge, audit remains.  
**Human review:** legal compliance, substantiation edge cases, language nuance, and subjective creative appropriateness; never mislabeled machine-certified.
