# Recovery + Continuation Prompt for Stuck Commit Step

**Use this prompt when Cline gets stuck during a commit/push step mid-package.**

---

## Context
You are in a git repo (`c:/Users/micha/DnD`) where the workflow got stuck during a commit or push step while executing **Package 5 — Canonicalization Mega-Package** of the repo-cleanup subproject.

Read `subprojects/repo-cleanup/package5_workplan.md` for the full scope.

## Constraints
- Do not lose work.
- Do not reset or discard changes unless explicitly approved.
- Prefer reversible, low-risk steps.
- Keep a clear audit trail of what was found and what was changed.
- **After fixing the stuck state, continue with the original work package until completion.**

## Phase 1: Diagnose stuck state
Run and report:
```
git status --short --branch
git diff --name-status
git diff --cached --name-status
git log --oneline -n 8
```
Check for lock/hook/process blockers:
- existence of `.git/index.lock`
- whether pre-commit hook is long-running/failing
- whether a prior git process is still active

## Phase 2: Root cause analysis (RCA)
Determine which category applies:
- A) Context window exhaustion (agent ran out of token budget)
- B) Command never executed (UI approval/pending state)
- C) Pre-commit hook running or hanging
- D) Git lock/index conflict
- E) Massive staging caused slow commit / timeout
- F) Quoting/shell issue in combined command

Provide evidence for selected cause.

## Phase 3: Recovery strategy (safe + deterministic)
- If needed, split monolithic command into atomic steps:
  1. `git add -A`
  2. `git status --short`
  3. `git commit -m "..."`
- If pre-commit is heavy, run validation scripts manually first, then commit.
- If lock file is stale, verify no active git process, then remove lock safely.

## Phase 4: Execute fix
- Complete commit with a clear message.
- Run post-commit verification:
  - `git status --short --branch`
  - `git log --oneline -n 5`

## Phase 5: Sync verification
- Push branch and confirm:
  - local clean
  - no ahead/behind mismatch

## Phase 6: Resume original work package
**CRITICAL: After the git state is fixed and synced, immediately resume the original Package 5 work.**

Read `subprojects/repo-cleanup/package5_workplan.md` to determine remaining workstreams:
- Check which workstreams are marked `[x]` (done) vs `[ ]` (pending)
- Continue executing the next uncompleted workstream
- Follow the same commit/push pattern for each workstream
- Do NOT stop after fixing the git issue — the fix is just the prerequisite

Remaining Package 5 workstreams (as of last known state):
- [x] Workstream A: Seam burn-down (50 identical .mts deleted, 2 diverged kept)
- [ ] Workstream B: Root legacy entrypoint retirement
- [ ] Workstream C: CI hardening (strict temp check, seam gate, subproject enforcement)
- [ ] Workstream D: Architecture documentation + migration matrix
- [ ] Workstream E: Validation, regression tests, final commit/push

## Phase 7: Final report format
- Root cause (1 sentence)
- Evidence (3-5 bullets)
- Fix applied (ordered list)
- Final git state (exact status line)
- Risks remaining (if any)
- Package 5 completion status (which workstreams done)