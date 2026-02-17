# Repo Cleanup Subproject

This subproject is the execution workspace for repository structure cleanup.

## Goal

Reduce structural ambiguity and maintenance risk by:
- enforcing canonical vs deprecated paths,
- preventing re-coupling to finalized subprojects,
- documenting cleanup decisions and rollout.

## Scope

- Governance and guardrails for subproject lifecycle.
- Cleanup workplan and risk management.
- Automation checks integrated into local scripts and CI.

## Non-goals

- Feature development.
- Gameplay logic changes.
- Rules-engine behavior changes.

## Current Baseline (Git sync)

At initialization of this subproject:
- branch `main` is ahead of `origin/main` by 1 commit,
- one untracked file exists: `docs/mir_infrastructure_architecture_components.md`.

## Deliverables

- `workplan.md`
- `inventory.md`
- `decisions.md`
- `risk-register.md`
- `docs/repo_cleanup_governance.md` (canonical policy)
- `docs/gitlens_routine_checklist.md` (canonical operational checklist)
- `scripts/check-no-subproject-references.mjs` (automation)
