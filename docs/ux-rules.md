# BrandPilot UX rules

These rules apply to every screen, in English and Arabic. Ease of use comes before looks: when a rule and a visual
idea disagree, the rule wins. Owner's rules, 2026-11-21 (P7).

## 1. Organisation

- **One purpose per screen.** A screen answers one question or does one job. Anything else moves to its own screen
  or behind a click.
- **Group related things.** Things that belong together sit in one card or section, with one short title.
- **Clear hierarchy.** Each screen has **one main action** (indigo button). Other actions are quieter: a secondary
  (outlined) button or a link.
- **Two levels.** The summary is visible. Details open on a click: "See why", "Details" or an expand arrow.
- **Short lists.** A list shows about 5 items, then "Show more".
- **Same action, same place.** The main action sits in the same spot on every screen: top right of the page header
  (top left in Arabic), or at the bottom of a card for card-level actions.

## 2. No distraction

- No decorative badges, labels, banners, counters or repeated information.
- No boxes inside boxes. No border and shadow on the same element.
- Indigo (#4F46E5) only for main actions, links and the active menu item.
- Coral only for the single most important thing on a screen (see "Colour"). At most 1–2 coral touches per screen.
- Green, amber and red only when they mean something. Red only for real problems.
- No pop-ups or floating elements covering content. The guide sits in the page flow, never on top of it.

## 3. Text

- Short titles. At most one line under a page title.
- Card text: at most 2 lines.
- Short button labels (1–3 words).
- No explanation paragraphs. A "?" tooltip only where it is really needed.
- Plain words a marketing manager uses. No technical words (no "rules engine", "model", "JSON", "fixtures",
  "audit trail", "extraction", "pipeline", "prompt", "token").
- Arabic is written as Arabic, not translated word by word ("صفحة واحدة مخصصة", not "صفحة هبوط").

## 4. Calm visuals

- Body text 15–16px; nothing below 13px.
- Lines of about 70 characters or less.
- Spacing on an 8px grid (8, 16, 24, 32, 48).
- One icon style (outline, 1.75 stroke) and one size per context (16 inline, 20 in menus and cards).
- All text meets WCAG AA contrast (4.5:1, or 3:1 for text 24px and larger).

## 5. Easy to use

- The user always knows where they are (active menu item, page title) and what to do next (one main action).
- Every action gives feedback: loading ("Reading your data…"), success (green check), error with a fix
  ("Couldn't save. Try again").
- Every empty screen has one line saying what to do and one button to do it.
- The same component looks and works the same everywhere (one card, one button set, one tab style, one list row).
- Keyboard: everything works with Tab, Enter and Escape; focus is always visible.

## Colour (Indigo and coral)

| Token | Hex | Use |
|---|---|---|
| Sidebar | #262A5E | menu background |
| Sidebar text | #E6E8FF | menu text and icons |
| Sidebar active | #363B7A | active menu item |
| Primary | #4F46E5 | main buttons, links, focus, active tab |
| Coral | #F2725B | accent edge or marker only (never text on white, never a button with white text) |
| Coral tint | #FDECE8 | background behind the most important sentence; text on it uses the main text colour |
| Workspace | #F8F8FC | page background |
| Main text | #1A1C3D | text |
| Amber | #9A5B00 on #FFF4E0 | needs attention |
| Red | #B42318 on #FDECEC | real problems only |
| Green | #0B7349 on #E7F6EE, with a check icon | success |

Coral, where it is allowed:
1. Home: the coral tint behind the biggest problem in the opening sentence.
2. The accent edge of the "Your next step" card.
3. A small marker on the top recommendation in Next steps.
