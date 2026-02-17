# Package 5 — Canonicalization Mega-Package

## Locked decisions
- **Model:** Claude Opus 4.6 (no switch)
- **Canonical extension:** `.mts` = source-of-truth
- **Fallback:** `.mjs` = compatibility shim (auto-generated or thin wrapper)

## Workstreams

### A — Canonical module policy + seam burn-down
- [ ] Create `scripts/canonicalize-seams.mjs` audit tool
- [ ] For each of the 52 `.mjs/.mts` sibling pairs, determine canonical `.mts` and convert `.mjs` to thin re-export shim
- [ ] Add seam budget gate in CI

### B — Root legacy entrypoint retirement
- [ ] Repoint root JS files to `src/*` canonical implementations
- [ ] Add deprecation warnings + removal version markers
- [ ] Reduce root file logic to near-zero wrappers

### C — CI hardening
- [ ] Promote `check:temp` to strict mode (with allowlist)
- [ ] Enforce `check:subprojects` and `report:seams` in CI workflow
- [ ] Add seam count threshold gate

### D — Documentation + migration contracts
- [ ] Create `docs/mir_canonical_architecture.md`
- [ ] Document module ownership + extension policy
- [ ] Publish migration matrix (old path → canonical path)

### E — Validation + rollback safety
- [ ] Add regression tests for wrapper parity
- [ ] Add seam-reduction CI artifact
- [ ] Phased commits with rollback checkpoints

## Status: APPROVED — executing