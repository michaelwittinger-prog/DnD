# Prompt Builder Specification

## Overview

The prompt builder assembles a single, unambiguous prompt for the AI GM from four canonical layers. Each layer is serialized in a fixed order with clear delimiters. The AI GM receives nothing outside these layers.

## Layer Stack

The prompt is composed of four layers in the following order.

### Layer A: System Layer

Source: ai_gm/system_prompt.md

This layer defines the AI GM role, authority, restrictions, output contract, and input contract. It is included verbatim at the top of every prompt. It never changes between turns.

Serialization: Wrap the full contents of system_prompt.md in a fenced block.

```
=== SYSTEM ===
<contents of system_prompt.md>
=== END SYSTEM ===
```

### Layer B: Rules Layer

Source: ai_gm/rules_index.json

This layer provides the complete rules index as a JSON array. The AI GM must only reference rules present in this array. Rules are identified by their "id" field.

Serialization: Wrap the JSON array in a fenced block.

```
=== RULES ===
<contents of rules_index.json, pretty printed>
=== END RULES ===
```

### Layer C: State Layer

Source: The current game state JSON object, conforming to game_state.schema.json.

This layer represents the entire world state at the moment of the player action. The AI GM must treat this as the single source of truth.

Serialization: Wrap the JSON object in a fenced block.

```
=== STATE ===
<current game state JSON, pretty printed>
=== END STATE ===
```

### Layer D: Player Input Layer

Source: A single natural language string from the active player.

This layer contains exactly one action. If the player sends multiple actions, the caller must split them before invoking the prompt builder.

Serialization: Wrap the string in a fenced block.

```
=== PLAYER_INPUT ===
<player input string>
=== END PLAYER_INPUT ===
```

## Assembly Order

The final prompt is the concatenation of layers A, B, C, D in that exact order, separated by a single blank line between each layer block. No other content may be added before, between, or after the layers.

## Output Expectation

After the assembled prompt, the AI GM must respond with a single JSON object conforming to shared/schemas/aiResponse.schema.json. No preamble, no postscript, no markdown fences around the response.

## Do Not

Do not invent state. The AI GM must only reference entities, items, positions, and values that exist in the state layer.

Do not change rules. The AI GM must not override, extend, or ignore any rule in the rules layer.

Do not roll dice unless the rng.mode field in the game state explicitly permits random generation. When rng.mode is absent or restrictive, the AI GM must use deterministic resolution.

Do not output anything outside JSON. The AI GM response must be a single JSON object. No markdown, no commentary, no explanatory text outside the JSON structure.

Do not combine multiple player actions. Each prompt must contain exactly one player action. The caller is responsible for splitting compound inputs.

Do not reorder layers. The four layer order (system, rules, state, player input) is fixed and must not be changed.
