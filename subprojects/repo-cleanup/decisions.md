# Repo Cleanup Decisions Log

## D-001 — Subprojects are temporary execution workspaces

- **Status:** Accepted
- **Decision:** `subprojects/*` are implementation workspaces only, not canonical runtime/documentation dependencies.
- **Rationale:** Enables focused execution without introducing long-term dependency coupling.

## D-002 — Finalized subprojects must not be referenced

- **Status:** Accepted
- **Decision:** Once a subproject is finalized, references to its path are blocked by automation.
- **Rationale:** Prevents accidental long-term reliance on temporary planning artifacts.

## D-003 — Lifecycle registry is authoritative

- **Status:** Accepted
- **Decision:** `subprojects/_registry.json` is the source of truth for subproject status (`active|finalized|archived`).
- **Rationale:** Keeps policy enforcement deterministic and machine-checkable.

## D-004 — Canonical extension policy (revised by evidence)

- **Status:** Accepted
- **Decision:** `.mjs` is canonical runtime source; `.mts` is retained only where deliberately diverged.
- **Rationale:** Repository-wide analysis showed most `.mts` siblings were byte-identical duplicates and excluded from root `tsconfig.json` includes.

## D-005 — Diverged seam pairs are explicitly deferred

- **Status:** Accepted
- **Decision:** Keep `src/ui/main.{mjs,mts}` and `src/server/localApiServer.{mjs,mts}` as temporary intentional seams pending focused convergence work.
- **Rationale:** Both pairs have meaningful differences; forced merge during cleanup would be high-risk and outside low-risk canonicalization scope.
