// @ts-check

// Package versions: maps a Live! version key to that version's adapter,
// the JS equivalent of UTR's internal/liveversion registry
// adapter directories use the same zero-padded naming (1.9.14 -> v01_09_14)
// so the two repos line up file for file

import * as v01_09_14 from "./v01_09_14/index.js";
import * as v03_00_06 from "./v03_00_06/index.js";

/** @typedef {import("./model.js").VersionAdapter} VersionAdapter */

/** @type {Record<string, VersionAdapter>} */
const registry = {
  [v01_09_14.key]: v01_09_14,
  [v03_00_06.key]: v03_00_06,
};

/**
 * Converts a dotted app version like "3.0.6" or "v3.0.6" into the canonical
 * key "v03_00_06"
 * anything that isn't three numeric segments comes back unchanged, so it
 * simply won't match the registry
 * @param {string} version
 * @returns {string}
 */
export function normalizeVersion(version) {
  const parts = version.replace(/^[vV]/, "").split(/[._]/);
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return version;
  return "v" + parts.map((p) => p.padStart(2, "0")).join("_");
}

/**
 * @param {string} version any form normalizeVersion accepts
 * @returns {VersionAdapter}
 */
export function getVersion(version) {
  const adapter = registry[normalizeVersion(version)];
  if (!adapter) {
    throw new Error(`unsupported Live! version ${version}, known: ${Object.keys(registry).sort().join(", ")}`);
  }
  return adapter;
}
