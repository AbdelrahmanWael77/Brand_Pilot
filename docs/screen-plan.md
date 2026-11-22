# BrandPilot screen plan (P7)

One plan per screen, following [ux-rules.md](ux-rules.md). For each screen: purpose, actions, what is visible first,
what is behind a click or moved to **Settings → Advanced**, and what is removed from view. Nothing is deleted from
the product: "removed" means removed from that screen; where it went is stated.

Checkpoint 1 builds Home, the shell (menu, header, one guide), the demo setup and the plain-language sweep.
Checkpoint 2 applies the same plan to the other screens.

---

## 1. Home

1. **Purpose:** see in one look how marketing is going and what to do next.
2. **Main action:** the button on "Your next step" (e.g. "Create campaign"). **Secondary:** "All numbers", the Ask
   box, "All next steps".
3. **Visible first (1440×900):**
   - Greeting by local time, with the user's name if known ("Good morning" / "صباح الخير").
   - One sentence: how the period went, with the biggest problem on a coral tint.
   - "Your next step": one card with a coral edge, a 2-line reason and one button.
   - 3 numbers (sessions, enquiries, qualified leads) with their change, then "All numbers".
   - A large Ask box with 3–4 suggested questions as pill buttons.
   - The company goal, in the interface language.
4. **Behind a click:** "See why" on the next step (evidence); "All numbers" opens Results; the period picker stays in
   the header.
5. **Removed from Home:** the gradient banner; "Health strong 0/7", "Needs you 0", "Priorities 3" counters; the
   "Needs you" card (its items show in Next steps); the six-card KPI strip (moves to Results); the Marketing health
   list (moves to Results); the date line; the "Synthetic demo data" chip (replaced by one thin banner per page).

## 2. Next steps (Recommendations)

1. **Purpose:** decide which improvements to make, in order.
2. **Main:** the action button on the top recommendation. **Secondary:** "Add to my tasks", "See why", filters.
3. **Visible first:** the top recommendation with a small coral marker, then about 5 more as rows (title, one line,
   one button).
4. **Behind a click:** evidence, data used, confidence and "not enough data" details ("See why"); the rest of the
   list ("Show more"); filters.
5. **Removed:** severity/category chips on every row (shown inside "See why"); repeated counts; "rules engine"
   wording; the explanation paragraph under the title.

## 3. Ask

1. **Purpose:** ask a question about your marketing and get a short, checked answer.
2. **Main:** "Ask". **Secondary:** suggested questions (pills), "Add to my tasks" on an answer.
3. **Visible first:** the question box and suggested questions; then the conversation. An answer shows a one-line
   headline, action items and caveats, and one small "✓ Numbers checked" mark.
4. **Behind a click:** the number check details ("✓ Numbers checked" opens them); sources of each number; the period
   and model line (moves into the details).
5. **Removed:** the lines above the chat (model, mode, prompt version, context size); "Rules engine — not AI" and
   other technical labels. The "Paste an answer from your own Claude" tool moves to Settings → Advanced.

## 4. My tasks

1. **Purpose:** track the improvements you accepted.
2. **Main:** "Make this week's review" (or the next task's action). **Secondary:** mark done, open a task's plan.
3. **Visible first:** this week's review (one card), then open tasks (about 5).
4. **Behind a click:** a task's step-by-step plan; finished tasks; the track record.
5. **Removed:** the paragraph under the title; the "History and setup checklist" block (the setup checklist goes into
   the guide; the activity link stays in Settings).

## 5. Campaigns list (Campaign Studio → Your content)

1. **Purpose:** see your campaigns and open one.
2. **Main:** "New campaign". **Secondary:** open, duplicate.
3. **Visible first:** campaign rows (name, status in one word, last change), about 5.
4. **Behind a click:** older campaigns ("Show more"); version history.
5. **Removed:** the logo/brand-kit banner (moves to Company info → Brand); the explanation paragraphs; the "AI Content
   Series" teaser (it has its own menu tab).

## 6. Campaign flow (create a campaign)

1. **Purpose:** turn a recommendation into a ready campaign, step by step.
2. **Main:** "Continue" on each step, "Create the content" on the last. **Secondary:** "Back", edit a field.
3. **Visible first:** a step bar (Brief → Strategy → Content → Check), the current step's fields, prefilled from
   approved facts.
4. **Behind a click:** where each prefilled value comes from (a small source link); advanced brief fields (fonts,
   colours) under "More options".
5. **Removed:** the template gallery from the first screen (it stays under "Single post"); duplicate explanations.

## 7. Check & download

1. **Purpose:** know whether a campaign is ready, fix what is not, and download it.
2. **Main:** "Download" when ready, otherwise the first "Fix" button. **Secondary:** preview each asset.
3. **Visible first:** one status line (green "Ready to download" / amber "2 things to fix"), the list of fixes with one
   button each.
4. **Behind a click:** the full check report per asset; version history.
5. **Removed:** the check names in technical wording ("placeholders", "offer-numbers"), replaced by plain sentences.

## 8. Content series

1. **Purpose:** make recurring posts in one look.
2. **Main:** "New series". **Secondary:** open a series, approve a post.
3. **Visible first:** your series (cards), or an empty state with one line and the "New series" button.
4. **Behind a click:** the 4-step creation form (opens after "New series"), the style details.
5. **Removed:** the always-open creation form when series exist; the long explanation under the title.

## 9. Reports

1. **Purpose:** get a report to read or share.
2. **Main:** "Download report". **Secondary:** period, preview, save a snapshot.
3. **Visible first:** the period picker and the main buttons; saved reports (about 5).
4. **Behind a click:** automatic reports (schedule); company reports to share.
5. **Moved to Settings → Advanced:** "Company knowledge (JSON)" and "AI context package (JSON)" (AI files).
   **Removed:** the explanation paragraphs.

## 10. Company sources

1. **Purpose:** see and add what BrandPilot learns your company from.
2. **Main:** "Add a source". **Secondary:** "Read my sources", remove a source.
3. **Visible first:** the sources list (name, type, "✓ Read" or "Not read yet").
4. **Behind a click:** the text of a source; character counts and dates.
5. **Removed:** "No AI model is set up…" note (Settings shows the AI status); the "Synthetic" chip on every row (one
   banner per page instead).

## 11. Company info (Company knowledge)

1. **Purpose:** check and approve what BrandPilot knows about your company.
2. **Main:** "Approve" on the facts waiting for you. **Secondary:** edit a fact, see its source.
3. **Visible first:** "Waiting for you" (facts to decide, about 5), then the approved profile by topic (one line each).
4. **Behind a click:** evidence and source of each fact; rejected facts; brand identity details.
5. **Removed:** decision-tracking details and status counters from the first view (they stay under each fact's
   details).

## 12. Data

1. **Purpose:** see which data is in and add more.
2. **Main:** "Add data" (drop a file). **Secondary:** per source: import, template, remove.
3. **Visible first:** one summary line ("5 of 6 sources added · last import …"), the source rows (one line each).
4. **Behind a click:** each source's details ("Unlocks…", file names, date ranges); post tags.
5. **Moved to Settings → Advanced:** import history and demo files. **Removed:** "Read-only by design…" paragraph
   (shown once in Settings → Your data).

## 13. Settings

1. **Purpose:** change your company, language and account settings.
2. **Main:** "Save" in each section. **Secondary:** export, delete.
3. **Visible first:** Company name, Arabic number style, Your data (privacy, in 3 short lines), Back up or move,
   Danger zone.
4. **Behind a click — Advanced (account owner):** AI model choice; "What is real, simulated, or waiting for a
   service"; AI files (company knowledge JSON, AI context package, paste an answer from your own Claude); import
   history; Activity; "How answers are made".
5. **Removed:** the technical title "Trust, privacy & AI settings" (now "Settings").

---

## Where things went (Checkpoint 1)

| Item | Before | Now |
|---|---|---|
| Health strong / Needs you / Priorities counters | Home banner | removed from Home; the same information is in Next steps and Results |
| "Needs you" card | Home | Next steps (its items are the recommendations and the facts waiting for you) |
| Six KPI cards and Marketing health | Home | Results (Home → All numbers) |
| AI model choice | Settings | Settings → Advanced |
| "What is real, simulated, or waiting for a service" | Settings | Settings → Advanced |
| Company knowledge JSON, AI context package | Reports | Settings → Advanced → AI files |
| Import history and demo files | Data | Settings → Advanced |
| Number-check details on answers | under every answer | behind "✓ Numbers checked" |
| Demo guide and the step guide | two floating buttons | one guide, in the page flow |

Settings → Advanced is shown to the account owner. BrandPilot has no user roles yet (every account owns its own
companies), so today every signed-in owner sees it; a separate admin role needs a server change and is not part of
P7.

---

## Checkpoint 2 (2026-11-21): what changed, and the three questions per screen

Owner decisions applied in both languages, on every screen and in the server and AI text: call to action = "زر
الإجراء" (English "action button"); Campaign Studio = "إنشاء حملة"; knowledge = "معلومات الشركة" (the screen is now
"Company info"); "sessions" = "visits" / "الزيارات"; channels in plain words ("your unpaid social media posts" /
"منشوراتك على السوشيال", see server/plain.js); Brand QA = "Check" / "الفحص". Settings → Advanced is collapsed by default.

For each screen: **5 s?** can a new user tell what it is for in 5 seconds · **Distracting?** · **What else to remove.**

| Screen | What changed in Checkpoint 2 | 5 s? | Distracting? | What else to remove |
|---|---|---|---|---|
| Home | Plain words in the sentence and the next step; 3 short questions in one row; the menu shows your initial and the company name (the e-mail is in the account menu) | Yes | No | The "Compared with…" line |
| Next steps | No text under the title; "Needs you" is one line and one button, only when something waits; no ask box; 3 filters; a row = number, title, reason, one action; confidence is quiet text inside "See why"; coral only on row 1; 5 rows, then "Show more"; export moved to Reports | Yes | The amber "Needs you" line, when present (it is meant to be seen) | The track record card could move to My tasks |
| Ask | One page: the question box and 4 short questions; the grounding line, "How answers work", the audit cards and the question tabs are gone; "Test the number check" is a small link, demo only; the conversation list appears once there are conversations | Yes | No | — |
| My tasks | One line under the title | Yes | The explanation line under "Improvement tasks" | "History and setup checklist" could move into the guide |
| Campaigns list | Reached from the campaign switcher ("Create something new" / your content) | Mostly | — | A real list page is still to do (see open items) |
| Campaign Studio | No breadcrumb and no "Template drafts… not model-written"; step bar Brief → Drafts → Check & download; in Drafts the preview is large and the fields open on "Edit" | Yes | No (the action bar under the preview no longer floats over the post list) | The "EXTRAS" label |
| Check & download | Title "Check & download"; one status line ("Ready to download" / "N things to fix" / "Approve the strategy"); only failing checks are listed, the passing ones behind "Show all checks"; the same step bar | Yes | The version history card next to the checks | Version history could go behind a link |
| Content series | One line under the title; with no series: one line and "New series"; the form opens after the click | Yes | The form header uses the series colours (dark) | — |
| Reports | One line under the title; "Download" is the main button; the automatic report folds; no file-format labels | Yes | No | "Company reports" could fold |
| Company sources | One line under the title; the "no AI model" note is gone (Settings shows it); no "Synthetic" labels | Yes | The character counts on each row | Character counts |
| Company info | Renamed; one line under the title, no tool names; version and history behind a small "History" link; "Needs you first" kept | Yes | The ring "8/9" | — |
| Data | One line under the title; light summary band; "Add a file" instead of "Import CSV / JSON / Excel"; plain demo wording | Mostly | File names and date ranges on each source | Per-source details could fold |
| Settings | Backup buttons in plain words (no "JSON"); Advanced collapsed by default | Yes | The four "Your data" lines | — |
| Results, Leads | One line under the title; light bands instead of dark gradients | Yes | The "step by step" explanation | That explanation |

## Where things went (Checkpoint 2)

| Item | Before | Now |
|---|---|---|
| "Export (MD)" | Next steps header | Reports → Company reports → Marketing audit |
| Ask box | Next steps | Ask tab (and Home) |
| "Working well" and "Risks & gaps" filters | Next steps | "All" (strong items) and "To fix" (risks and gaps) |
| Marketing health | Next steps (folded) | Results |
| Grounding line, "How answers work" | above the Ask chat | each answer's "Numbers checked" mark |
| Audit cards and question tabs | Ask start page | Next steps (the same items); 4 short questions on Ask |
| Breadcrumb and "Template drafts…" | Campaign Studio header | removed; the campaign switcher keeps "Create something new" |
| Editing fields (Words, Look, Picture) | always open | behind "Edit" |
| Passing checks | always listed | behind "Show all checks" |
| Version in use, History | Company info summary | behind "History" |
| Automatic report | always open | folded under "Automatic report" |
| E-mail address | bottom of the menu | in the account menu (click your initial) |

**Admin role (handoff):** Settings → Advanced is collapsed by default and visible to every signed-in account owner.
A real admin role (who may see and change the AI model, AI files and import history) needs a server change and is
left for later.

---

## Checkpoint 2, part 2 (2026-11-22): palette 2, navigation and the new screens

Palette 2 (deep teal `#0F6E68`, coral accent `#E07A5F`) is the app's palette. Navigation: the light sidebar with groups
(part 1). For each screen: **5 s?** · **Distracting?** · **What else to remove** (and whether it was removed).

| Screen | What changed | 5 s? | Distracting? | What else to remove |
|---|---|---|---|---|
| Home | The next step is one short line ("Send social media visitors to one focused page"); the full action is in "See why" | Yes | No | — |
| Ask | Answers: numbered steps each with "Add to my tasks"; the prompt now asks for possible reasons, no forecasts, no ranking by estimated impact | Yes | No | — |
| Recommendations | Unchanged since part 1 (one-line notice, 3 filters, simple rows) | Yes | The amber notice (meant to be seen) | — |
| My tasks | Active / Completed; one row per task: title, where it came from, one action (Plan it / Open plan), the rest under ⋯; the weekly review below | Yes | No | The "History and setup checklist" fold |
| Track record | Its own page: the note under the title, the score card, one row per step with its outcome on the right; the demo label once | Yes | The demo explanation box (required: demo data must be labelled) | The per-step dates (hidden) |
| Campaigns | A list: one line per campaign with a plain status and "Open"; "New campaign"; "Make a single post instead" is a quiet link | Yes | No | — |
| New campaign | One box "What is your campaign about?", "Create drafts", up to 3 next steps to start from. From a recommendation this screen is skipped | Yes | No | — |
| Review drafts | Draft list (name and status), a large preview, "Edit" and "Remove"; a problem shows on the draft with "Fix"; bottom bar "N things need you before download" / "Fix first" and "Approve and download" (records the strategy approval on the server, then downloads); "Campaign details" and "All checks" are small links | Yes | No | — |
| Results | 3 numbers, one chart with a Visits / Enquiries / Qualified leads switch, the channel table with only the problem row marked; "More detail" opens the earlier page | Yes | No | — |
| Leads | 3 numbers, one chart (Leads / Qualified), lead sources; a source with fewer than 15 leads says "Not enough data yet (needs 15 leads, has N)"; "More detail" opens the earlier page | Yes | No | — |
| Content series | With no series: one line, "Create your first series", six kinds of series as starting options (a kind opens the form with it chosen) | Yes | No | The creation form is still one page (see open items) |
| Company info, Reports, Sources, Data, Settings | As in checkpoint 2 v1 (one line under the title, light bands, plain words); Settings has a Language section | Yes | — | — |

### Where things went (part 2)

| Item | Before | Now |
|---|---|---|
| Campaign Studio on opening Campaigns | the last campaign's editor | the Campaigns list; a campaign opens on Review drafts |
| The draft editor (words, look, picture) | Studio → Drafts | Review drafts → Edit |
| Step bar (Brief → Drafts → Check & download) | Studio | the editor and Check & download (Review drafts links "All checks") |
| Detailed Results (platform tabs, compare channels, funnel) | Results | Results → More detail |
| Detailed Leads (definitions, experiments, funnels) | Leads | Leads → More detail |
| Track record | end of Recommendations | Next steps → Track record |
| Guide progress ("Step 3 of 7") | header button | inside the guide panel |

### Open items

- Content series creation is still one form with numbered sections, not the 3-step flow (Name and type → Past posts →
  Approve the style); the series page and post review are unchanged.
- Review drafts shows checks the browser and the server agree on; per-draft fixes open the editor for that draft.

---

## Finishing round (2026-11-22): palette 1 and the remaining screens

Palette 1, cobalt & apricot, is the app's palette (sign-in page included): main `#1F4FD6`, dark `#1A3FAE`, active
`#EDF2FF`, apricot `#E8833A` on `#FDF1E6` (only: the highlighted problem on Home, the next-step edge, the problem row of
Results), page `#F7F8FA`, lines `#E4E7EC`, text `#111827` / `#414A5A`. AA contrast: the contrast test of every screen in
English and Arabic passes.

| Screen | What changed | 5 s? | Distracting? | What else to remove |
|---|---|---|---|---|
| Review drafts | One row per draft (Facebook post, Instagram post, LinkedIn post, Landing page, Email, Messaging guide); EN / ع switch above the preview; the post preview fits the first screen; Remove removes both languages | Yes | No | — |
| New campaign | "Or start from a next step" shows the short next-step line, or the recommendation's full title — never cut text | Yes | No | — |
| Campaigns, Review drafts | Campaign names in both languages (a campaign from a recommendation takes its title in each language) | Yes | No | — |
| Track record | "Demo history (synthetic data)" once, as a small label next to the score; the long demo note is hidden | Yes | No | — |
| Company info | One line: "8 of 9 key topics covered · 1 missing" (no ring, no counters); "Needs you first" as one compact row with the question and Save | Yes | No | — |
| Data | One row per source: name, "Added" / "Not added yet", last update, "Add a file"; Connect, Template, Remove data and Tag posts under ⋯; no file names, no row counts; the demo button is a small link in demo mode | Yes | No | The drop zone could go (each row has "Add a file") |
| Sources, Settings | No character counts; no explanation lines; "Your data" folds | Yes | No | — |
| Content series | Creating: 3 steps (Name and type → Past posts, optional, with Skip → Approve the style with a large preview); the series page: "What's the topic of the next post?" and the past posts, settings folded; post review: "Approve and download" is the main action | Yes | The series banner uses the series colours | — |

Where things went: Data → file names, row counts, "Template", "Remove data", "Connect" and "Tag posts" are under each
row's ⋯ (Template, Remove data, Connect) or gone from view (file names and row counts stay in Settings → Advanced →
Import history); "Review post tags" when every post is tagged is no longer on Data (tagging opens from a row's ⋯ when
posts need a theme). Company info → the ring and the confirmed / to-check counts are gone from view; version and history
behind "History". Track record → the demo note is hidden (the label next to the score stays).

## Last fixes (2026-11-22): Content series header, flagged lines on the series post, Data buttons

| Screen | What changed | 5 s? | Distracting? | What else to remove |
|---|---|---|---|---|
| New content series | The dark banner, "AI CONTENT SERIES" and "PREVIEW" are gone; the light page header: "New content series", one line, "Create series" | Yes | No | — |
| Series page | The dark series banner is gone; the light page header: the series name, its purpose, the badges as plain small text (style · channel · goal · posts), "Create a post" | Yes | Two blue buttons close together ("Create a post" in the header, "Write the post" in the topic box) | "Create a post" could go if the topic box is enough |
| Series post review | Light card like campaign Review drafts; each flagged line on the post with "Fix" and "It's correct"; while something is flagged the main button is "Fix 1 thing first" / "Fix 2 things first" and goes to it | Yes | No | — |
| Data | No big drop zone; every "Add a file" is outline; only a source that is "Not added yet" has the blue button | Yes | No | — |

Where things went: the "I checked these" box for all flagged statements → one "It's correct" per line (a number taken
out of the words counts as fixed). The drop zone's "several files at once" picker → the small link "Add several files
at once" under the sources. The creation form's explanation lines (the banner text, the 4-step list, the brand-kit note
under the preview) are hidden; the step bar says the same.

Owner follow-up (2026-11-22): the series page header has no button ("Create a post" removed; "Write the post" in the
topic box is the main action). Series approvals and each "It's correct" are now recorded on the server and in the
trail (Settings → Activity lists them).
