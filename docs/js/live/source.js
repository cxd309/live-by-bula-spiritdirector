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
 * @property {string} last_updated_utc
 * @property {{LIVE_SEASON_ID?: string, STATIC_CACHE_BASE_URL?: string, TOURNAMENT_LOCATION?: string}} [config]
 */

/** A non-2xx response, keeping the status so callers can tell a 404 apart */
class HTTPError extends Error {
  /**
   * @param {URL} url
   * @param {Response} res
   */
  constructor(url, res) {
    super(`${url}: ${res.status} ${res.statusText}`);
    this.status = res.status;
  }
}

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
  if (!res.ok) throw new HTTPError(url, res);
  return { body: await res.json(), url: new URL(res.url) };
}

/**
 * The dynamic route that builds a live static file, e.g. "_teams_110" ->
 * {root}index.php?view=live/api&entity=teams&id=110
 * index.php is UltiOrganizer's root, two levels above live/data/, so this
 * only works out for a base with that standard shape
 * @param {Source} source
 * @param {string} suffix
 * @returns {URL | null} null when the base or suffix doesn't fit the pattern
 */
function dynamicURL(source, suffix) {
  const match = /^_([a-z_]+?)(?:_(\d+))?$/.exec(suffix);
  if (!match || !source.base.pathname.endsWith("/live/data/")) return null;
  const url = new URL("../../index.php", source.base);
  url.searchParams.set("view", "live/api");
  url.searchParams.set("entity", match[1]);
  if (match[2]) url.searchParams.set("id", match[2]);
  return url;
}

/**
 * Finds a deployment's files through its heartbeat, which hands over the
 * season id and base path, see live-by-bula-openapi's "The API in one page"
 * a UTR archive serves its own heartbeat, so live and archive resolve the
 * same way
 * @param {Tournament} t
 * @param {"live" | "archive"} kind
 * @param {URL} heartbeatURL
 * @param {string} liveError
 * @returns {Promise<Source>}
 */
async function heartbeatSource(t, kind, heartbeatURL, liveError) {
  const { body, url } = await getJSON(heartbeatURL);
  /** @type {Heartbeat} */
  const hb = body;
  const seasonId = hb.config?.LIVE_SEASON_ID || t.slug;
  // hosts get reused for the next edition (eucf.ultimatefederation.eu moved
  // from e2cf25 to 26EUCFWRO), so a different season means a different event
  // casing varies between files, so compare without it
  if (seasonId.toLowerCase() !== t.slug.toLowerCase()) {
    throw new Error(`${url.host} is now serving season ${seasonId}, not ${t.slug}`);
  }
  // STATIC_CACHE_BASE_URL is root-relative, so join it to the origin of the
  // final (post-redirect) URL, not the requested one
  // empty means "next to the heartbeat"
  const staticBase = hb.config?.STATIC_CACHE_BASE_URL;
  const base = staticBase ? new URL(staticBase, url.origin) : new URL(".", url);
  /** @type {Source} */
  const source = {
    kind,
    base,
    seasonId,
    appVersion: hb.app_version,
    liveError,
    lastUpdated: hb.last_updated_utc,
    location: hb.config?.TOURNAMENT_LOCATION ?? "",
  };
  // the static files can be deleted after an event while the heartbeat
  // stays up, so check one exists before trusting the deployment
  await getSeasonJSON(source, "_reference");
  return source;
}

/**
 * Works out where a tournament's files live
 * live first, since this is primarily for running events, then the
 * ultimate-tournament-results archive once the live deployment is gone
 * an empty host means archive only, live is never tried
 * @param {Tournament} t
 * @returns {Promise<Source>}
 */
export async function resolveSource(t) {
  let liveError = "";
  if (t.host) {
    try {
      return await heartbeatSource(t, "live", new URL(`https://${t.host}/live/data/_heartbeat.json`), "");
    } catch (err) {
      if (!t.archive) throw err;
      // a browser reports a CORS failure as a bare "Failed to fetch", so this
      // is often all there is to say about why live didn't work
      liveError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!t.archive) throw new Error(`${t.slug} has neither a host nor an archive`);
  return heartbeatSource(t, "archive", new URL("_heartbeat.json", t.archive), liveError);
}

/**
 * Runs fn over items with at most limit in flight at once, results in
 * input order
 * for per-team and per-game files, so a live server isn't hit with a
 * hundred requests at the same moment
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimit(items, limit, fn) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Fetches {base}{seasonId}{suffix}.json
 * Live! only writes a static file the first time its dynamic route is asked
 * for it, so on a live source a missing file usually means nobody has looked
 * yet
 * the server only sends CORS headers on files that exist, so the browser
 * sees a missing one as a bare TypeError ("Failed to fetch"), not a 404
 * the dynamic route sends no CORS headers either, so it can't be read from
 * here, but a "no-cors" request still reaches PHP and writes the file: fire
 * one, ignore its (opaque) response, then fetch the static file again
 * @param {Source} source
 * @param {string} suffix e.g. "_reference" or "_games_123"
 * @returns {Promise<any>} the decoded body, for the calling adapter to type
 */
export async function getSeasonJSON(source, suffix) {
  const url = new URL(`${source.seasonId}${suffix}.json`, source.base);
  try {
    return (await getJSON(url)).body;
  } catch (err) {
    const dynamic = source.kind === "live" ? dynamicURL(source, suffix) : null;
    const missing = err instanceof TypeError || (err instanceof HTTPError && err.status === 404);
    if (!(missing && dynamic)) throw err;
    await fetch(dynamic, { mode: "no-cors", cache: "no-store" });
    return (await getJSON(url)).body;
  }
}
