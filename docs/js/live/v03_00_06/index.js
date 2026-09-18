// @ts-check

// Adapter for Live! 3.0.6, see live-by-bula-openapi's openapi-3.0.6.yaml for
// the full response shapes
// only the fields used here are typed

import { getSeasonJSON } from "../source.js";

/**
 * @typedef {import("../model.js").Source} Source
 * @typedef {import("../model.js").TournamentSummary} TournamentSummary
 */

/**
 * @typedef {Object} Reference
 * @property {{
 *   name: string, starttime: string, endtime: string, timezone: string,
 *   status: string, player_count: number,
 *   spiritCategories: {key: string, index: number, label: string, min: number, max: number}[]
 * }} season
 * @property {{series_id: number, name: string, ordering: string}[]} series
 * @property {{team_id: number, series: number}[]} teams
 */

export const key = "v03_00_06";
export const covers = "3.0.6";

/**
 * @param {Source} source
 * @returns {Promise<TournamentSummary>}
 */
export async function loadSummary(source) {
  /** @type {Reference} */
  const ref = await getSeasonJSON(source, "_reference");
  const divisions = [...ref.series]
    .sort((a, b) => a.ordering.localeCompare(b.ordering))
    .map((s) => ({
      id: s.series_id,
      name: s.name,
      teams: ref.teams.filter((t) => t.series === s.series_id).length,
    }));
  // 3.0 spirit categories are per event, never assume five
  const spiritCategories = [...ref.season.spiritCategories]
    .sort((a, b) => a.index - b.index)
    .map(({ key, label, min, max }) => ({ key, label, min, max }));
  return {
    name: ref.season.name,
    start: ref.season.starttime.slice(0, 10),
    end: ref.season.endtime.slice(0, 10),
    timezone: ref.season.timezone,
    status: ref.season.status,
    divisions,
    teams: ref.teams.length,
    players: ref.season.player_count,
    spiritCategories,
  };
}
