# BrandPilot — System Design (DRAFT FOR PHASE 0 APPROVAL)

**Date:** 2026-11-11  
**Approval:** PENDING — this design is not permission to implement  
**Purpose:** a reviewable design proposal for a reliable local-first bilingual campaign production application.

## 1. Intent and tradeoffs

The product accepts reusable brand kits and structured campaign briefs and produces editable English/Arabic campaign content. The primary failure mode to prevent is a stale trial offer or CTA surviving after a change. The app must demonstrably work offline/local without external model keys or company accounts.

**Approach A — recommended:** TypeScript shared-domain monorepo; deterministic structured templates; SQLite immutable snapshots; dependency-aware change engine; optional model adapter. Benefits: traceable, editable, testable, repeatable. Costs: less free-form creative autonomy and more initial schema discipline.

**Approach B:** fully model-generated HTML/copy per revision. Benefits: creative flexibility. Costs: provenance, reproducibility and no-provider requirement are harder; stale/unsupported claims much riskier. Not recommended for MVP.

**Approach C:** document and template generator without persistent versions. Benefits: small initial codebase. Costs: fails critical change-history/re-review/exact-diff requirements. Not acceptable as final architecture.

**Human approval needed:** confirm A or request revision before planning the first implementation tasks.

## 2. Goals, non-goals, critical invariants

**Goals:** multi-brand management, brief facts, 5 channel assets + 1 guide per language, polished editable previews, strict EN/AR direction, revision traceability, explainable QA, review state and valid editable exports.  
**Non-goals:** deployed SaaS, real mailing lists, social posting, marketing analytics, fabricated automated AI generation, legal certification, fully automatic cultural judgment.  
**Invariants:** approved factual claims are atomic; every claim emitted has provenance or is marked unverified; every asset knows input versions; no current export silently includes superseded values; unrelated manual fragments are preserved; review signatures are invalidated on dependent change.

## 3. Proposed technologies and modules

- `apps/web`: Vite + React + TypeScript; brand/brief forms, asset editors, diff/history/QA dashboards, preview and export UI.
- `apps/api`: Express + TypeScript; local REST endpoints, validation, SQLite persistence and export service.
- `packages/domain`: typed models, Zod or equivalent validation, structured offer/CTA/fact entities, comparison/versioning, dependency graph.
- `packages/templates`: pure SVG/HTML/email/guide renderers based on `RenderContext` and per-asset locale slots. Data-driven, not FlowNest-specific.
- `packages/qa`: deterministic validators and findings model; no unsupported claims of exhaustive ML/legal proof.
- `data/`: ignored local SQLite DB and demo submissions. Store initial synthetic FlowNest fixture in versioned `docs/fixtures` or dedicated seed directory.
- `tests/e2e`: Playwright workflows when browsers install/run; CI/browser limitations reported.

**Proposed minimum runtime:** supported local Node.js >=22 and npm, pinned after local compatibility check. SQLite implementation and migrations must be covered by integration tests. No dependency install or scaffold has occurred in this kit.

## 4. Proposed conceptual records

```text
BrandKit(id, name, description, logo, paletteTokens, fontTokens, voice,
  personality, approvedTerms, prohibitedTerms, audiences, claims, version)
Fact(id, productId, canonicalStatement, locales, authorizedAt, status)
CampaignBrief(id, brandId, objective, audienceIds, productFacts[], features[],
  approvedValueProps[], offerRef, primaryCtaKey, channels, locales,
  creativeDirection, disclaimers[], exclusions[], version)
LocalizedCopy(slotId, locale, text, sourceKind, factRefs[], briefFieldRefs[],
  manualEditRevision, reviewState)
Asset(id, campaignId, kind, locale, sourceBrandVersion, sourceBriefVersion,
  slots[], dependencies[], editableMarkup, version, reviewState, qaState)
ChangeSet(id, author, timestamp, beforeVersion, afterVersion, changedFields[],
  affectedAssetIds[], changedSlotIds[], conflicts[], approvalInvalidations[])
QAResult(assetId, assetVersion, ruleId, severity, evidence, explanation, status)
ExportManifest(campaignVersion, brandVersion, generatedAt, fileListWithHashes,
  validationSummary, approvals, overrideAudit[])
```

These are design concepts, **not final implementation signatures**. Task-level interfaces belong in the approved per-phase implementation plan.

## 5. Core flows

**Create:** user defines brand and brief → validate canonical fact/claim entries → create snapshot versions → templates bind typed brand/campaign values → render locale assets → store provenance → QA findings and pending reviews → edit in local UI.

**Edit:** user edits only a copy slot, SVG layout or HTML style property → save with revision and dependency metadata → no unrelated asset modifications → QA and relevant review invalidation.

**Revise:** form changes e.g. CTA/offer/audience/colors → new brief/brand snapshot → semantic dependency graph computes impacted slots/assets → regenerate only generated slots; manual slots with incompatible dependencies become conflicts rather than silent replacements → preserve unrelated edits → produce before/after diffs → run QA on affected and whole current package → invalidate approvals for impacted assets → block stale export or require explicit logged owner exception for allowed nonfatal cases.

**Export:** fresh validation and provenance checks → deterministic file set EN/AR and manifest → enforce version/currentness/approval policy → ZIP locally; source HTML/SVG remains editable.

## 6. Architectural choices to test early

1. **Canonical offer:** `offerRef` points to an approved registry entry with `durationDays=14` for FlowNest. An offer change is not safe until source authorization is updated.
2. **CTA:** semantic `primaryCtaKey` + locale-specific approved copy. Propagate across CTA button, post caption, email subject/preheader when relevant, metadata and alt text if applicable.
3. **Fact grounding:** template copy slots explicitly reference fact IDs. Unknown factual sentence from manual/model candidate is not automatically safe; QA raises issue and human review.
4. **Palette:** CSS custom properties and SVG token mapping, plus checks for literal unapproved colors. SVG/image contrast caveat flagged.
5. **RTL:** top-level `lang`, `dir`, CSS logical properties, safe bidi isolation for mixed scripts; no CSS-only mirroring assumptions.
6. **History:** immutable versions with timestamp and actor; editing new current version never mutates an older export/review record.
7. **Provider interface:** `GenerationProvider` returns proposed structured copy slots; no external provider required; same validator path for all inputs.
8. **Review:** pending, changes_requested, approved, stale/superseded; approval tied to content hash and input versions.

## 7. Feature slices and risk order

P1 creates domain/store, P2 produces working vertical slice with provenance, P3 creates FlowNest content, P4 adds real editor/localization, P5 completes impact/review invalidation, P6 QA, P7 export, P8 exhaustive tests and second brand, P9 documented change drill and surprise challenge.

## 8. Quality and security constraints

Use no secrets in fixtures. Validate and encode inputs. Sanitize editable HTML/SVG before preview/export; treat user-supplied markup as untrusted. No dynamic script execution in exported email. Prevent path traversal in export filenames and broken local links. Form uses locally stored **demo** data and no real lead/email sending; retention behavior must be documented. Accessibility WCAG 2.2 AA checks are best-effort automated signals, not a compliance certificate. Review Arabic wording with a qualified human before publication.

## 9. Acceptance and blind spots

Coverage matrix in `docs/requirements/TRACEABILITY.md` and Claude shared file `07_REQUIREMENTS_ACCEPTANCE.md`. Five highest-risk edge cases: hidden old CTA/trial in email preheader; manual override conflicting with an offer change; multi-script Arabic strings with numbers; unsupported claim that doesn't match a known banned phrase; stale/missing disclaimer embedded in older HTML. Each must be tested in the owning phase.

## 10. Questions and approval

The product owner should approve: default architecture A, authority for claim changes, local demo form behavior, precise review/export override policy, brand color/font/tone selection, and exact ownership. A technical reviewer should verify feasible SQLite/library/runtime choices before Phase 1. After approval, create an exact `writing-plans` plan for **Phase 1**, not one enormous plan for the whole app.

**Design gate:** `PENDING` until explicit human approval with date and recorded changes. No code from this draft alone.
