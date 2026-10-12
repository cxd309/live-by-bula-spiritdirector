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
 * homescore and visitorscore are the exception, put back as 0 for any game
 * that isn't scheduled, so absent means not started
 * @typedef {Object} SharedGames
 * @property {{
 *   game_id: number, hometeam?: number, visitorteam?: number, time?: string,
 *   pool?: number, reservation?: number, status?: string,
 *   homescore?: number, visitorscore?: number
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
    homeScore: g.homescore ?? null,
    visitorScore: g.visitorscore ?? null,
  }));
}

/**
 * @typedef {Object} GameTeams
 * @property {number} home     0 when not yet known
 * @property {number} visitor  0 when not yet known
 * @property {string} time     local time, "" when not yet scheduled
 * @property {boolean} completed  see Game.completed
 */

/**
 * Who played in each game, and when
 * @param {Source} source
 * @returns {Promise<Map<number, GameTeams>>} keyed by game_id
 */
export async function loadGameTeams(source) {
  /** @type {SharedGames} */
  const list = await getSeasonJSON(source, "_games");
  /** @type {(g: SharedGames["games"][number]) => GameTeams} */
  const teams = (g) => ({
    home: g.hometeam ?? 0,
    visitor: g.visitorteam ?? 0,
    time: g.time ?? "",
    completed: g.status === "completed",
  });
  return new Map(list.games.map((g) => [g.game_id, teams(g)]));
}

/**
 * Whether a team's file could still change: it played a completed game whose
 * score for it isn't in yet
 * a team with every score in is left as it is, see getSeasonJSON's stale,
 * so an edit to a score already in only shows once the file is rewritten
 * for some other reason
 * @param {Map<number, GameTeams>} games
 * @param {number} teamId
 * @param {Set<number>} scored  the games the team's file already has its score for
 * @returns {boolean}
 */
export function awaitingScores(games, teamId, scored) {
  for (const [gameId, g] of games) {
    if (g.completed && (g.home === teamId || g.visitor === teamId) && !scored.has(gameId)) return true;
  }
  return false;
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
