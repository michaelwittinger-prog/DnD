# MIR Positioning

> MIR 4.3 · Value Proposition & Market Position

---

## What Problem This Solves

Tabletop RPGs powered by AI face a fundamental trust problem: **if an AI can change the game state, how do players know the game is fair?**

Current virtual tabletop platforms (Roll20, Foundry VTT) treat the game engine as a black box. When AI enters the picture — proposing moves, resolving combat, running NPCs — there is no guarantee that:

- The AI followed the rules
- The dice were fair
- The state change was valid
- The game can be replayed exactly

MIR solves this by making **every state change deterministic, explicit, and verifiable**.

---

## Why Deterministic AI Matters

| Property | What It Means | Why It Matters |
|----------|--------------|----------------|
| **Determinism** | Same input + same seed = same output | Games can be replayed, audited, debugged |
| **Explicit Events** | Every change is a logged event | No "what just happened?" moments |
| **AI as Proposer** | AI suggests actions, engine validates | AI cannot cheat or bypass rules |
| **Immutable Log** | Events are append-only | History cannot be rewritten |
| **Single Source of Truth** | One GameState, fully serializable | No sync bugs, no hidden state |

This is not just good engineering — it's a **trust guarantee** for players.

---

## Comparison

| Feature | Roll20 | Foundry VTT | MIR |
|---------|--------|-------------|-----|
| Grid-based combat | ✓ | ✓ | ✓ |
| AI Game Master | ✗ | Partial (macros) | ✓ (first-class) |
| Deterministic engine | ✗ | ✗ | ✓ |
| Replay verification | ✗ | ✗ | ✓ (hash-verified) |
| Explicit event log | ✗ | Partial | ✓ (append-only) |
| Schema-validated state | ✗ | ✗ | ✓ (25 invariants) |
| AI rule enforcement | N/A | N/A | ✓ (engine validates all AI proposals) |
| Open state format | ✗ | Partial | ✓ (JSON, portable) |
| Offline-capable | ✗ | ✓ | ✓ |

---

## Who It Is For

- **Solo players** who want an AI-powered D&D experience with trustworthy rules
- **Game designers** who need a verifiable, auditable engine for playtesting
- **Developers** building AI-integrated tabletop tools who need a deterministic foundation
- **Educators** teaching game design or AI safety through a concrete, interactive example
- **Anyone** who wants to prove that a game session happened exactly as recorded

## Who It Is NOT For

- **Players looking for a polished VTT** — MIR is an engine, not a finished product with art, animations, and social features
- **Groups needing real-time multiplayer** — MIR is currently single-session, local-first
- **Non-technical users** — today's interface requires comfort with developer tools
- **People who want AI to "just wing it"** — MIR enforces rules; the AI cannot improvise state changes

---

## The Core Insight

> Most AI-powered game tools ask: "How do we make AI creative?"
>
> MIR asks: **"How do we make AI trustworthy?"**

The answer is architecture: separate proposal from execution, log everything, verify deterministically. Creativity is a layer on top of trust, not a replacement for it.
