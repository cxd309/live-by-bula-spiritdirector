// @ts-check

// Package reference: the parts of {seasonId}_reference.json that every
// supported version shapes identically
// adapters call these rather than each carrying a copy, and stop calling
// them for any version that diverges

import { poolTypes } from "./model.js";

/**
 * @typedef {import("./model.js").Division} Division
 * @typedef {import("./model.js").Pool} Pool
 * @typedef {import("./model.js").Team} Team
 */

/**
 * The slice of _reference.json shared by 1.9.14 - 1.9.17 and 3.0.6
 * @typedef {Object} SharedReference
 * @property {{series_id: number, name: string, ordering: string}[]} series
 * @property {{pool_id: number, poolname: string, series_id: number, ordering: string, type: number}[]} pools
 * @property {{team_id: number, name: string, abbreviation: string, series: number, country: number | null}[]} teams
 * @property {{country_id: number, name: string}[]} countries
 */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function byOrdering(a, b) {
  return a.localeCompare(b);
}

/**
 * Groups pools and teams under their division, each in display order
 * @param {SharedReference} ref
 * @returns {Division[]}
 */
export function buildDivisions(ref) {
  const countries = new Map(ref.countries.map((c) => [c.country_id, c.name]));
  return [...ref.series]
    .sort((a, b) => byOrdering(a.ordering, b.ordering))
    .map((s) => ({
      id: s.series_id,
      name: s.name,
      pools: ref.pools
        .filter((p) => p.series_id === s.series_id)
        .sort((a, b) => byOrdering(a.ordering, b.ordering) || a.pool_id - b.pool_id)
        .map((p) => /** @type {Pool} */ ({ id: p.pool_id, name: p.poolname, type: poolTypes[p.type] ?? "unknown" })),
      teams: ref.teams
        .filter((t) => t.series === s.series_id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => /** @type {Team} */ ({
          id: t.team_id,
          name: t.name,
          abbreviation: t.abbreviation,
          country: (t.country !== null && countries.get(t.country)) || "",
        })),
    }));
}
