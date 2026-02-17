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

## Shell Compatibility Hardening

- No inline `&&` / `||` in npm scripts.
- Use Node orchestration scripts for sequencing commands.
- Preserve non-zero exit-code propagation on first failure.
- Keep PowerShell-safe command patterns across automation.
- Validate key scripts in CI and local shells.

---

## Shell-Compatibility Hardening (Windows PowerShell 5.1)

### Problem
This project runs on Windows with **PowerShell 5.1** (`powershell.exe`) as the default shell. PowerShell 5.1 does **not** support the Bash-style `&&` operator for command chaining. It also does not have `rg` (ripgrep) available by default.

Using `&&` or `rg` in ad-hoc shell sequences causes hard failures that are difficult to diagnose.

### Rules

1. **No `&&` or `||` in shell sequences passed to PowerShell 5.1.** Use separate commands or Node scripts instead.
2. **No assumption of external search tools** (`rg`, `fd`, etc.). Use `Get-ChildItem` (PowerShell) or Node's `fs` module in scripts.
3. **All multi-step cleanup operations must be implemented as Node `.mjs` scripts**, not inline shell chains. This makes them shell-agnostic by design.
4. **No raw `Remove-Item` batches** for cleanup: use `npm run cleanup:safe` which validates each path before acting.

### Available Safe Commands

```
npm run cleanup:safe     # live run — deletes files listed in scripts/repo-cleanup-safe.mjs
npm run cleanup:verify   # dry-run (--verify) — previews what would be deleted
npm run check:seams      # reports .mts/.mjs sibling pairs
npm run check:temp       # reports temp artifacts
npm run check:subprojects # validates no finalized subproject references in canonical zones
```

### Optional Environment Improvement (Recommended)

To enable `&&` natively in the terminal, install PowerShell 7:

```
winget install --id Microsoft.PowerShell --source winget
```

Then set VS Code's default terminal to `pwsh` (PowerShell 7) instead of `powershell.exe` (5.1).

This is **optional** — the repo-side rules above remove the dependency on `&&` regardless.

### Incident Log

| Date       | Failure                         | Fix Applied                            |
|------------|---------------------------------|----------------------------------------|
| 2026-02-17 | `rg` not found on Windows       | Replaced with Node FS / `Get-ChildItem` |
| 2026-02-17 | `&&` rejected by PowerShell 5.1 | All sequences moved to `.mjs` scripts  |
| 2026-02-17 | Garbled temp path in delete list| `cleanup:safe` validates paths first   |

---

## Shell-Compatibility Hardening (added 2026-02-17)

### Problem

This project runs on **Windows PowerShell 5.1** by default. Several automation failures were
traced to shell-dialect assumptions that are incompatible with this environment:

| Assumption | Symptom | Root Cause |
|---|---|---|
| `&&` chaining | `token '&&' is not a valid statement separator` | PowerShell 5.1 does not support `&&`; only PowerShell 7+ and Bash do |
| `rg` (ripgrep) | `The term 'rg' is not recognized` | ripgrep is not installed; only `git`, `npm`, `node`, etc. are available |
| Batch `Remove-Item` on unvalidated paths | `Cannot find path ... nul` | Windows device names and garbled paths passed without validation |

### Permanent Rules

1. **Never use `&&` or `||` in commands intended for manual or automated execution on Windows PowerShell 5.1.**  
   Use separate `node scripts/...mjs` invocations instead, or sequence via Node code.

2. **Never use `rg`, `grep`, `find`, `sed`, or `awk` in npm scripts or cleanup commands.**  
   Use `Get-ChildItem` / `Select-String` (PowerShell) or Node FS APIs.

3. **Never include `nul`, `con`, `prn`, or other Windows device names as file paths in Remove-Item batches.**  
   Use `scripts/repo-cleanup-safe.mjs` which blocks reserved names.

4. **All file removal operations must use `scripts/repo-cleanup-safe.mjs`.**  
   Direct `Remove-Item` batches are prohibited for automated cleanup tasks.

### Safe Cleanup Commands

```powershell
# Preview what would be deleted (dry-run / CI verify)
npm run cleanup:verify

# Apply deletions
npm run cleanup:safe
```

### Optional Environment Upgrade

To enable `&&` natively in the terminal, install PowerShell 7:

```powershell
winget install --id Microsoft.PowerShell --source winget
```

Then set VS Code default terminal shell to `pwsh`. This is **optional** — the repo-side rules
above remove the dependency on `&&` regardless.

### Files

- `scripts/repo-cleanup-safe.mjs` — safe, idempotent, path-validated cleanup runner
- `package.json` scripts: `cleanup:safe`, `cleanup:verify`

---

## Shell-Compatibility Hardening

### Problem (Incident 2026-02-17)

A cleanup step got stuck because:

1. `rg` (ripgrep) was assumed to be installed — it is not on this machine.
2. Bash-style `&&` chaining was used in PowerShell 5.1, where `&&` is **not a valid statement separator**.
3. A deletion batch included garbled paths and the Windows device name `nul`, causing partial failures.

### Rules for All Automation Scripts

| Rule | Rationale |
|---|---|
| Never use `rg` (ripgrep) in npm scripts or CI steps | Not installed by default on Windows |
| Never chain shell commands with `&&` in npm script values | Fails on PowerShell 5.1 |
| Never pass a bare list of paths to `Remove-Item` without `Test-Path` | Causes partial failures and misleading errors |
| Never include Windows device names (`nul`, `con`, `prn`, …) in deletion lists | They are not files |

### Portable Command Patterns

**Instead of `cmd1 && cmd2` in a shell:**
```js
// Use a Node orchestration script (scripts/*.mjs) with sequential awaits
```

**Instead of `rg` for content search:**
```powershell
# PowerShell
Select-String -Path src\**\*.mjs -Pattern "pattern"
# or use git grep
git grep "pattern" -- "*.mjs"
```

**Instead of raw `Remove-Item` batches:**
```bash
npm run cleanup:safe    # uses scripts/repo-cleanup-safe.mjs
npm run cleanup:verify  # dry-run preview
```

### Safe Cleanup Runner

`scripts/repo-cleanup-safe.mjs` is the canonical way to remove repo artifacts:
- Shell-agnostic (pure Node FS APIs, no shell operators)
- Validates every path before deleting (existence, directory guard, Windows device name guard, repo-root escape guard)
- Idempotent — safe to run multiple times
- Supports `--dry-run` / `--verify` for CI preview mode

### Optional Environment Improvement

To support `&&` natively in your terminal, upgrade to **PowerShell 7**:

```powershell
winget install --id Microsoft.PowerShell --source winget
```

Then set VS Code default terminal profile to `pwsh` in settings:
```json
"terminal.integrated.defaultProfile.windows": "PowerShell"
```

This is optional; all repo automation is already designed to work without it.


---

## Shell-Compatibility Hardening

### Problem (incident 2026-02-17)

A cleanup step got stuck due to a **failure chain**:

1. Used `rg` (ripgrep) — not installed on the target machine.
2. Used `&&` Bash-style chaining — invalid on Windows PowerShell 5.1.
3. A `Remove-Item` batch included a garbled filename and the Windows `nul` device.
4. Provider output instability from noisy terminal content (control characters).

### Rules

**Do not use these in automation scripts or manual ops commands:**

| Forbidden pattern | Reason | Safe alternative |
|---|---|---|
| `rg`, `ripgrep` | Not universally installed | `Select-String` (PowerShell) or `git grep` |
| `cmd1 && cmd2` | Invalid in PowerShell 5.1 | Separate commands, or use Node runner |
| `Remove-Item` batches with raw paths | No path validation; fails silently on one error and aborts rest | `npm run cleanup:safe` |
| Windows reserved names (`nul`, `con`, `prn`, …) as file targets | Device names, not files | `scripts/repo-cleanup-safe.mjs` rejects them |

### Safe Cleanup Pattern

All file-removal automation must use:

```
npm run cleanup:safe     # live run (idempotent)
npm run cleanup:verify   # dry-run / CI verification
```

Script: `scripts/repo-cleanup-safe.mjs`

Features:
- Works on Windows PowerShell 5.1, PowerShell 7, Bash, Git Bash.
- No external tool dependencies (no `rg`, no Bash-only syntax).
- Validates path is inside repo root before acting.
- Rejects Windows reserved device names.
- Skips missing targets (idempotent).
- Reports `DELETED / SKIPPED / DRY_RUN / ERROR` per entry.
- Exits 0 (clean), 2 (hard error) — no silent failures.

### Optional Environment Improvement

If you want `&&` to work natively in the VS Code terminal, install PowerShell 7:

```
winget install --id Microsoft.PowerShell --source winget
```

Then in VS Code settings (`terminal.integrated.defaultProfile.windows`), set the profile to `PowerShell` (the pwsh 7 entry, not the legacy `Windows PowerShell`). This is optional — the repo automation does not require it.



