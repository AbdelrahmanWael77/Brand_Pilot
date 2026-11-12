# ADR-0001: Domain-centered, deterministic, local-first architecture

**Status:** PROPOSED / NOT APPROVED  
**Date:** 2026-11-11

## Context

BrandPilot must coordinate claims, copy, brand tokens, campaign versions and editable bilingual assets through changes. No hosted account or model API may be assumed.

## Decision proposed

Use TypeScript npm workspaces (React/Vite frontend, Express Node API, SQLite persistence, pure domain/templates/QA modules). Deterministic content templates and explicit claim dependencies are the default. Optional model API can only supply unapproved candidate copy that is subjected to the same rules. Use immutable version snapshots, per-slot provenance and content-hash-based review invalidation.

## Alternatives

- Model-only regeneration: flexible but opaque and brittle for claim verification and preserving manual edits.
- Static generator without version storage: simple but fails change impact/history/export freshness.

## Consequences

Requires careful schema and dependency mapping early, but makes edits, audit trails and tests demonstrable. Needs SQLite migration test strategy and HTML/SVG sanitation. Does not itself guarantee Arabic quality, legal compliance, or contrast in every possible design.

## Approval

Await human owner and technical reviewer. Supersede with a new ADR on architecture change; do not erase history.
