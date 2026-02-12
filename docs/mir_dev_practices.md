# MIR Development Practices

> Lessons learned from AI-assisted development sessions.
> Last updated: 2026-02-12

---

## Session Timeout Prevention

### Problem
AI assistant sessions can time out when:
1. **Pre-commit hooks run long** — `npm test` runs validate + smoke + invariants + fixtures before every commit
2. **Large commit messages** — Multi-line messages with detailed changelogs increase command length
3. **Chained commands** — `git add -A && git commit -m "..."` waits for the entire pipeline

### Mitigations

1. **Keep commit messages concise** — Put detail in the commit body via a file, not inline
2. **Split verification from commit** — Run `npm run test:all` first, then commit separately
3. **Use `--no-verify` for pre-validated commits** — If tests just passed, skip the hook:
   ```bash
   npm run test:all           # verify first
   git add -A
   git commit --no-verify -m "feat: short message"  # skip redundant pre-commit
   ```
4. **Checkpoint frequently** — Commit after each module, not after a batch of 5

### Recommended Workflow

```
1. Write code
2. Run: npm run test:all          (full regression)
3. If pass: git add -A && git commit --no-verify -m "feat: X"
4. Repeat
```

This separates "verify" from "commit" so neither blocks on the other.

---

## Module Development Checklist

For each new engine module:

- [ ] Create `src/engine/<module>.mjs` with pure functions
- [ ] Create `tests/<module>_test.mjs` with comprehensive tests
- [ ] Run `node tests/<module>_test.mjs` to verify
- [ ] Add export to `src/engine/index.mjs` barrel
- [ ] Add `test:<name>` script to `package.json`
- [ ] Add to `test:all` chain in `package.json`
- [ ] Run `npm run test:all` for regression
- [ ] Commit with short message

---

## Current Test Suite (932 tests)

| Suite | Tests | Module |
|-------|-------|--------|
| engine | 95 | Core engine (move, attack, initiative, end turn) |
| ai (parser) | 82 | AI action parser |
| ai (prompt) | 50 | AI prompt templates |
| bridge | 78 | AI bridge server |
| replay | 40 | Deterministic replay |
| mvp | 43 | MVP integration |
| scenario | 53 | Scenario loading |
| foundation | 154 | Logger, assert, barrel exports |
| pathfinding | 95 | A* pathfinding |
| death | 48 | Death/combat end |
| npc | 54 | NPC auto-turn strategy |
| narration | 44 | Event narration + combat controller |
| sprint1 | 96 | Abilities, conditions, range |
| **Total** | **932** | |
