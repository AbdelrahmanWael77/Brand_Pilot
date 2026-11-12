# Change Impact Protocol — Design Contract

**Status:** proposed; implemented only after design approval and development.

## Mutation protocol

1. Validate authorized change against brand/brief/fact schema. A proposed product fact change (e.g. FlowNest trial from 14 to 21 days) is **unverified** unless explicitly reauthorized.
2. Record immutable `before` and `after` snapshots, actor, timestamp, reason and changed canonical fields.
3. Resolve semantic dependencies (fact IDs, CTA keys, palette tokens, tone, audience, forbidden term set) to affected asset slots. Include hidden text: subject, preheader, alt, metadata and legal notes.
4. Regenerate generated slots deterministically from updated structured data. Preserve unrelated manual edits.
5. For manually edited affected slots, compare dependencies and value; create `manual_conflict` with old/new proposals, blocking stale exports rather than overwriting silently.
6. Compute human-readable and machine-readable diffs across each language/asset version.
7. Re-run QA on every affected asset and a final **full-current-package** consistency sweep.
8. Mark affected previously approved assets `needs_review`. Unchanged assets retain approval only if content hash and dependencies remain identical.
9. Enforce export freshness and manifest version/hash checks; log any permitted explicit override with requester, time and reason.
10. Never delete historical versions or their validation findings. Phase-gate evidence references hashes/versions.

## Required change matrix

| Input change | Expected dependencies | Must not silently remain |
|---|---|---|
| Offer duration (authorized) | all offer statement slots, captions, CTA-adjacent text, email subject/preheader, lander, disclaimers | Previous duration or expired promo dates |
| CTA | every button/link/caption/subject that references primary CTA | Older CTA strings and broken link targets |
| Audience | targeted copy, guide, creative direction metadata | Old audience promise or segment language |
| Tone | generated message slots, messaging guide | Previously approved text treated as reviewed after tone change |
| Palette | tokenized SVG, landing/email CSS, brand previews | Unapproved color literal/token |
| Prohibited terminology | all languages' content slots and outputs | Banned term, even in manual overrides |

## Full-package invariant

`exportable = currentVersions && noCriticalQAErrors && noUnresolvedStaleOrManualConflicts && requiredReviewsSatisfied`, subject to explicit owner-approved warning policy. A typed exception for allowed warnings must not override unsupported product facts or silent stale offers.

## Demonstration scenario

Use a safe authorized **audience narrowing** (small and medium-sized teams in Egypt → small teams in Egypt) as first FlowNest drill, preserving 14-day trial. For trial-duration tests use a distinct newly authorized synthetic fixture. Keep user's surprise instruction open for later.
