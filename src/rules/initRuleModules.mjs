/**
 * initRuleModules.mjs — Rule Module Bootstrap (Tier 6.5)
 *
 * Registers built-in rule modules and sets the default active module.
 * Import this module at application startup to initialize the rule system.
 *
 * Usage:
 *   import { initRuleModules } from './rules/initRuleModules.mjs';
 *   initRuleModules(); // registers core-5e-lite + homebrew-sample, activates core-5e-lite
 */

import { registerModule, setActiveModule, isModuleRegistered } from './ruleModuleRegistry.mjs';
import { core5eLiteModule } from './modules/core5eLite.mjs';
import { homebrewSampleModule } from './modules/homebrewSample.mjs';

/** Default module ID */
export const DEFAULT_MODULE_ID = 'core-5e-lite';

/** All built-in modules */
export const BUILT_IN_MODULES = [core5eLiteModule, homebrewSampleModule];

/**
 * Initialize the rule module system with built-in modules.
 * Safe to call multiple times (skips already-registered modules).
 * @param {string} [activeModuleId] - Module to activate (defaults to core-5e-lite)
 */
export function initRuleModules(activeModuleId = DEFAULT_MODULE_ID) {
  for (const mod of BUILT_IN_MODULES) {
    if (!isModuleRegistered(mod.id)) {
      registerModule(mod);
    }
  }
  setActiveModule(activeModuleId);
}