# Repository Cleanup Inventory (Initial)

## Canonical runtime/documentation zones

- `src/` — active implementation
- `tests/` — active validation suites
- `schemas/` — canonical MIR schemas
- `docs/` — canonical project documentation
- `.github/workflows/` — CI policy

## Transitional or legacy zones

- `client/` — documented as deprecated in architecture docs
- root-level legacy validators (`validate_*.js`, `check_*.js`, `gatekeeper.js`) coexist with modern `src/` equivalents
- dual-extension siblings in many paths (`.mjs` and `.mts`)

## Hygiene findings

- Local branch ahead of upstream by 1 commit (push pending)
- Untracked file present: `docs/mir_infrastructure_architecture_components.md`
- Temp-like filename artifact exists in root naming surface

## Initial recommendation

1. Enforce subproject lifecycle with finalized reference blocking.
2. Keep cleanup planning artifacts in subproject until promoted to canonical docs.
3. Resolve dual-extension policy with explicit source-of-truth rule.
