// @ts-check

// Homepage: one table row per tournament in tournaments.yaml, shown straight
// away from the yaml then filled in from that tournament's own Live! data

import { resolveSource } from "./live/source.js";
import { getVersion } from "./live/versions.js";
import { errorMessage, esc, formatDateRange, loadTournamentList, sourceBadge, tournamentHref } from "./page.js";

/**
 * @typedef {import("./live/model.js").Tournament} Tournament
 * @typedef {import("./live/model.js").Source} Source
 * @typedef {import("./live/model.js").TournamentSummary} TournamentSummary
 */

/**
 * A row's cells, loading or loaded
 * @typedef {Object} RowCells
 * @property {string} date
 * @property {string} location
 * @property {string} status
 * @property {string} divisions
 * @property {string} teams
 */

/**
 * @param {Tournament} t
 * @param {RowCells} cells
 * @returns {string} an HTML snippet
 */
function row(t, cells) {
  const href = esc(tournamentHref(t.slug));
  return `
    <tr data-slug="${esc(t.slug)}">
      <td class="text-nowrap">${cells.date}</td>
      <td><a href="${href}">${esc(t.event)}</a></td>
      <td>${cells.location}</td>
      <td>${cells.status}</td>
      <td class="text-center">${cells.divisions}</td>
      <td class="text-center">${cells.teams}</td>
      <td class="text-end"><a class="btn btn-sm btn-primary" href="${href}">Open</a></td>
    </tr>
  `;
}

/**
 * The row before its Live! data arrives, from the yaml alone
 * @param {Tournament} t
 * @returns {RowCells}
 */
function loadingCells(t) {
  const loading = `<span class="text-body-secondary">&hellip;</span>`;
  return {
    date: esc(formatDateRange(t.start_date, "")),
    location: t.location ? esc(t.location) : loading,
    status: loading,
    divisions: loading,
    teams: loading,
  };
}

/**
 * @param {Tournament} t
 * @param {Source} source
 * @param {TournamentSummary} s
 * @returns {RowCells}
 */
function loadedCells(t, source, s) {
  return {
    date: esc(formatDateRange(s.start, s.end)),
    location: esc(t.location || source.location),
    status: `${esc(s.status)} ${sourceBadge(t, source)}`,
    divisions: String(s.divisions.length),
    teams: String(s.teams),
  };
}

/**
 * Fills one tournament's row in once its data arrives
 * tournaments load in parallel and fail independently
 * @param {HTMLTableRowElement} tr
 * @param {Tournament} t
 */
async function loadTournament(tr, t) {
  try {
    const adapter = getVersion(t.version);
    const source = await resolveSource(t);
    const summary = await adapter.loadSummary(source);
    tr.outerHTML = row(t, loadedCells(t, source, summary));
  } catch (err) {
    const cells = loadingCells(t);
    tr.outerHTML = row(t, {
      ...cells,
      location: t.location ? esc(t.location) : "",
      status: `<span class="text-danger">Couldn't load: ${esc(errorMessage(err))}</span>`,
      divisions: "",
      teams: "",
    });
  }
}

/**
 * @param {HTMLElement} tbody
 * @param {HTMLElement} status
 */
async function loadTournaments(tbody, status) {
  try {
    const tournaments = await loadTournamentList();
    tbody.innerHTML = tournaments.map((t) => row(t, loadingCells(t))).join("");
    await Promise.all(
      tournaments.map((t) => {
        const tr = /** @type {HTMLTableRowElement} */ (tbody.querySelector(`tr[data-slug="${CSS.escape(t.slug)}"]`));
        return loadTournament(tr, t);
      }),
    );
  } catch (err) {
    tbody.innerHTML = "";
    status.hidden = false;
    status.textContent = `Couldn't load tournaments: ${errorMessage(err)}`;
  }
}

// modules are deferred, so the DOM is already parsed here
const tbody = document.getElementById("tournaments");
const status = document.getElementById("tournaments-status");
if (tbody && status) {
  loadTournaments(tbody, status);
}
