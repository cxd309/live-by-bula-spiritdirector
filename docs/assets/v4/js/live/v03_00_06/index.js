// @ts-check

// Adapter for Live! 3.0.6, see live-by-bula-openapi's openapi-3.0.6.yaml for
// the full response shapes
// only the fields used here are typed

import { awaitingScores, loadGameTeams, opponent } from "../games.js";
import { buildDivisions, buildPitches } from "../reference.js";
import { getSeasonJSON, mapLimit } from "../source.js";

/**
 * @typedef {import("../model.js").Source} Source
 * @typedef {import("../model.js").SpiritScore} SpiritScore
 * @typedef {import("../model.js").TournamentSummary} TournamentSummary
 */

/**
 * The slice of _teams_{teamId}.json this file uses
 * comments is null unless the event shows spirit comments
 * @typedef {Object} TeamDetail
 * @property {({
 *   game_id: number, total: number, is_complete: number, is_visible: number, comments?: string | null,
 *   [cat: string]: number | string | null | undefined
 * })[]} [spiritreceived]
 */

/**
 * @typedef {Object} Reference
 * @property {{
 *   name: string, starttime: string, endtime: string, timezone: string,
 *   status: string, player_count: number,
 *   spiritCategories: {key: string, index: number, label: string, min: number, max: number}[]
 * }} season
 */

/** @typedef {Reference & import("../reference.js").SharedReference} FullReference */

export const key = "v03_00_06";
export const covers = "3.0.6";

// the games list is shaped the same on every version so far
export { loadGames } from "../games.js";

/**
 * @param {Source} source
 * @returns {Promise<TournamentSummary>}
 */
export async function loadSummary(source) {
  /** @type {FullReference} */
  const ref = await getSeasonJSON(source, "_reference");
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
    divisions: buildDivisions(ref),
    teams: ref.teams.length,
    players: ref.season.player_count,
    spiritCategories,
    pitches: buildPitches(ref),
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
    // 3.0 flags rows rather than leaving them out, only count what Live!
    // itself would show
    /** @param {TeamDetail} d */
    const shown = (d) => (d.spiritreceived ?? []).filter((r) => r.is_complete && r.is_visible);
    /** @type {TeamDetail} */
    const detail = await getSeasonJSON(
      source,
      `_teams_${teamId}`,
      (/** @type {TeamDetail} */ d) => awaitingScores(games, teamId, new Set(shown(d).map((r) => r.game_id))),
    );
    return shown(detail)
      .map((r) => ({
        gameId: r.game_id,
        teamId,
        fromTeamId: opponent(games.get(r.game_id), teamId),
        homeTeamId: games.get(r.game_id)?.home ?? 0,
        visitorTeamId: games.get(r.game_id)?.visitor ?? 0,
        time: games.get(r.game_id)?.time ?? "",
        divisionId,
        categories: Object.fromEntries(summary.spiritCategories.map((c) => [c.key, Number(r[c.key])])),
        total: r.total,
        comment: (r.comments ?? "").trim(),
      }));
  });
  return perTeam.flat();
}
