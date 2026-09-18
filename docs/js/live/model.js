// @ts-check

// Package model: the version-independent shapes every live/vXX_YY_ZZ adapter
// translates its own Live! response into
// pages only ever import from here and versions.js, never from a vXX_YY_ZZ
// directly, so a new Live! version means a new adapter and nothing else

/**
 * One entry of tournaments.yaml
 * @typedef {Object} Tournament
 * @property {string} slug        season id, used verbatim in filenames (casing varies)
 * @property {string} event       display name
 * @property {string} start_date  YYYY-MM-DD
 * @property {string} host        live deployment, host plus any path prefix
 * @property {string} version     Live! version key, any form versions.js normalises
 * @property {string} archive     ultimate-tournament-results archive URL, "" while the event is live
 * @property {string} [location]  where it's played, falls back to the live heartbeat's when empty
 * @property {string} notes
 */

/**
 * Where one tournament's {seasonId}_*.json files are served from
 * @typedef {Object} Source
 * @property {"live" | "archive"} kind
 * @property {URL} base          directory the season files hang off, trailing slash
 * @property {string} seasonId
 * @property {string} appVersion  heartbeat app_version, the original deployment's for an archive
 * @property {string} liveError   why the live deployment wasn't used, "" for live sources
 * @property {string} lastUpdated heartbeat last_updated_utc, when the archive was taken for an archive
 * @property {string} location    heartbeat TOURNAMENT_LOCATION, "" when not sent (UTR archives don't)
 */

/**
 * @typedef {Object} SpiritCategory
 * @property {string} key    field name in spirit score objects, e.g. "cat1"
 * @property {string} label
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {Object} Team
 * @property {number} id
 * @property {string} name
 * @property {string} abbreviation
 * @property {string} country  country name, "" when unknown
 */

/**
 * Pool types as UltiOrganizer numbers them
 * @typedef {"round robin" | "playoff" | "swiss" | "crossover" | "unknown"} PoolType
 */

/**
 * @typedef {Object} Pool
 * @property {number} id    pool_id, the id _standings_ takes
 * @property {string} name
 * @property {PoolType} type
 */

/**
 * @typedef {Object} Division
 * @property {number} id     series_id, the id _spirit_ and _statistics_ take
 * @property {string} name
 * @property {Pool[]} pools  in the organiser's ordering
 * @property {Team[]} teams  by name
 */

/**
 * Headline facts about one tournament, enough for the homepage and the
 * tournament page overview
 * @typedef {Object} TournamentSummary
 * @property {string} name
 * @property {string} start       YYYY-MM-DD
 * @property {string} end         YYYY-MM-DD
 * @property {string} timezone
 * @property {string} status      Live!'s season status, e.g. "completed"
 * @property {Division[]} divisions
 * @property {number} teams
 * @property {number} players
 * @property {SpiritCategory[]} spiritCategories
 */

/**
 * One team's spirit score for one game, as awarded by its opponent
 * @typedef {Object} SpiritScore
 * @property {number} gameId
 * @property {number} teamId      the team the score was given to
 * @property {number} fromTeamId  the opponent who gave it, 0 when the games list doesn't say
 * @property {string} time        game start in the event's local time, "" when unknown
 * @property {number} divisionId
 * @property {Record<string, number>} categories  keyed by SpiritCategory.key
 * @property {number} total
 */

/**
 * What every live/vXX_YY_ZZ/index.js module exports
 * @typedef {Object} VersionAdapter
 * @property {string} key      canonical key, e.g. "v01_09_14"
 * @property {string} covers   Live! releases this adapter handles, e.g. "1.9.14 - 1.9.17"
 * @property {(source: Source) => Promise<TournamentSummary>} loadSummary
 * @property {(source: Source, summary: TournamentSummary) => Promise<SpiritScore[]>} loadSpiritScores
 *   every visible score, once each, read from each team's spiritreceived
 */

/**
 * UltiOrganizer's pool type numbers, identical on every version so far
 * @type {Record<number, PoolType>}
 */
export const poolTypes = { 1: "round robin", 2: "playoff", 3: "swiss", 4: "crossover" };
