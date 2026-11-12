# BrandPilot Requirements to Phase and Test Matrix (draft)

| Req | Owner phase | Contract / test family |
|---|---|---|
| R01, R02 | 1 | brand-crud, brief-schema, fact-ledger, SQLite reload |
| R03, R05 | 2–3 | svg and email render validation, editable metadata, slot persistence |
| R04 | 3–4 | responsive landing, local form validation, keyboard and storage |
| R06 | 3 | guide copy/ref consistency per locale |
| R07 | 3–4 | lang/dir, bidi, font fallback, AR visual review |
| R08 | 1–3 | shared token/claim refs, cross-asset snapshot consistency |
| R09, R10 | 2 and 5 | impact graph, authorized offer change, manual conflict, diff/history/approval invalidation |
| R11, R12 | 6 | prohibited term, palette, offer, CTA, claims, disclaimer, contrast, alt, local links |
| R13 | 7 | completeness, hashes, source validity, stale warning, no silent override |
| R14 | 1–4 | install without keys, local persistence, provider-disabled fallback |
| R15 | every phase, full P8 | Vitest, Playwright when installed, bad briefs and second brand fixture |
| R16 | 3 | FlowNest fact ID reference audit, forbidden claims scanner |
| R17 | 9 | surprise-change end-to-end, before/after, QA and exports |

## Manual-review boundaries

Automated checks do not prove idiomatic Egyptian Arabic, marketing creativity, legal adequacy or accessibility conformance across all assistive technologies. Record these as HUMAN_REVIEW.
