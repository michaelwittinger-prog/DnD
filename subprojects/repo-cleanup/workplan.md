# Repo Cleanup Workplan

Status legend: `todo` | `in_progress` | `done`

## Package 0 — Repo Sync & Baseline Gate (gpt5.3codex)

- [x] Check branch divergence against GitHub (`ahead +1`)
- [x] Check local untracked changes (`docs/mir_infrastructure_architecture_components.md`)
- [ ] Decide push/stash policy before cleanup PR slicing

## Package 1 — Architecture & Policy Decisions (opus4.6)

- [x] Define finalized-subproject “no-read” policy concept
- [x] Define lifecycle states: active/finalized/archived
- [ ] Approve canonical `.mjs/.mts` consolidation strategy

## Package 2 — Guardrails & Automation (gpt5.3codex)

- [x] Create subproject registry (`subprojects/_registry.json`)
- [x] Add automated checker to block references to finalized subprojects
- [x] Wire checker into npm scripts + CI

## Package 3 — Docs Consolidation & Contributor UX (sonnet)

- [x] Add cleanup subproject README
- [x] Add governance doc in canonical `docs/`
- [x] Add GitLens routine checklist in canonical `docs/`

## Package 4 — Mechanical Cleanup PR Waves (gpt5.3codex)

- [ ] Low-risk PR wave (ignore hygiene, stale temp cleanup, doc-link normalization)
- [ ] Medium-risk PR wave (freeze/remove deprecated paths after proof)

## Package 5 — Final Review & Handoff (sonnet)

- [ ] Archive finalized subproject and mark registry status
- [ ] Publish post-cleanup maintenance rules summary
