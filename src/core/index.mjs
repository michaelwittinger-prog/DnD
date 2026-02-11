/**
 * core/index.mjs — MIR Core Module Barrel Export.
 *
 * Single entry point for all core utilities.
 * External modules should import from here, not from internal files.
 *
 * Usage:
 *   import { createLogger, mirAssert, V, ErrorCode } from "../core/index.mjs";
 */

export {
  createLogger,
  setLogLevel,
  getLogLevel,
  setLogSink,
  resetLogSink,
  muteAll,
  unmuteAll,
  correlationId,
} from "./logger.mjs";

export {
  MirAssertionError,
  mirAssert,
  mirAssertDefined,
  mirAssertType,
  mirAssertNonEmptyString,
  mirAssertNonNegativeInt,
  mirAssertArray,
  mirAssertOneOf,
  mirAssertNonEmpty,
  mirUnreachable,
} from "./assert.mjs";

export { V, ALL_CODES } from "./violationCodes.mjs";
