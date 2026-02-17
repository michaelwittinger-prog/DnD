# GitLens Routine Checklist (Cleanup PRs)

Use this checklist for every repository-cleanup PR.

## 1) Before coding (3–5 min)

- [ ] Open GitLens Commit Graph and confirm branch is up-to-date with `main`.
- [ ] Confirm working tree scope (no unrelated edits).
- [ ] Open file/line history for planned deletions or deprecations.

## 2) During edits

- [ ] Use Current Line Blame for risky removals/renames.
- [ ] Use File History to verify legacy status and recent activity.
- [ ] For `.mjs/.mts` siblings, compare both histories before choosing source-of-truth.

## 3) Pre-commit

- [ ] Review “Open Changes” for unintended modifications.
- [ ] Compare Working Tree ↔ HEAD on each critical file.
- [ ] Run `npm run check:subprojects`.

## 4) Pre-PR quality gate

- [ ] Commit graph is clean (no accidental merges/noise).
- [ ] Commits are single-purpose and reviewable.
- [ ] Deletion commits include rationale and rollback note.

## 5) Pre-merge

- [ ] Compare branch with `main` and re-check risky files.
- [ ] Confirm CI guardrails passed.
- [ ] Validate no references to finalized/archived subprojects were added.

## 6) Post-merge hygiene

- [ ] Update `subprojects/_registry.json` lifecycle state if needed.
- [ ] Promote final outputs to canonical docs/code locations.
- [ ] If finalized, add `FINALIZED.md` and archive workflow notes.
