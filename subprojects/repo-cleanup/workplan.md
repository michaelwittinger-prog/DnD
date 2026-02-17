# Repo Cleanup Workplan

Status legend: `todo` | `in_progress` | `done`

## Package 0 — Repo Sync & Baseline Gate (gpt5.3codex)

- [x] Check branch divergence against GitHub (`ahead +1`)
- [x] Check local untracked changes (`docs/mir_infrastructure_architecture_components.md`)
- [x] Decide push/stash policy before cleanup PR slicing

## Package 1 — Architecture & Policy Decisions (opus4.6)

- [x] Define finalized-subproject “no-read” policy concept
- [x] Define lifecycle states: active/finalized/archived
- [x] Approve canonical `.mjs/.mts` consolidation strategy (revised by evidence to `.mjs` canonical)

## Package 2 — Guardrails & Automation (gpt5.3codex)

- [x] Create subproject registry (`subprojects/_registry.json`)
- [x] Add automated checker to block references to finalized subprojects
- [x] Wire checker into npm scripts + CI

## Package 3 — Docs Consolidation & Contributor UX (sonnet)

- [x] Add cleanup subproject README
- [x] Add governance doc in canonical `docs/`
- [x] Add GitLens routine checklist in canonical `docs/`

## Package 4 — Mechanical Cleanup PR Waves (gpt5.3codex)

- [x] Low-risk PR wave (ignore hygiene, stale temp cleanup, doc-link normalization)
- [x] Medium-risk PR wave (freeze/remove deprecated paths after proof)

## Package 5 — Final Review & Handoff (sonnet)

- [x] Archive/finalize subproject lifecycle metadata and mark registry status
- [x] Publish post-cleanup maintenance rules summary

## Closure note

- Package 5 canonicalization executed with phased commits and CI hardening.
- 50 duplicate `.mts` files removed; 2 diverged seam pairs intentionally deferred for focused follow-up.
