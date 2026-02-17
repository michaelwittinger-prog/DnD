# Package 5 — Canonicalization Mega-Package

## Locked decisions
- **Model:** Claude Opus 4.6 (no switch)
- **Canonical extension (revised by evidence):** `.mjs` = source-of-truth
- **`.mts` policy:** keep only intentionally diverged files pending focused convergence

## Workstreams

### A — Canonical module policy + seam burn-down
- [x] Analyze sibling inventory and classify seams
- [x] Delete 50 byte-identical `.mts` duplicates (52 → 2 seams)
- [x] Add seam budget gate in CI (`check:seams`, max 5)

### B — Root legacy entrypoint retirement
- [ ] Repoint root JS files to `src/*` canonical implementations
- [ ] Add deprecation warnings + removal version markers
- [ ] Reduce root file logic to near-zero wrappers

### C — CI hardening
- [ ] Promote `check:temp` to strict mode (with allowlist)
- [x] Enforce `check:subprojects` in CI workflow
- [x] Add seam count threshold gate (`check:seams`)

### D — Documentation + migration contracts
- [x] Create `docs/mir_canonical_architecture.md`
- [x] Document module ownership + extension policy
- [ ] Publish migration matrix (old path → canonical path)

### E — Validation + rollback safety
- [ ] Add regression tests for wrapper parity
- [ ] Add seam-reduction CI artifact
- [x] Phased commits with rollback checkpoints

## Remaining diverged seam pairs (intentional defer)

- `src/ui/main.{mjs,mts}` — materially different implementations
- `src/server/localApiServer.{mjs,mts}` — minor divergence pending focused review

## Status: PARTIALLY COMPLETE — closed with deferred items tracked