// @ts-check

// Package source: finding and fetching a tournament's static JSON files
// this is the version-independent transport, the equivalent of UTR's
// internal/liveclient, every adapter fetches through getSeasonJSON

/**
 * @typedef {import("./model.js").Tournament} Tournament
 * @typedef {import("./model.js").Source} Source
 */

/**
 * The slice of _heartbeat.json this file uses
 * @typedef {Object} Heartbeat
 * @property {string} app_version
 * @property {{LIVE_SEASON_ID?: string, STATIC_CACHE_BASE_URL?: string}} [config]
 */

/**
 * Fetches and decodes one JSON file
 * "no-cache" revalidates every time rather than skipping the cache entirely:
 * a live event's files change between rounds, an archive's never do and
 * GitHub Pages answers the revalidation with a cheap 304
 * @param {URL} url
 * @returns {Promise<{body: any, url: URL}>} url is the final one, after any redirects
 */
async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return { body: await res.json(), url: new URL(res.url) };
}

/**
 * Finds a live deployment's files through its heartbeat, which hands over
 * the season id and base path, see live-by-bula-openapi's
 * "The API in one page"
 * @param {Tournament} t
 * @returns {Promise<Source>}
 */
async function liveSource(t) {
  const { body, url } = await getJSON(new URL(`https://${t.host}/live/data/_heartbeat.json`));
  /** @type {Heartbeat} */
  const hb = body;
  const seasonId = hb.config?.LIVE_SEASON_ID || t.slug;
  // hosts get reused for the next edition (eucf.ultimatefederation.eu moved
  // from e2cf25 to 26EUCFWRO), so a different season means a different event
  // casing varies between files, so compare without it
  if (seasonId.toLowerCase() !== t.slug.toLowerCase()) {
    throw new Error(`${t.host} is now serving season ${seasonId}, not ${t.slug}`);
  }
  // STATIC_CACHE_BASE_URL is root-relative, so join it to the origin of the
  // final (post-redirect) URL, not the requested one
  // empty means "next to the heartbeat"
  const staticBase = hb.config?.STATIC_CACHE_BASE_URL;
  const base = staticBase ? new URL(staticBase, url.origin) : new URL(".", url);
  // the static files can be deleted after an event while the heartbeat
  // stays up, so check one exists before trusting the deployment
  const source = /** @type {Source} */ ({ kind: "live", base, seasonId, appVersion: hb.app_version, liveError: "" });
  await getSeasonJSON(source, "_reference");
  return source;
}

/**
 * Works out where a tournament's files live
 * live first, since this is primarily for running events, then the
 * ultimate-tournament-results archive once the live deployment is gone
 * an empty host means archive only, live is never tried
 * archive: season id is already known from tournaments.yaml, so no heartbeat
 * is needed (GitHub Pages won't serve UTR's _heartbeat.json anyway, Jekyll
 * drops files starting with "_")
 * @param {Tournament} t
 * @returns {Promise<Source>}
 */
export async function resolveSource(t) {
  if (!t.host) return archiveSource(t, "");
  try {
    return await liveSource(t);
  } catch (err) {
    if (!t.archive) throw err;
    // a browser reports a CORS failure as a bare "Failed to fetch", so this
    // is often all there is to say about why live didn't work
    return archiveSource(t, err instanceof Error ? err.message : String(err));
  }
}

/**
 * @param {Tournament} t
 * @param {string} liveError
 * @returns {Source}
 */
function archiveSource(t, liveError) {
  if (!t.archive) throw new Error(`${t.slug} has neither a host nor an archive`);
  return { kind: "archive", base: new URL(t.archive), seasonId: t.slug, appVersion: "", liveError };
}

/**
 * Fetches {base}{seasonId}{suffix}.json
 * @param {Source} source
 * @param {string} suffix e.g. "_reference" or "_games_123"
 * @returns {Promise<any>} the decoded body, for the calling adapter to type
 */
export async function getSeasonJSON(source, suffix) {
  const { body } = await getJSON(new URL(`${source.seasonId}${suffix}.json`, source.base));
  return body;
}
