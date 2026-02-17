/**
 * communityRegistry.mjs — Community Sharing Platform (Tier 6 Package C)
 *
 * Provides a local content registry for publishing, discovering, and
 * downloading community-created content: scenarios, maps, rule modules,
 * and monster packs.
 *
 * Architecture:
 *   - ContentBundle = { meta, type, data, checksum }
 *   - Registry stores bundles in-memory (localStorage for persistence)
 *   - Publish/download/search/rate workflows
 *   - Trust & safety: schema validation before import
 */

// ── Content Types ──────────────────────────────────────────────────────

export const CONTENT_TYPES = ['scenario', 'map', 'ruleModule', 'monsterPack'];

// ── Registry State ─────────────────────────────────────────────────────

/** @type {Map<string, ContentBundle>} */
const registry = new Map();

// ── Checksum ───────────────────────────────────────────────────────────

/**
 * Simple deterministic hash for content integrity verification
 * @param {string} str
 * @returns {string}
 */
export function contentChecksum(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return 'chk-' + Math.abs(hash).toString(36);
}

// ── Content Bundle ─────────────────────────────────────────────────────

/**
 * @typedef {Object} ContentMeta
 * @property {string} id - Unique content ID
 * @property {string} name - Display name
 * @property {string} author - Author name
 * @property {string} version - Semantic version
 * @property {string} description - Brief description
 * @property {string[]} tags - Search tags
 * @property {string} createdAt - ISO date string
 * @property {number} rating - Average rating (0-5)
 * @property {number} downloads - Download count
 */

/**
 * @typedef {Object} ContentBundle
 * @property {ContentMeta} meta
 * @property {string} type - One of CONTENT_TYPES
 * @property {*} data - The actual content payload
 * @property {string} checksum - Integrity checksum
 */

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Validate a content bundle before publishing
 * @param {ContentBundle} bundle
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBundle(bundle) {
  const errors = [];

  if (!bundle) {
    return { valid: false, errors: ['Bundle is null or undefined'] };
  }
  if (!bundle.meta) {
    errors.push('Missing meta object');
  } else {
    if (!bundle.meta.id || typeof bundle.meta.id !== 'string') {
      errors.push('Missing or invalid meta.id');
    }
    if (!bundle.meta.name || typeof bundle.meta.name !== 'string') {
      errors.push('Missing or invalid meta.name');
    }
    if (!bundle.meta.author || typeof bundle.meta.author !== 'string') {
      errors.push('Missing or invalid meta.author');
    }
    if (!bundle.meta.version) {
      errors.push('Missing meta.version');
    }
  }
  if (!bundle.type || !CONTENT_TYPES.includes(bundle.type)) {
    errors.push(`Invalid content type: "${bundle.type}". Must be one of: ${CONTENT_TYPES.join(', ')}`);
  }
  if (bundle.data === undefined || bundle.data === null) {
    errors.push('Missing content data');
  }
  if (!bundle.checksum) {
    errors.push('Missing checksum');
  }

  // Verify checksum integrity
  if (bundle.data && bundle.checksum) {
    const expected = contentChecksum(JSON.stringify(bundle.data));
    if (bundle.checksum !== expected) {
      errors.push(`Checksum mismatch: expected ${expected}, got ${bundle.checksum}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Create Bundle ──────────────────────────────────────────────────────

/**
 * Create a content bundle ready for publishing
 * @param {Object} opts
 * @param {string} opts.id
 * @param {string} opts.name
 * @param {string} opts.author
 * @param {string} opts.version
 * @param {string} opts.description
 * @param {string[]} opts.tags
 * @param {string} opts.type
 * @param {*} opts.data
 * @returns {ContentBundle}
 */
export function createBundle({ id, name, author, version, description = '', tags = [], type, data }) {
  const checksum = contentChecksum(JSON.stringify(data));
  return {
    meta: {
      id,
      name,
      author,
      version,
      description,
      tags,
      createdAt: new Date().toISOString(),
      rating: 0,
      downloads: 0,
    },
    type,
    data,
    checksum,
  };
}

// ── Publish ────────────────────────────────────────────────────────────

/**
 * Publish a content bundle to the registry
 * @param {ContentBundle} bundle
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export function publishBundle(bundle) {
  const validation = validateBundle(bundle);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }
  if (registry.has(bundle.meta.id)) {
    return { ok: false, errors: [`Content "${bundle.meta.id}" already exists. Use updateBundle() instead.`] };
  }
  registry.set(bundle.meta.id, structuredClone(bundle));
  return { ok: true };
}

/**
 * Update an existing bundle (new version)
 * @param {ContentBundle} bundle
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export function updateBundle(bundle) {
  const validation = validateBundle(bundle);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }
  if (!registry.has(bundle.meta.id)) {
    return { ok: false, errors: [`Content "${bundle.meta.id}" not found. Use publishBundle() first.`] };
  }
  registry.set(bundle.meta.id, structuredClone(bundle));
  return { ok: true };
}

// ── Download ───────────────────────────────────────────────────────────

/**
 * Download a content bundle by ID
 * @param {string} id
 * @returns {{ ok: boolean, bundle?: ContentBundle, error?: string }}
 */
export function downloadBundle(id) {
  const bundle = registry.get(id);
  if (!bundle) {
    return { ok: false, error: `Content "${id}" not found` };
  }
  // Increment download count
  bundle.meta.downloads++;
  return { ok: true, bundle: structuredClone(bundle) };
}

// ── Remove ─────────────────────────────────────────────────────────────

/**
 * Remove a bundle from the registry
 * @param {string} id
 * @returns {boolean}
 */
export function removeBundle(id) {
  return registry.delete(id);
}

// ── Search ─────────────────────────────────────────────────────────────

/**
 * Search the registry for content
 * @param {Object} opts
 * @param {string} [opts.query] - Text search in name/description
 * @param {string} [opts.type] - Filter by content type
 * @param {string[]} [opts.tags] - Filter by tags (any match)
 * @param {string} [opts.author] - Filter by author
 * @param {string} [opts.sortBy] - Sort field: 'rating', 'downloads', 'newest'
 * @returns {ContentMeta[]}
 */
export function searchRegistry({ query, type, tags, author, sortBy = 'newest' } = {}) {
  let results = [...registry.values()];

  if (type) {
    results = results.filter(b => b.type === type);
  }
  if (author) {
    results = results.filter(b => b.meta.author.toLowerCase().includes(author.toLowerCase()));
  }
  if (tags && tags.length > 0) {
    results = results.filter(b =>
      tags.some(tag => b.meta.tags.includes(tag))
    );
  }
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(b =>
      b.meta.name.toLowerCase().includes(q) ||
      b.meta.description.toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortBy === 'rating') {
    results.sort((a, b) => b.meta.rating - a.meta.rating);
  } else if (sortBy === 'downloads') {
    results.sort((a, b) => b.meta.downloads - a.meta.downloads);
  } else {
    results.sort((a, b) => new Date(b.meta.createdAt) - new Date(a.meta.createdAt));
  }

  return results.map(b => ({ ...b.meta, type: b.type }));
}

// ── Rate ───────────────────────────────────────────────────────────────

/**
 * Rate a content bundle (simple averaging)
 * @param {string} id
 * @param {number} rating - 1-5
 * @returns {{ ok: boolean, newRating?: number, error?: string }}
 */
export function rateBundle(id, rating) {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { ok: false, error: 'Rating must be an integer 1-5' };
  }
  const bundle = registry.get(id);
  if (!bundle) {
    return { ok: false, error: `Content "${id}" not found` };
  }
  // Simple running average approximation
  const oldRating = bundle.meta.rating || 0;
  const count = bundle.meta.downloads || 1;
  bundle.meta.rating = Math.round(((oldRating * (count - 1) + rating) / count) * 10) / 10;
  return { ok: true, newRating: bundle.meta.rating };
}

// ── Export/Import (for file-based sharing) ──────────────────────────────

/**
 * Export a bundle as a JSON string for file sharing
 * @param {string} id
 * @returns {string|null}
 */
export function exportBundleToJson(id) {
  const bundle = registry.get(id);
  if (!bundle) return null;
  return JSON.stringify(bundle, null, 2);
}

/**
 * Import a bundle from a JSON string
 * @param {string} json
 * @returns {{ ok: boolean, bundle?: ContentBundle, errors?: string[] }}
 */
export function importBundleFromJson(json) {
  try {
    const bundle = JSON.parse(json);
    const validation = validateBundle(bundle);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }
    return { ok: true, bundle };
  } catch (err) {
    return { ok: false, errors: [`Parse error: ${err.message}`] };
  }
}

// ── Registry Stats ─────────────────────────────────────────────────────

/**
 * Get registry statistics
 * @returns {{ totalBundles: number, byType: Object, totalDownloads: number }}
 */
export function getRegistryStats() {
  const byType = {};
  let totalDownloads = 0;
  for (const bundle of registry.values()) {
    byType[bundle.type] = (byType[bundle.type] || 0) + 1;
    totalDownloads += bundle.meta.downloads;
  }
  return { totalBundles: registry.size, byType, totalDownloads };
}

/**
 * Clear the entire registry (for testing)
 */
export function clearRegistry() {
  registry.clear();
}

/**
 * Get count of items in registry
 * @returns {number}
 */
export function getRegistrySize() {
  return registry.size;
}