/**
 * hash.mjs — MIR 3.4 Deterministic State Hashing.
 *
 * Produces a stable hash over canonical JSON.stringify output.
 * Uses a fast non-cryptographic hash (FNV-1a 64-bit as two 32-bit halves)
 * for portability (no Node crypto dependency needed in browser).
 *
 * The hash is deterministic: same state always produces the same hash string.
 * This is guaranteed by:
 *   1. JSON.stringify with sorted keys (canonical form)
 *   2. Deterministic FNV-1a hash over the resulting string
 */

/**
 * Canonical JSON stringify with sorted keys.
 * Ensures the same object always produces the same string regardless
 * of property insertion order.
 *
 * @param {*} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}

/**
 * FNV-1a hash (32-bit) over a string.
 * Returns a hex string.
 *
 * @param {string} str
 * @returns {string} — 8-char hex hash
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compute a deterministic hash of any JSON-serializable value.
 * Uses canonical stringify + FNV-1a (two passes with different seeds
 * combined for a 16-char hex hash to reduce collisions).
 *
 * @param {*} value — any JSON-serializable value
 * @returns {string} — 16-char hex hash
 */
export function stateHash(value) {
  const canonical = canonicalStringify(value);
  const h1 = fnv1a32(canonical);
  // Second pass with prefix for different seed effect
  const h2 = fnv1a32("mir:" + canonical);
  return h1 + h2;
}
