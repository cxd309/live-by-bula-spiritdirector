// @ts-check

// Package spirit: sums and averages over SpiritScores, independent of which
// Live! version they came from

/**
 * @typedef {import("./live/model.js").SpiritCategory} SpiritCategory
 * @typedef {import("./live/model.js").SpiritScore} SpiritScore
 */

/**
 * Mean of every score in a group
 * @typedef {Object} SpiritAverage
 * @property {number} games                       distinct games with at least one score, the means are NaN when 0
 * @property {Record<string, number>} categories  keyed by SpiritCategory.key
 * @property {number} total
 */

/**
 * Totals outside [low, high] are flagged: below low is an issue, above
 * high a highlight
 * categories aren't here on purpose, a category is flagged at exactly its
 * own min (issue) or max (highlight), which is not a matter of taste
 * @typedef {Object} Thresholds
 * @property {number} teamLow   a team's average received total
 * @property {number} teamHigh
 * @property {number} gameLow   one score's total
 * @property {number} gameHigh
 */

/** @type {Thresholds} */
export const defaultThresholds = { teamLow: 9, teamHigh: 11, gameLow: 7, gameHigh: 13 };

/**
 * URL query parameter for each threshold, so a set of thresholds is a
 * shareable link
 * @type {Record<keyof Thresholds, string>}
 */
export const thresholdParams = {
  teamLow: "team_low",
  teamHigh: "team_high",
  gameLow: "game_low",
  gameHigh: "game_high",
};

/**
 * Defaults, overridden by any valid numbers in the query string
 * @param {URLSearchParams} params
 * @returns {Thresholds}
 */
export function readThresholds(params) {
  const t = { ...defaultThresholds };
  for (const key of /** @type {(keyof Thresholds)[]} */ (Object.keys(thresholdParams))) {
    const raw = params.get(thresholdParams[key]);
    const n = raw === null || raw === "" ? NaN : Number(raw);
    if (Number.isFinite(n)) t[key] = n;
  }
  return t;
}

/**
 * Writes thresholds into the query string, leaving defaults out so the
 * usual link stays short
 * @param {URL} url
 * @param {Thresholds} t
 */
export function writeThresholds(url, t) {
  for (const key of /** @type {(keyof Thresholds)[]} */ (Object.keys(thresholdParams))) {
    if (t[key] === defaultThresholds[key]) url.searchParams.delete(thresholdParams[key]);
    else url.searchParams.set(thresholdParams[key], String(t[key]));
  }
}

/**
 * One team's average received spirit
 * @typedef {Object} TeamSpirit
 * @property {number} teamId
 * @property {number} divisionId
 * @property {SpiritAverage} avg
 */

/**
 * @param {SpiritScore[]} scores
 * @param {SpiritCategory[]} categories
 * @returns {TeamSpirit[]} teams with at least one score
 */
export function teamAverages(scores, categories) {
  /** @type {Map<number, SpiritScore[]>} */
  const byTeam = new Map();
  for (const s of scores) byTeam.set(s.teamId, [...(byTeam.get(s.teamId) ?? []), s]);
  return [...byTeam].map(([teamId, own]) => ({
    teamId,
    divisionId: own[0].divisionId,
    avg: averageSpirit(own, categories),
  }));
}

/**
 * A running sum and count, so one score can be taken back out of a mean
 * @typedef {Object} Tally
 * @property {number} sum
 * @property {number} n
 */

/**
 * Every team's received and given totals, plus each score by game and team,
 * for averages that leave one game out
 * @typedef {Object} SpiritTallies
 * @property {Map<number, Tally>} received  by the team given the scores
 * @property {Map<number, Tally>} given     by the team that gave them
 * @property {(gameId: number, teamId: number) => SpiritScore | undefined} scoreFor
 *   what teamId was given in gameId
 */

/**
 * @param {SpiritScore[]} scores
 * @returns {SpiritTallies}
 */
export function spiritTallies(scores) {
  /** @type {Map<number, Tally>} */
  const received = new Map();
  /** @type {Map<number, Tally>} */
  const given = new Map();
  /** @type {Map<string, SpiritScore>} */
  const byGameTeam = new Map();
  /**
   * @param {Map<number, Tally>} map
   * @param {number} teamId
   * @param {number} total
   */
  const add = (map, teamId, total) => {
    const tally = map.get(teamId) ?? { sum: 0, n: 0 };
    map.set(teamId, { sum: tally.sum + total, n: tally.n + 1 });
  };
  for (const s of scores) {
    add(received, s.teamId, s.total);
    // scores whose giver isn't known (fromTeamId 0) count for nobody
    if (s.fromTeamId) add(given, s.fromTeamId, s.total);
    byGameTeam.set(`${s.gameId}:${s.teamId}`, s);
  }
  return { received, given, scoreFor: (gameId, teamId) => byGameTeam.get(`${gameId}:${teamId}`) };
}

/**
 * The mean of a tally with one value taken back out, e.g. a team's average
 * received in every game but this one
 * @param {Tally | undefined} tally
 * @param {number | undefined} without  undefined takes nothing out
 * @returns {number | undefined} undefined when nothing is left to average
 */
export function meanWithout(tally, without) {
  if (!tally) return undefined;
  const n = without === undefined ? tally.n : tally.n - 1;
  const sum = without === undefined ? tally.sum : tally.sum - without;
  return n > 0 ? sum / n : undefined;
}

/**
 * What makes a score an issue: any category at its minimum, or a total below
 * gameLow
 * @param {SpiritScore} s
 * @param {SpiritCategory[]} categories
 * @param {Thresholds} t
 * @returns {Set<string>} the category keys, and "total", that did it, empty when it isn't one
 */
export function scoreIssues(s, categories, t) {
  const keys = new Set(categories.filter((c) => s.categories[c.key] <= c.min).map((c) => c.key));
  if (s.total < t.gameLow) keys.add("total");
  return keys;
}

/**
 * What makes a score a highlight: any category at its maximum, or a total
 * above gameHigh
 * @param {SpiritScore} s
 * @param {SpiritCategory[]} categories
 * @param {Thresholds} t
 * @returns {Set<string>} the category keys, and "total", that did it, empty when it isn't one
 */
export function scoreHighlights(s, categories, t) {
  const keys = new Set(categories.filter((c) => s.categories[c.key] >= c.max).map((c) => c.key));
  if (s.total > t.gameHigh) keys.add("total");
  return keys;
}

/**
 * @param {SpiritScore[]} scores
 * @param {SpiritCategory[]} categories
 * @returns {SpiritAverage}
 */
export function averageSpirit(scores, categories) {
  /** @param {(s: SpiritScore) => number} pick */
  const mean = (pick) => scores.reduce((sum, s) => sum + pick(s), 0) / scores.length;
  return {
    games: new Set(scores.map((s) => s.gameId)).size,
    categories: Object.fromEntries(categories.map((c) => [c.key, mean((s) => s.categories[c.key])])),
    total: mean((s) => s.total),
  };
}
