// @ts-check

// Package games: the parts of {seasonId}_games.json that every supported
// version shapes identically, like reference.js does for _reference.json

import { getSeasonJSON } from "./source.js";

/**
 * @typedef {import("./model.js").Game} Game
 * @typedef {import("./model.js").Source} Source
 * @typedef {import("./model.js").TournamentSummary} TournamentSummary
 */

/**
 * The slice of _games.json shared by 1.9.14 - 1.9.17 and 3.0.6
 * falsy fields are stripped from this list, so an unscheduled game can be
 * missing its teams entirely
 * pool is the owning pool on both, reservation the field it's played on
 * @typedef {Object} SharedGames
 * @property {{
 *   game_id: number, hometeam?: number, visitorteam?: number, time?: string,
 *   pool?: number, reservation?: number, status?: string
 * }[]} games
 */

/**
 * Every game on the schedule, played or not
 * @param {Source} source
 * @param {TournamentSummary} summary  for each pool's division and each field's name
 * @returns {Promise<Game[]>}
 */
export async function loadGames(source, summary) {
  /** @type {SharedGames} */
  const list = await getSeasonJSON(source, "_games");
  const divisionOf = new Map(summary.divisions.flatMap((d) => d.pools.map((p) => [p.id, d.id])));
  return list.games.map((g) => ({
    gameId: g.game_id,
    divisionId: divisionOf.get(g.pool ?? 0) ?? 0,
    homeTeamId: g.hometeam ?? 0,
    visitorTeamId: g.visitorteam ?? 0,
    time: g.time ?? "",
    pitch: summary.pitches[g.reservation ?? 0] ?? "",
    completed: g.status === "completed",
  }));
}

/**
 * @typedef {Object} GameTeams
 * @property {number} home     0 when not yet known
 * @property {number} visitor  0 when not yet known
 * @property {string} time     local time, "" when not yet scheduled
 */

/**
 * Who played in each game, and when
 * @param {Source} source
 * @returns {Promise<Map<number, GameTeams>>} keyed by game_id
 */
export async function loadGameTeams(source) {
  /** @type {SharedGames} */
  const list = await getSeasonJSON(source, "_games");
  return new Map(
    list.games.map((g) => [g.game_id, { home: g.hometeam ?? 0, visitor: g.visitorteam ?? 0, time: g.time ?? "" }]),
  );
}

/**
 * The other team in a game
 * @param {GameTeams | undefined} game
 * @param {number} teamId
 * @returns {number} 0 when the game or its teams aren't known
 */
export function opponent(game, teamId) {
  if (!game) return 0;
  return game.home === teamId ? game.visitor : game.home;
}
