// @ts-check

// Homepage: one card per tournament in tournaments.yaml, filled in from
// that tournament's own Live! data

// @ts-ignore -- no local types for a CDN module, see JsYaml below
import jsyaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs";
import { resolveSource } from "./live/source.js";
import { getVersion } from "./live/versions.js";

/**
 * @typedef {import("./live/model.js").Tournament} Tournament
 * @typedef {import("./live/model.js").Source} Source
 * @typedef {import("./live/model.js").TournamentSummary} TournamentSummary
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
 * Escapes text for interpolation into innerHTML
 * everything from a Live! deployment is third-party data
 * @param {string | number} value
 * @returns {string}
 */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * @param {Tournament} t
 * @param {Source} source
 * @returns {string} an HTML snippet
 */
function sourceBadge(t, source) {
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
 * @param {Tournament} t
 * @param {Source} source
 * @param {TournamentSummary} s
 * @returns {string} an HTML snippet, the card body
 */
function renderSummary(t, source, s) {
  const divisions = s.divisions
    .map((d) =>
      `<li class="list-group-item d-flex justify-content-between">${
        esc(d.name)
      }<span class="text-body-secondary">${d.teams} teams</span></li>`
    )
    .join("");
  const categories = s.spiritCategories
    .map((c) => `<li>${esc(c.label)} <span class="text-body-secondary">(${c.min}-${c.max})</span></li>`)
    .join("");
  return `
    <p class="text-body-secondary mb-2">
      ${esc(s.start)} to ${esc(s.end)} · ${esc(s.timezone)} · ${esc(s.status)}
    </p>
    <p class="mb-3">
      ${sourceBadge(t, source)}
      ${t.host ? `<code>${esc(t.host)}</code>` : ""}
      <code>${esc(t.version)}</code>
    </p>
    <p class="mb-2"><strong>${s.teams}</strong> teams · <strong>${s.players}</strong> players</p>
    <ul class="list-group list-group-flush mb-3">${divisions}</ul>
    <h3 class="h6">Spirit categories</h3>
    <ol class="small mb-0">${categories}</ol>
  `;
}

/**
 * Adds one card to the grid, then fills it in once its data arrives
 * tournaments load in parallel and fail independently
 * @param {HTMLElement} grid
 * @param {Tournament} t
 */
async function loadTournament(grid, t) {
  const col = document.createElement("div");
  col.className = "col";
  col.innerHTML = `
    <div class="card h-100">
      <div class="card-header"><h2 class="h5 mb-0">${esc(t.event)}</h2></div>
      <div class="card-body"><p class="text-body-secondary mb-0">Loading&hellip;</p></div>
    </div>
  `;
  grid.append(col);
  const body = /** @type {HTMLElement} */ (col.querySelector(".card-body"));

  try {
    const adapter = getVersion(t.version);
    const source = await resolveSource(t);
    const summary = await adapter.loadSummary(source);
    body.innerHTML = renderSummary(t, source, summary);
  } catch (err) {
    body.innerHTML = `<p class="text-danger mb-0">Couldn't load ${esc(t.event)}: ${
      esc(err instanceof Error ? err.message : String(err))
    }</p>`;
  }
}

/**
 * @param {HTMLElement} grid
 * @param {HTMLElement} status
 */
async function loadTournaments(grid, status) {
  try {
    const res = await fetch("tournaments.yaml", { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const tournaments = /** @type {Tournament[]} */ (yaml.load(await res.text()));
    grid.innerHTML = "";
    await Promise.all(tournaments.map((t) => loadTournament(grid, t)));
  } catch (err) {
    grid.innerHTML = "";
    status.hidden = false;
    status.textContent = `Couldn't load tournaments.yaml: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// modules are deferred, so the DOM is already parsed here
const grid = document.getElementById("tournaments");
const status = document.getElementById("tournaments-status");
if (grid && status) {
  loadTournaments(grid, status);
}
