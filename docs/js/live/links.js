// @ts-check

// Package links: URLs back into a Live! deployment's own pages
// the routes and the slug rule are Live!'s, read from its front end bundle:
//   /{prefix}teams/division/{division}
//   /{prefix}team/{division}/{team}-{teamId}/spirit
//   /{prefix}game/{division}/{home}-{visitor}-{gameId}
// a deployment with DEFAULT_TO_LIVE off serves those paths only under
// ?view=live/index, its clean paths redirect away

/**
 * @typedef {import("./model.js").Source} Source
 */

/**
 * Live!'s own slug rule, e.g. "BFD Redshot" -> "bfd-redshot",
 * "Women's" -> "womens"
 * @param {string | number} text
 * @returns {string}
 */
export function liveSlug(text) {
  return encodeURIComponent(
    String(text).replace(/(\s+|\/)/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase(),
  );
}

/**
 * @param {Source} source
 * @param {string} path  below the app root, "" for its homepage
 * @returns {string | null} null when there's no live deployment to link to
 */
function liveURL(source, path) {
  if (source.kind !== "live" || !source.appRoot) return null;
  const url = new URL(path, source.appRoot);
  // spelled out rather than via searchParams, which would escape the slash
  // into view=live%2Findex, and these paths never carry a query of their own
  return source.defaultToLive ? url.href : `${url.href}?view=live/index`;
}

/**
 * The tournament's own Live! homepage
 * @param {Source} source
 * @returns {string | null}
 */
export function liveTournamentURL(source) {
  return liveURL(source, "");
}

/**
 * One division's teams page
 * @param {Source} source
 * @param {string} division  the division's name, not its shorthand
 * @returns {string | null}
 */
export function liveDivisionURL(source, division) {
  return liveURL(source, `teams/division/${liveSlug(division)}`);
}

/**
 * One team's spirit tab
 * @param {Source} source
 * @param {string} division
 * @param {string} team
 * @param {number} teamId
 * @returns {string | null}
 */
export function liveTeamSpiritURL(source, division, team, teamId) {
  return liveURL(source, `team/${liveSlug(division)}/${liveSlug(team)}-${liveSlug(teamId)}/spirit`);
}

/**
 * One game's page, named for the home team then the visitors
 * @param {Source} source
 * @param {string} division
 * @param {string} home
 * @param {string} visitor
 * @param {number} gameId
 * @returns {string | null}
 */
export function liveGameURL(source, division, home, visitor, gameId) {
  return liveURL(source, `game/${liveSlug(division)}/${liveSlug(home)}-${liveSlug(visitor)}-${gameId}`);
}
