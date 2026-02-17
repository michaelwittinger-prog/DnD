# Repository Cleanup Governance

This document defines how `subprojects/` may be used and how finalized subprojects are prevented from becoming long-term dependencies.

## Policy

1. `subprojects/*` are temporary execution workspaces.
2. Canonical implementation and operational docs must live in canonical zones (`src/`, `scripts/`, `docs/`, `.github/workflows/`).
3. After a subproject is finalized, references to that subproject path are blocked by automation.

## Lifecycle States

States are defined in `subprojects/_registry.json`:

- `active`: open execution workspace.
- `finalized`: work complete; canonical outputs promoted.
- `archived`: historical record only; no references allowed.

## Finalization Procedure

1. Promote required outputs from `subprojects/<id>/` to canonical locations.
2. Add `FINALIZED.md` in the subproject directory with:
   - finalization date,
   - promoted canonical artifact list,
   - closure summary.
3. Update `subprojects/_registry.json` entry:
   - set `status` to `finalized`,
   - set `finalizedAt`,
   - populate `canonicalOutputs`.
4. Ensure `npm run check:subprojects` passes.
5. Optionally move to `archive/subprojects/<id>/` and set `status` to `archived`.

## Enforcement

- Script: `scripts/check-no-subproject-references.mjs`
- CI: runs on every push/PR through `npm run check:subprojects`

The checker scans canonical zones and fails when it finds path references to any subproject marked `finalized` or `archived`.
