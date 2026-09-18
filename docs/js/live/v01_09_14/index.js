// @ts-check

// Adapter for Live! 1.9.14 - 1.9.17, see live-by-bula-openapi's
// openapi-1.9.14.yaml for the full response shapes
// only the fields used here are typed

import { getSeasonJSON } from "../source.js";

/**
 * @typedef {import("../model.js").Source} Source
 * @typedef {import("../model.js").SpiritCategory} SpiritCategory
 * @typedef {import("../model.js").TournamentSummary} TournamentSummary
 */

/**
 * @typedef {Object} Reference
 * @property {{name: string, starttime: string, endtime: string, timezone: string, status: string, player_count: number}} season
 * @property {{series_id: number, name: string, ordering: string}[]} series
 * @property {{team_id: number, series: number}[]} teams
 */

export const key = "v01_09_14";
export const covers = "1.9.14 - 1.9.17";

/**
 * 1.9 has no category list in the API, it is always the five WFDF
 * categories cat1-cat5, each scored 0-4
 * @type {SpiritCategory[]}
 */
const spiritCategories = [
  { key: "cat1", label: "Rules Knowledge and Use", min: 0, max: 4 },
  { key: "cat2", label: "Fouls and Body Contact", min: 0, max: 4 },
  { key: "cat3", label: "Fair-Mindedness", min: 0, max: 4 },
  { key: "cat4", label: "Positive Attitude and Self-Control", min: 0, max: 4 },
  { key: "cat5", label: "Communication", min: 0, max: 4 },
];

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
