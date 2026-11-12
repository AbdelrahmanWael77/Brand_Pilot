# BrandPilot — Decision Log, Open Questions, and Risks

## Decision format

`DEC-ID | date | status (PROPOSED/APPROVED/SUPERSEDED) | decision | rationale | alternatives | approver | evidence`

| ID | Status | Proposed decision | Reason / required approval |
|---|---|---|---|
| DEC-001 | PROPOSED | Use Claude Project Instructions + individually uploaded Markdown knowledge files + Git/Claude Code for actual coding | Makes context shared and engineering changes auditable; human owner must approve workflow |
| DEC-002 | PROPOSED | TypeScript npm workspaces, Vite/React, Express, SQLite, Vitest/Playwright | Simple local-first, reusable boundaries; confirm local environment |
| DEC-003 | PROPOSED | Deterministic templates for default generation; optional model adapter | No fabricated autonomous generation; explicit provider credentials only |
| DEC-004 | PROPOSED | Structured semantic dependency graph + immutable snapshot versions + asset revisions | Makes impact engine safe for offer changes and manual edits |
| DEC-005 | PROPOSED | Five channel assets + separate messaging guide **for each language** | Reconciles original deliverable count |
| DEC-006 | PROPOSED | Gate stale exports; allow human override only with visible warning + audit and no unknown unsupported claims | Prevent silent outdated package |
| DEC-007 | PROPOSED | FlowNest local form stores synthetic demo submissions only | No real lead-processing/privacy system assumed |

## Open questions (required before design approval, not all block the roadmap)

| ID | Owner | Question | Impact |
|---|---|---|---|
| Q-01 | Product Owner | Confirm design/architecture proposal and phased approach | Gate 0 blocks coding |
| Q-02 | Product Owner | Who signs brand creative/Arabic/legal/technical gates? | Evidence and review authority |
| Q-03 | Product Owner | Is the default export policy strict blocking for all errors and stale assets, with audited warning override for only nonfatal items? | UX/release semantics |
| Q-04 | Product Owner | For FlowNest, what exact color/font/text-logo identity and natural Arabic primary CTA are approved? | Phase 3 publishability |
| Q-05 | Technical Owner | Runtime support: Node version, SQLite native modules, browser availability? | Installation/test strategy |

## Risk register

| Risk | Severity | Mitigation | Evidence |
|---|---|---|---|
| RISK-01: Stale offer hidden in preheader, SVG, alt text or manual copy | Critical | Structured refs plus full-text audit, conflict flags, export gate | Offer-change regression + export manifest |
| RISK-02: AI invents claims from creative rhetoric | High | Fact ID registry, unsupported-claim QA + human review | Claim negative tests |
| RISK-03: RTL looks right but bidi breaks in mobile | High | DOM lang/dir/isolation + Playwright + native-language review | Screenshots + localization review |
| RISK-04: Claude team memory drifts from Git decisions | High | Repo is canonical post-setup; gate snapshots uploaded | Version stamp on memory |
| RISK-05: Upstream Superpowers not installed in Claude | Medium | Verify installation; apply explicit manual process; never misrepresent | Phase-start check |
| RISK-06: Optional model API used to bypass deterministic safeguards | High | Adapter output treated as unverified candidate; same validation gates | Provider contract tests |
| RISK-07: Editable layouts fail email clients | Medium | Conservative responsive tables/CSS; scope support and test clients | Render checks; unresolved clients listed |
| RISK-08: Export falsely called publish-ready | High | Review states and manifest; no blanket legal/culture claim | Gate audit |

## Change rule

Each decision status change needs human name/role, date, rationale, associated diff/PR or gate doc. Do not silently overwrite an old approved entry. Append a superseding row.
