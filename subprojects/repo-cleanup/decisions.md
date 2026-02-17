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
