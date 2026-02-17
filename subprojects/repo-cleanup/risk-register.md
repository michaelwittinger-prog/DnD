# Repo Cleanup Risk Register

| ID | Risk | Impact | Likelihood | Mitigation | Status |
|---|---|---|---|---|---|
| R-001 | Removing/archiving legacy paths breaks hidden imports | High | Medium | Add reference scanner + PR proof before deletion | Open |
| R-002 | Subproject docs become accidental dependencies | Medium | High | Enforce finalized-subproject reference blocking in CI | Mitigated |
| R-003 | `.mjs/.mts` dual-surface diverges silently | High | High | Add strategy decision + drift check in cleanup wave | Open |
| R-004 | Cleanup PRs become too large to review safely | Medium | Medium | Use package-based small PR waves with rollback notes | Open |
