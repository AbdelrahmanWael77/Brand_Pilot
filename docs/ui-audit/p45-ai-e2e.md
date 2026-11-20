# Phase 4.5 — the real AI, end to end (2026-11-20)

Branch `feat/p3-number-check` (from `feat/p6-track-record` 1a139a6 + demo history e546998). No code was changed in this phase.

## Safety checks

- `.env` is in `.gitignore` (`.env` and `.env.*`) and is not tracked. It was never committed on any branch or remote
  ref (`git log --all -- .env` is empty; no commit tree on any ref contains a `.env` file). The only env-like file
  ever committed was `.env.example`; none of its versions had a value filled in, and no commit on any ref ever added a
  string shaped like an Anthropic / OpenAI / OpenRouter key. `.env.example` was removed in 9fdbbf1.
- The key stays on the server: `server/ai.js` reads it from the environment and passes it only to the provider client;
  `GET /api/ai/status` and `PUT /api/ai/model` return provider, model id and the option list without keys.
- Checked at run time, after the six questions: the value of every secret in `.env` (AI keys, Cloudflare token, Canva
  and Meta secrets, token key) was searched in every database table (including the trail and reports), every `/api`
  response the page received, the page's HTML, localStorage and sessionStorage, the server's console output and the
  Markdown report: **0 matches everywhere**. The screenshots are taken from the page, which holds no key; the saved
  `screenshots-p45/results.json` was searched too: 0 matches.

## Set-up

FlowNest demo company built the canonical way (as `ui-tests/lib/flownest.mjs`) on an in-memory database, demo mode on,
the real AI from `.env`. Period on screen: last 28 days (21 Sep – 18 Oct 2026). Each question in a new conversation.
Times and tokens come from the provider's own response (the AI client's network was wrapped by the test harness to
read them; request headers were never read).

- Provider / model: **Anthropic, `claude-sonnet-5-5`** (the selection the server makes from `.env`)
- Prompt version: `director-2026-11-20`

## Results

| # | Question | Model | Time (AI / round trip) | Tokens in / out | Numbers vs screens | Arabic |
|---|---|---|---|---|---|---|
| 1 | What should we do first? | claude-sonnet-5-5 | 8.4 s / 8.9 s | 12,822 / 1,065 | all correct | — |
| 2 | What is our cost per lead? | claude-sonnet-5-5 | 4.0 s / 4.5 s | 12,825 / 401 | correct; says "not measured, not zero", marked partial | — |
| 3 | Which channel brings us the most enquiries, and is it worth more effort? | claude-sonnet-5-5 | 11.9 s / 13.0 s | 12,839 / 1,551 | all correct (incl. previous period) | — |
| 4 | ما الذي يجب أن نفعله أولاً؟ | claude-sonnet-5-5 | 11.2 s / 11.7 s | 12,910 / 1,276 | all correct | fluent; 3 slips (below) |
| 5 | كم تكلفة العميل المحتمل لدينا؟ | claude-sonnet-5-5 | 5.2 s / 5.7 s | 12,911 / 630 | correct; "غير مقاسة… لا يصح اعتبارها صفرًا", marked partial | fluent; 1 slip |
| 6 | ما أكبر نقطة ضعف تسويقية لدينا؟ | claude-sonnet-5-5 | 14.1 s / 14.7 s | 12,915 / 2,036 | all correct | fluent; loanwords |

Every number was compared with the server's KPIs, audit findings and channel comparison for the same period
(`/metrics`, `/audit`, `/director/context`): site 65 enquiries / 4,774 sessions = 1.36%; /pricing 7 / 1,676 = 0.42%
(35% of sessions); mobile 0.81% vs desktop 2.27% (62% of sessions); Organic Social 7 / 1,781 = 0.39% (37%); 13 of 48
leads without source = 27%; 48 leads, 16 qualified, 2 customers; spend not measured in 20 post rows; search 31
enquiries / 1,534 sessions = 2.02% (previous period 40, 2.6%, leads 15 → 12), qualified share 4 / 12 = 33%, Facebook
25%, Instagram 0 of 4; email 8 / 265 = 3.02%; the three search queries (positions 7.1–11.4, click rates 0.9–2.2%);
trial 14 days (website) vs 7 days (brochure). No invented or wrong number was found.

Both cost-per-lead questions came back with `insufficient: true`; the page shows "Partial answer — data missing".

### Arabic

Reads as fluent Modern Standard Arabic written for a business reader; structure and tone are natural. Slips:
- Q4: "أبدأ بخطوة…" should be the imperative "ابدأ"; the English word "demo" inside the Arabic ("بيانات demo"), and the
  demo note said twice; "14 يوم" (quoted from the approved fact) instead of "14 يومًا".
- Q5: "(demo)" in English again.
- Q6: colloquial loanwords "الموبايل، الديسكتوب، السوشيال، البروشور" where the app itself says "الجوال، سطح المكتب،
  التواصل الاجتماعي، الكتيّب" — natural in Egyptian marketing speech, but inconsistent with the screens.

A short Arabic glossary in the Director's prompt (the app's own terms, "بيانات تجريبية" for demo) would remove all of
these. Not changed in this phase.

### Labels and trail

- No AI answer showed "Rules engine — not AI" (checked in English and Arabic, in the page and the screenshots). AI
  answers show their status badge, "Synthetic" for demo data, the sources "checked on the server" and "Period used".
  Note: the page does not name the model on the answer; the model is in the trail.
- The trail has one `answer` row per question: engine `claude-sonnet-5-5`, prompt version `director-2026-11-20`, the
  asking user, the data fingerprint, the period, and the cited sources.

## Found, not fixed (display, not AI)

1. Paths such as "/pricing" inside Arabic text display as "pricing/" (right-to-left layout moves the slash; see
   `screenshots-p45/q6-ar.jpg`). The same happens in Arabic audit titles elsewhere in the app. Fix: isolate Latin paths
   and URLs (`<bdi dir="ltr">`) when rendering. Existing page code, not the AI path; left for P3, as the owner asked for
   no code changes here unless something is clearly broken.

(Checked and fine: the Arabic "Period used" line keeps both dates intact and in order, 2026-09-21 → 2026-10-18;
measured from where each date is drawn on the page.)

Screenshots and the per-answer data: `docs/ui-audit/screenshots-p45/` (`q1-en.jpg` … `q6-ar.jpg`, `results.json`).
