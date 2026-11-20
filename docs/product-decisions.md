# BrandPilot — product decisions beyond the brief

Moved out of the app (Settings → "Product decisions beyond the brief") on 2026-11-20, during P2: these are internal
notes for the team, not something a customer needs to read in Settings. Wording kept as it was in the app.

Choices made on purpose, and why:

- **Leads import promoted to a first-class integration.** It is the only way to optimise for quality rather than
  clicks, and the cheapest to deliver.
- **Health is a checklist, not a score.** Each dimension lists named checks and shows how many pass, so no number is
  arbitrary.
- **Conflict detection between your own documents.** Outdated brochures are a common source of wrong campaign copy.
- **Language is never machine-invented.** Arabic assets use approved Arabic wording; missing wording is flagged
  instead of guessed.
- **Stale-content export gate.** After a campaign change, assets that could not be updated safely block the package
  until reviewed.
- **Baseline-relative verdicts.** Campaigns are judged against the company's own non-campaign numbers, with the
  causation caveat stated every time.
- **Experiments carry a significance test.** Results you enter get a two-proportion test so small samples are not
  over-read.
- **Deliberately left out:** auto-publishing, competitor scraping, and a generic "AI score". They demo well and add
  risk before trust is earned.

Later decisions (since P1, 2026-11-19) are recorded in `docs/ui-audit/README.md` and `docs/ui-audit/p1-baseline-diff.md`.
