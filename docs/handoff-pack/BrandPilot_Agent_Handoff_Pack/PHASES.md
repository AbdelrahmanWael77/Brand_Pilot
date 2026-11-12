# BrandPilot — Lean Phased Backlog

**Goal:** a complete, secure, real-data MVP workflow before advanced extras. These are scopes and exit criteria, not instructions to build all phases at once. Check off only verified outcomes.

- [ ] **Phase 0 — Minimal setup**: Inspect the current project and `BrandPilot.html`. Confirm the simplest maintainable stack and app start/test commands. Preserve existing design. **Exit:** app starts and the next task is documented. Do not produce a large architecture report.
- [ ] **Phase 1 — SaaS foundation**: Secure authentication, company creation/switching, database persistence, company-scoped access, basic navigation and preserved EN/AR RTL. **Exit:** sign in, create a company, reload, and access only authorized company records.
- [ ] **Phase 2 — Company intelligence**: Company details; manual source text/file ingestion; draft facts with source evidence; human approve/reject; persistent approved knowledge. **Exit:** approved facts survive refresh, evidence is visible, and unapproved claims cannot be used as facts.
- [ ] **Phase 3 — Marketing analysis**: Reuse CSV/JSON import logic where appropriate; validate data; basic KPIs, audit and evidence-linked recommendations. **Exit:** imported real data changes metrics and auditable recommendations; unsupported conclusions are labeled.
- [ ] **Phase 4 — AI Marketing Director**: A real server-side AI call limited to company-approved context and relevant metrics; useful question answering and actions. **Exit:** ask a question, receive grounded advice with traceable support, no cross-company leak, and honest insufficient-data response.
- [ ] **Phase 5 — Campaign Studio MVP**: Create editable bilingual campaign plan/copy from an approved recommendation, basic offer/CTA/claims checks, save and export. **Exit:** create, edit, review and export a campaign linked to the originating recommendation.
- [ ] **Phase 6 — Enhancements (AFTER MVP)**: Live Meta/GA4/GSC integrations, scheduling, automated reports, advanced visual creative editor, landing pages, deeper intelligence, performance tuning and rollout polish. Implement by measured demand, not all at once.

**Do not confuse "phase planned" with "phase implemented."** Build Phase 0–5 in small tested increments. Security fixes required for a current phase are not deferred to Phase 6.
