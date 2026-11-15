# BrandPilot agent entrypoint

Follow `AGENTS.md` as the **canonical** project instructions. Before **every** implementation task, read `AGENTS.md` and `IMPLEMENTATION_STATUS.md`. Do not duplicate rules here; they must stay consistent across Fable, Claude, Codex and other agents. After each small task, update `IMPLEMENTATION_STATUS.md` and `NEXT_AGENT_PROMPT.md` so another model can continue immediately.

---
# Project knowledge base

Two files hold hard-won project knowledge. They grow over time and get large,
so **never read them whole**. Search them instead:

.knowledge/buglog.json: past bugs, each with error_message, root_cause,
  fix, file, tags. Search before debugging anything that smells familiar.
.knowledge/cerebrum.md: conventions, decisions and corrections that are not
  derivable from the code. Search before writing code in an unfamiliar area.

## Search algorithm

1. Pick 2-3 keywords from the symptom: the exact error text, the file or class
   name, the package or API name, the screen or feature name.
2. Grep both files, case-insensitive, with a few lines of context (Grep tool with
   -i and -C 5, or rg -i -C 5). Start with the most specific keyword (the
   error text), then widen to the file name, then to a tag or feature word.
3. Read only the matching entry. If a hit is cut off, read just that range with
   Read offset/limit. Never open the whole file to "get context".
4. If nothing matches, widen once (a synonym or the parent feature). If there is
   still nothing, move on. A miss is a valid result.
5. Apply what you found. If it contradicts the code, trust the code and fix the
   stale entry.

A search costs a few hundred tokens. Loading a file costs hundreds of times more.

## Writing back (this habit is the point)

**After fixing a non-obvious bug**, append an entry to buglog.json with
  id, timestamp, error_message (the real text), file, root_cause (why
  it happened, not what you changed), fix, tags. Pretty-print one field per
  line so grep context works. If the same bug is already logged, bump its
  occurrences and last_seen instead of adding a duplicate.
**When the user corrects you, or a decision is made**, add a short dated entry
  under the right heading in cerebrum.md: the rule, plus why.
Only log what is not obvious from the code. No changelog entries, no trivia.
