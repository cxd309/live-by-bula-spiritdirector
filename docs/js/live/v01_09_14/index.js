// @ts-check

// Adapter for Live! 1.9.14 - 1.9.17, see live-by-bula-openapi's
// openapi-1.9.14.yaml for the full response shapes
// only the fields used here are typed

import { loadGameTeams, opponent } from "../games.js";
import { buildDivisions } from "../reference.js";
import { getSeasonJSON, mapLimit } from "../source.js";

/**
 * @typedef {import("../model.js").Source} Source
 * @typedef {import("../model.js").SpiritCategory} SpiritCategory
 * @typedef {import("../model.js").SpiritScore} SpiritScore
 * @typedef {import("../model.js").TournamentSummary} TournamentSummary
 */

/**
 * The slice of _teams_{teamId}.json this file uses
 * 1.9 enforces no visibility, a row exists once the opponent has submitted
 * @typedef {Object} TeamDetail
 * @property {({game_id: number, total: number} & Record<string, number>)[]} [spiritreceived]
 */

/**
 * @typedef {Object} Reference
 * @property {{name: string, starttime: string, endtime: string, timezone: string, status: string, player_count: number}} season
 */

/** @typedef {Reference & import("../reference.js").SharedReference} FullReference */

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
  /** @type {FullReference} */
  const ref = await getSeasonJSON(source, "_reference");
  return {
    name: ref.season.name,
    start: ref.season.starttime.slice(0, 10),
    end: ref.season.endtime.slice(0, 10),
    timezone: ref.season.timezone,
    status: ref.season.status,
    divisions: buildDivisions(ref),
    teams: ref.teams.length,
    players: ref.season.player_count,
    spiritCategories,
  };
}

/**
 * @param {Source} source
 * @param {TournamentSummary} summary
 * @returns {Promise<SpiritScore[]>}
 */
export async function loadSpiritScores(source, summary) {
  const teams = summary.divisions.flatMap((d) => d.teams.map((t) => ({ teamId: t.id, divisionId: d.id })));
  const games = await loadGameTeams(source);
  const perTeam = await mapLimit(teams, 8, async ({ teamId, divisionId }) => {
    /** @type {TeamDetail} */
    const detail = await getSeasonJSON(source, `_teams_${teamId}`);
    return (detail.spiritreceived ?? []).map((r) => ({
      gameId: r.game_id,
      teamId,
      fromTeamId: opponent(games.get(r.game_id), teamId),
      time: games.get(r.game_id)?.time ?? "",
      divisionId,
      categories: Object.fromEntries(spiritCategories.map((c) => [c.key, r[c.key]])),
      total: r.total,
    }));
  });
  return perTeam.flat();
}
