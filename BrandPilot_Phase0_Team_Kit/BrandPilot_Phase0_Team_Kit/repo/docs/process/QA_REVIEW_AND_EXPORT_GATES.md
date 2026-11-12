# Brand QA, Human Review and Export Gates

**Status:** draft rules, not implemented or legally audited.

## Deterministic QA rule classes

| Category | Automated evaluation | Severity default / limit |
|---|---|---|
| Brand colors | Parse token references, SVG attributes, CSS declarations against brand palette; flag outside colors | ERROR; gradients/compositing may need review |
| Prohibited terms | Locale-aware token/phrase scans with Arabic normalization, variant handling | ERROR; language ambiguity/false positives remain |
| Offer agreement | Compare structured offer values to rendered asset strings/metadata and fact registry | ERROR for conflicts; human review on implied claims |
| CTA coverage | Required CTA slot and destination present, locale-specific approved wording | ERROR if missing/invalid |
| Claim authorization | Fact provenance IDs for generated claims; unsupported literal claims flagged | ERROR/HUMAN_REVIEW; cannot infer all claims from text |
| Disclaimer | Required disclaimers by locale/channel/offer present | ERROR; actual legal adequacy is human review |
| Language/direction | `lang`/`dir`, bidi isolation checks in HTML/SVG/preview | ERROR for missing/wrong; visual quality requires review |
| Accessibility | image alt text, semantic landmarks, keyboard focus, nominal text contrast 4.5:1 (3:1 large text) and nontext 3:1 where measurable | ERROR/WARNING; composite/background cases need review |
| Local links | route or file references resolve within expected bundle, no broken anchors | ERROR |
| Freshness | content hash and version cross-check against current brand/brief/asset revision | ERROR, blocks current export |

## Human review gates

- Egyptian Arabic cultural/natural marketing review, mixed-script visual reading order, idiomatic CTA.
- Creative direction and nuanced tone.
- Legal disclosures/offer terms and substantiation of ambiguous implied claims.
- Email client rendering support not covered by local browser test.
- Screen-reader/keyboard manual sampling.

## Review state machine (proposed)

`draft → in_review → approved` or `changes_requested`. Any change to content hash, dependent fact, brand token, CTA/offer or disclaimer triggers `needs_review`; old approval remains historically visible but not active. No tool alone signs legal or cultural approval.

## Export policy (approval required)

- Generate a manifest with brand/brief/asset versions, hashes, locale, QA summary, required approvals and list of editable files.
- Block export labelled **current/approved** for stale assets, unsupported claims, incomplete required files or unresolved critical errors.
- Owner may explicitly acknowledge designated **warnings** and generate a clearly marked **review draft** with an audit log; never silently bypass a stale offer or unsupported product fact.
- If human review is outstanding, label package `DRAFT — HUMAN REVIEW PENDING`, not publish-ready.
- Package should contain `README.md`, `manifest.json`, EN/AR social SVGs, landing HTML/CSS, email HTML/subject/preheader, and messaging guides.
