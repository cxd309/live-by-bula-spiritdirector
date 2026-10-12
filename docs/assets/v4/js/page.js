// @ts-check

// Package page: helpers shared by every page, the tournament list and the
// small bits of HTML more than one page renders

// @ts-ignore -- no local types for a CDN module, see JsYaml below
import jsyaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs";

/**
 * @typedef {import("./live/model.js").Tournament} Tournament
 * @typedef {import("./live/model.js").Source} Source
 */

/**
 * The slice of js-yaml's API this file uses
 * typed by hand since there's no @types/js-yaml install here
 * @typedef {Object} JsYaml
 * @property {(text: string) => unknown} load
 */

/** @type {JsYaml} */
const yaml = jsyaml;

/**
 * Fetches and parses tournaments.yaml
 * @returns {Promise<Tournament[]>}
 */
export async function loadTournamentList() {
  const res = await fetch("tournaments.yaml", { cache: "no-cache" });
  if (!res.ok) throw new Error(`tournaments.yaml: ${res.status} ${res.statusText}`);
  return /** @type {Tournament[]} */ (yaml.load(await res.text()));
}

/**
 * Escapes text for interpolation into innerHTML
 * everything from a Live! deployment is third-party data
 * @param {string | number} value
 * @returns {string}
 */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @param {string} slug
 * @returns {string} relative link to that tournament's page
 */
export function tournamentHref(slug) {
  return `tournament.html?t=${encodeURIComponent(slug)}`;
}

/**
 * Green Live or grey Archive badge, linking to the _reference.json in use
 * @param {Tournament} t
 * @param {Source} source
 * @returns {string} an HTML snippet
 */
export function sourceBadge(t, source) {
  const href = esc(new URL(`${source.seasonId}_reference.json`, source.base).href);
  if (source.kind === "live") {
    return `<a class="badge text-bg-success text-decoration-none" href="${href}">Live</a>`;
  }
  // hovering the badge says why live wasn't used
  const title = esc(
    t.host ? `https://${t.host} unavailable, using archive: ${source.liveError}` : "archive only, no live host",
  );
  return `<a class="badge text-bg-secondary text-decoration-none" href="${href}" title="${title}">Archive</a>`;
}

/**
 * When the data was last written, relative as well for a live source
 * heartbeats send last_updated_utc as "2026-09-14 03:20:04" live and
 * "2026-09-03T15:43:13Z" from UTR, both UTC
 * @param {Source} source
 * @returns {string} plain text, "" when the heartbeat didn't say
 */
export function updatedText(source) {
  if (!source.lastUpdated) return "";
  const iso = source.lastUpdated.replace(" ", "T");
  const at = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (isNaN(at.getTime())) return "";
  const utc = `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  if (source.kind === "archive") return `archived ${utc}`;
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  const ago = minutes < 1
    ? "just now"
    : minutes < 60
    ? `${minutes} min ago`
    : minutes < 60 * 48
    ? `${Math.round(minutes / 60)} h ago`
    : `${Math.round(minutes / 1440)} days ago`;
  return `updated ${ago} (${utc})`;
}

/**
 * Division name shorthands, age group then gender, e.g. "Grand Master
 * Women's" -> "GMW", "Under-17 Open" -> "U17O", "Mixed" -> "X"
 * longest age prefix first, so "Great Grand Master" never reads as "Grand
 * Master" or "Master"
 * @type {{pattern: RegExp, short: (m: RegExpExecArray) => string}[]}
 */
const ageShorthands = [
  { pattern: /^great grand masters?\s*/i, short: () => "GGM" },
  { pattern: /^grand masters?\s*/i, short: () => "GM" },
  { pattern: /^masters?\s*/i, short: () => "M" },
  { pattern: /^(?:under[-\s]?|u)(\d+)\s*/i, short: (m) => `U${m[1]}` },
];

/**
 * keyed without apostrophes, EUCF 2025 names its division "Women"
 * @type {Record<string, string>}
 */
const genderShorthands = { open: "O", men: "O", mens: "O", women: "W", womens: "W", mixed: "X" };

/**
 * @param {string} name a division name as Live! sends it
 * @returns {string} the shorthand, or name unchanged when it doesn't fit the pattern
 */
export function shortDivision(name) {
  let rest = name.trim();
  let age = "";
  for (const { pattern, short } of ageShorthands) {
    const m = pattern.exec(rest);
    if (m) {
      age = short(m);
      rest = rest.slice(m[0].length);
      break;
    }
  }
  const gender = genderShorthands[rest.toLowerCase().replace(/['’]/g, "")];
  return gender ? age + gender : name;
}

/**
 * Spirit category shorthands, as Live!'s own spirit page shows them on small
 * screens, matched on how the label starts so 1.9's fixed labels and 3.0's
 * per-event ones both resolve
 */
const categoryShorthands = [
  { pattern: /^rules/i, short: "Rules" },
  { pattern: /^fouls/i, short: "Cont" },
  { pattern: /^fair/i, short: "Fair" },
  { pattern: /^(positive )?attitude/i, short: "Att" },
  { pattern: /^communication/i, short: "Comm" },
];

/**
 * @param {string} label a spirit category label
 * @returns {string} the shorthand, or label unchanged when it isn't a known category
 */
export function shortCategory(label) {
  return categoryShorthands.find(({ pattern }) => pattern.test(label))?.short ?? label;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A game time as "Sun 12 Jul - 10:20"
 * Live! sends "2026-07-12 10:20:00" already in the event's local time, so
 * the parts are read as they are and never shifted into the browser's zone
 * @param {string} time
 * @returns {string} "" for "", the input unchanged when it doesn't parse
 */
export function formatGameTime(time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(time);
  if (!m) return time;
  const [, y, mo, d, h, min] = m;
  // UTC here only as a calendar, for the weekday, the time is never converted
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return `${weekdays[day]} ${Number(d)} ${months[Number(mo) - 1]} - ${h}:${min}`;
}

/**
 * A game time as "Sun 10:20", for narrow screens, see formatGameTime
 * @param {string} time
 * @returns {string} "" for "", the input unchanged when it doesn't parse
 */
export function shortGameTime(time) {
  const long = formatGameTime(time);
  const m = /^(\w{3}) .* - (\d{2}:\d{2})$/.exec(long);
  return m ? `${m[1]} ${m[2]}` : long;
}

/**
 * A date range as short as it reads clearly: "15–22 Aug 2026",
 * "28 Jun – 4 Jul 2026", "29 Dec 2025 – 2 Jan 2026"
 * @param {string} start YYYY-MM-DD
 * @param {string} end   YYYY-MM-DD, "" for a single date
 * @returns {string} start unchanged when it doesn't parse
 */
export function formatDateRange(start, end) {
  /** @param {string} d */
  const parts = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? { y: m[1], mo: months[Number(m[2]) - 1], d: Number(m[3]) } : null;
  };
  const a = parts(start);
  const b = parts(end);
  if (!a) return start;
  if (!b || (a.y === b.y && a.mo === b.mo && a.d === b.d)) return `${a.d} ${a.mo} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${a.mo} ${a.y} – ${b.d} ${b.mo} ${b.y}`;
  if (a.mo !== b.mo) return `${a.d} ${a.mo} – ${b.d} ${b.mo} ${b.y}`;
  return `${a.d}–${b.d} ${b.mo} ${b.y}`;
}
