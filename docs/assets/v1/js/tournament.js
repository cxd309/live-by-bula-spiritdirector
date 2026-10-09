// @ts-check

// Tournament page: tournament.html?t={slug}, one tournament from
// tournaments.yaml, the most recent when t is left off
// three views, tabbed like Live!'s own pages:
// - overview: average spirit for the tournament and each division
// - teams: averages outside the thresholds
// - games: individual scores outside them
// issues are coloured red and highlights green, thresholds come from the
// query string and are editable on the page

import { liveDivisionURL, liveGameURL, liveTeamSpiritURL } from "./live/links.js";
import { resolveSource } from "./live/source.js";
import { getVersion } from "./live/versions.js";
import {
  errorMessage,
  esc,
  formatGameTime,
  loadTournamentList,
  shortCategory,
  shortDivision,
  shortGameTime,
  sourceBadge,
  updatedText,
} from "./page.js";
import { enableSorting, idleIcon, restoreSorts } from "./sortable.js";
import {
  averageSpirit,
  meanWithout,
  readThresholds,
  scoreHighlights,
  scoreIssues,
  spiritTallies,
  teamAverages,
  thresholdParams,
  writeThresholds,
} from "./spirit.js";

/**
 * @typedef {import("./live/model.js").Tournament} Tournament
 * @typedef {import("./live/model.js").Game} Game
 * @typedef {import("./live/model.js").Source} Source
 * @typedef {import("./live/model.js").SpiritCategory} SpiritCategory
 * @typedef {import("./live/model.js").SpiritScore} SpiritScore
 * @typedef {import("./live/model.js").TournamentSummary} TournamentSummary
 * @typedef {import("./spirit.js").SpiritAverage} SpiritAverage
 * @typedef {import("./spirit.js").TeamSpirit} TeamSpirit
 * @typedef {import("./spirit.js").SpiritTallies} SpiritTallies
 * @typedef {import("./spirit.js").Thresholds} Thresholds
 * @typedef {import("./sortable.js").SortState} SortState
 */

/**
 * The page's fixed elements, see tournament.html
 * @typedef {Object} Elements
 * @property {HTMLElement} name
 * @property {HTMLElement} dates
 * @property {HTMLElement} source
 * @property {HTMLElement} status
 * @property {HTMLElement} overview
 */

/**
 * Table cells for the ids the spirit scores carry, each shown as its
 * shorthand with the full name on hover
 * cells link back into Live! itself wherever there is a live deployment
 * @typedef {Object} Names
 * @property {(teamId: number, avg?: number) => string} team  a <td>, with avg after the name when given
 * @property {(divisionId: number) => string} division          a <td>
 * @property {(game: GameRef) => string | null} gameHref   that game's page on Live!
 */

/**
 * What identifies a game, which a Game and a SpiritScore both carry
 * @typedef {Pick<Game, "gameId" | "divisionId" | "homeTeamId" | "visitorTeamId" | "time">} GameRef
 */

/**
 * The screen width below which each kind of text switches to its shorthand,
 * as Bootstrap breakpoints: longest labels give way first, the time last
 * spirit categories aren't here, they're always shorthand, see spiritHead
 */
const shortenBelow = { division: "lg", team: "md", time: "sm" };

/**
 * Full text on wide screens, the shorthand below breakpoint, the way Live!
 * swaps its own headers with d-none d-lg-inline
 * @param {string} full
 * @param {string} short
 * @param {string} breakpoint  a Bootstrap breakpoint, see shortenBelow
 * @returns {string} an HTML snippet
 */
function responsive(full, short, breakpoint) {
  if (!short || short === full) return esc(full);
  return `<span class="d-none d-${breakpoint}-inline">${esc(full)}</span><span class="d-${breakpoint}-none">${
    esc(short)
  }</span>`;
}

/**
 * A cell that shortens on narrow screens, the full text on hover and as its
 * sort value whichever is showing
 * @param {string} full
 * @param {string} short
 * @param {string} breakpoint
 * @param {string} [classes]
 * @param {string} [sortValue]  defaults to full
 * @returns {string} an HTML snippet
 */
function shortCell(full, short, breakpoint, classes = "", sortValue = full) {
  return `<td class="${classes}" title="${esc(full)}" data-sort="${esc(sortValue)}">${
    responsive(full, short, breakpoint)
  }</td>`;
}

/**
 * A value followed by an average, e.g. "6 (8.90)"
 * @param {string} html     the value, an HTML snippet
 * @param {number | undefined} avg
 * @param {boolean} [muted]  false in cells that can be coloured, where muted
 *   text is hard to read
 * @returns {string} an HTML snippet
 */
function withAvg(html, avg, muted = true) {
  if (avg === undefined) return html;
  return `${html} <span class="${muted ? "text-body-secondary" : ""}">(${fmt(avg)})</span>`;
}

/**
 * @param {TournamentSummary} s
 * @param {Source} source
 * @returns {Names}
 */
function namesFor(s, source) {
  const teams = new Map(s.divisions.flatMap((d) => d.teams.map((t) => [t.id, { ...t, divisionId: d.id }])));
  const divisions = new Map(s.divisions.map((d) => [d.id, d.name]));
  /** @param {number} id */
  const divisionName = (id) => divisions.get(id) ?? "–";
  return {
    team: (id, avg) => {
      const t = teams.get(id);
      if (!t) return "<td>–</td>";
      const href = liveTeamSpiritURL(source, divisionName(t.divisionId), t.name, t.id);
      return `<td class="text-nowrap" title="${esc(t.name)}" data-sort="${esc(t.name)}">${
        link(withAvg(responsive(t.name, t.abbreviation, shortenBelow.team), avg), href, "team spirit on Live!")
      }</td>`;
    },
    division: (id) => {
      const name = divisionName(id);
      const inner = link(responsive(name, shortDivision(name), shortenBelow.division), liveDivisionURL(source, name));
      return `<td title="${esc(name)}" data-sort="${esc(name)}">${inner}</td>`;
    },
    gameHref: (game) =>
      liveGameURL(
        source,
        divisionName(game.divisionId),
        teams.get(game.homeTeamId)?.name ?? "",
        teams.get(game.visitorTeamId)?.name ?? "",
        game.gameId,
      ),
  };
}

/**
 * Wraps content in a link, or leaves it alone when there's nowhere to go,
 * as on every archive source
 * @param {string} html
 * @param {string | null} href
 * @param {string} [title]
 * @returns {string} an HTML snippet
 */
function link(html, href, title = "open in Live! by BULA") {
  return href ? `<a class="text-reset" href="${esc(href)}" title="${esc(title)}">${html}</a>` : html;
}

/**
 * @param {number} n
 * @returns {string} 1dp, or a dash when there was nothing to average
 */
function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(1) : "–";
}

/**
 * A sortable header cell, see sortable.js
 * @param {string} label     an HTML snippet, so it can be responsive()
 * @param {boolean} numeric  sorts numerically, and is centred like its column
 * @param {string} [title]   hover text
 * @returns {string} an HTML snippet
 */
function th(label, numeric, title = "") {
  return `<th scope="col" class="${numeric ? "text-center" : ""}" ${numeric ? `data-sort-type="number"` : ""}
    ${title ? `title="${esc(title)}"` : ""}><button type="button" class="sort-button">${label}<span
    class="sort-indicator bi ${idleIcon}"></span></button></th>`;
}

/**
 * Header cells for each spirit category then the total
 * categories are always their shorthand, full labels make the columns far
 * wider than the numbers under them, the full label is on hover
 * @param {SpiritCategory[]} categories
 * @param {string} [total]       the total column's header
 * @param {string} [totalTitle]  its hover text
 * @returns {string} an HTML snippet
 */
function spiritHead(categories, total = "Total", totalTitle = "") {
  return categoryHead(categories) + th(esc(total), true, totalTitle);
}

/**
 * Header cells for the spirit categories alone, for a table whose totals
 * have their own columns
 * @param {SpiritCategory[]} categories
 * @returns {string} an HTML snippet
 */
function categoryHead(categories) {
  return categories.map((c) => th(esc(shortCategory(c.label)), true, `${c.label} (${c.min}-${c.max})`)).join("");
}

/**
 * @param {string} head     the <tr> for <thead>
 * @param {string[]} rows
 * @param {string} sortKey  what sortable.js remembers this table's sort under
 * @returns {string} an HTML snippet
 */
function table(head, rows, sortKey) {
  if (rows.length === 0) return `<p class="text-center text-body-secondary fst-italic">None.</p>`;
  // Live!'s data table, less its Metronic-only classes
  return `
    <div class="table-responsive">
      <table class="table table-hover table-striped align-middle live-table" data-sort-key="${sortKey}">
        <thead>${head}</thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

/**
 * One overview row
 * @param {string} label
 * @param {number} teams
 * @param {number} games   completed games
 * @param {number} scores  scores in, each worth half a game
 * @param {SpiritAverage} avg
 * @param {SpiritCategory[]} categories
 * @param {boolean} pinned  stays on top whatever the sort
 * @param {string | null} [href]  the division's page on Live!
 * @returns {string} an HTML snippet
 */
function averageRow(label, teams, games, scores, avg, categories, pinned, href = null) {
  const cells = categories.map((c) => `<td class="text-center">${fmt(avg.categories[c.key])}</td>`).join("");
  const halves = scores / 2;
  return `
    <tr ${pinned ? "data-pinned" : ""}>
      <td data-sort="${esc(label)}">${link(esc(label), href)}</td>
      <td class="text-center">${teams}</td>
      <td class="text-center">${games}</td>
      <td class="text-center">${Number.isInteger(halves) ? halves : halves.toFixed(1)}</td>
      ${cells}
      <td class="text-center">${fmt(avg.total)}</td>
    </tr>
  `;
}

/**
 * A threshold input, sized to sit inside a heading's sentence
 * @param {Thresholds} t
 * @param {keyof Thresholds} key
 * @param {string} label  for screen readers, the heading gives it sighted
 * @returns {string} an HTML snippet
 */
function thresholdInput(t, key, label) {
  return `<input class="form-control form-control-sm d-inline-block threshold" type="number" step="0.5"
    name="${key}" value="${t[key]}" aria-label="${esc(label)}" />`;
}

/**
 * Average spirit received per category and in total: the whole tournament,
 * then each division
 * Games counts completed games and Scores the scores in, half a game each,
 * so the two match once every score is in
 * @param {TournamentSummary} s
 * @param {SpiritScore[]} scores
 * @param {Game[]} games
 * @param {Source} source
 * @returns {string} an HTML snippet
 */
function overviewTable(s, scores, games, source) {
  const cats = s.spiritCategories;
  const completed = games.filter((g) => g.completed);
  const head = `
    <tr>
      ${th("Division", false)}
      ${th("Teams", true)}
      ${th("Games", true, "games completed")}
      ${th("Scores", true, "spirit scores in, half a game each, so this matches Games once every score is in")}
      ${spiritHead(cats)}
    </tr>
  `;
  const rows = [
    averageRow("All tournament", s.teams, completed.length, scores.length, averageSpirit(scores, cats), cats, true),
    ...s.divisions.map((d) =>
      averageRow(
        d.name,
        d.teams.length,
        completed.filter((g) => g.divisionId === d.id).length,
        scores.filter((x) => x.divisionId === d.id).length,
        averageSpirit(scores.filter((x) => x.divisionId === d.id), cats),
        cats,
        false,
        liveDivisionURL(source, d.name),
      )
    ),
  ];
  return table(head, rows, "overview");
}

/**
 * Centred number cell, red when it makes its row an issue and green
 * when it makes it a highlight
 * @param {boolean} issue
 * @param {boolean} highlight
 * @returns {string} the td's classes
 */
function cellClass(issue, highlight) {
  return issue ? "text-center table-danger" : highlight ? "text-center table-success" : "text-center";
}

/**
 * Teams averaging outside the thresholds, lowest first so issues come
 * before highlights
 * teams are only here for their total, so that is the coloured cell
 * @param {TeamSpirit[]} teams
 * @param {SpiritCategory[]} categories
 * @param {Names} names
 * @param {Thresholds} t
 * @returns {string} an HTML snippet
 */
function teamTable(teams, categories, names, t) {
  const head = `
    <tr>
      ${th("Team", false)}
      ${th("Division", false)}
      ${th("Games", true)}
      ${spiritHead(categories)}
    </tr>
  `;
  const rows = teams
    .filter(({ avg }) => avg.total < t.teamLow || avg.total > t.teamHigh)
    .sort((a, b) => a.avg.total - b.avg.total)
    .map(({ teamId, divisionId, avg }) => {
      const cells = categories.map((c) => `<td class="text-center">${fmt(avg.categories[c.key])}</td>`).join("");
      return `
        <tr>
          ${names.team(teamId)}
          ${names.division(divisionId)}
          <td class="text-center">${avg.games}</td>
          ${cells}
          <td class="${cellClass(avg.total < t.teamLow, avg.total > t.teamHigh)}">${fmt(avg.total)}</td>
        </tr>
      `;
    });
  return table(head, rows, "teams");
}

/**
 * The game's time, linking to its page on Live!
 * @param {GameRef} game
 * @param {string | null} href
 * @returns {string} an HTML snippet
 */
function gameTimeCell(game, href) {
  const full = formatGameTime(game.time);
  const inner = link(responsive(full, shortGameTime(game.time), shortenBelow.time), href, "game on Live! by BULA");
  return `<td class="text-nowrap" title="${esc(full)}" data-sort="${esc(game.time)}">${inner}</td>`;
}

/**
 * @param {string | null} href
 * @returns {string} an HTML snippet, empty for an archive source
 */
function openButton(href) {
  return href ? `<a class="btn btn-sm btn-primary" href="${esc(href)}">Open</a>` : "";
}

/**
 * What this team gave back in the same game, just the total, coloured when
 * anything about that score is flagged, its total or any category
 * the detail is on that score's own row in this table, this only says to go
 * and look
 * @param {SpiritScore | undefined} back  undefined when that half isn't in yet
 * @param {SpiritCategory[]} categories
 * @param {Thresholds} t
 * @returns {string} an HTML snippet, one <td>
 */
function givenCell(back, categories, t) {
  if (!back) return `<td class="text-center">–</td>`;
  const issue = scoreIssues(back, categories, t).size > 0;
  const highlight = scoreHighlights(back, categories, t).size > 0;
  return `<td class="${cellClass(issue, highlight)}">${back.total}</td>`;
}

/**
 * Every score with an issue or a highlight, earliest game first, the cells
 * responsible coloured
 * averages alongside, to tell a harsh giver from a struggling team, each
 * leaving this game out so the score being judged isn't part of its own
 * comparison, and left off when there's no other game to average:
 * - Division: the game's division
 * - Team: the team given the score, and what it averages received
 * - Received: this score, and what the giver averages given
 * - Given: what this team gave back in the same game
 * - From: the team that gave it, and what it averages received
 * @param {SpiritScore[]} scores
 * @param {SpiritCategory[]} categories
 * @param {Names} names
 * @param {Thresholds} t
 * @param {SpiritTallies} tallies
 * @returns {string} an HTML snippet
 */
function gameTable(scores, categories, names, t, tallies) {
  const head = `
    <tr>
      ${th("Time", false)}
      ${th("Division", false)}
      ${th("Team", false, "the team given this score, and its average received, excluding this game")}
      ${th("Received", true, "what this team was given, and the average its opponent gives, excluding this game")}
      ${th("Given", true, "what this team gave back in the same game")}
      ${th("From", false, "the team that gave this score, and its average received, excluding this game")}
      ${categoryHead(categories)}
      <th scope="col"><span class="visually-hidden">Open</span></th>
    </tr>
  `;
  const rows = scores
    .map((score) => ({
      score,
      issues: scoreIssues(score, categories, t),
      highlights: scoreHighlights(score, categories, t),
    }))
    .filter((f) => f.issues.size > 0 || f.highlights.size > 0)
    .sort((a, b) => a.score.time.localeCompare(b.score.time) || a.score.gameId - b.score.gameId)
    .map(({ score, issues, highlights }) => {
      /** @param {string} key */
      const cls = (key) => cellClass(issues.has(key), highlights.has(key));
      // the other half of the pair: what this team gave its opponent
      const back = tallies.scoreFor(score.gameId, score.fromTeamId);
      const cells = categories.map((c) => `<td class="${cls(c.key)}">${score.categories[c.key]}</td>`).join("");
      return `
        <tr>
          ${gameTimeCell(score, names.gameHref(score))}
          ${names.division(score.divisionId)}
          ${names.team(score.teamId, meanWithout(tallies.received.get(score.teamId), score.total))}
          <td class="${cls("total")} text-nowrap">${
        withAvg(String(score.total), meanWithout(tallies.given.get(score.fromTeamId), score.total), false)
      }</td>
          ${givenCell(back, categories, t)}
          ${names.team(score.fromTeamId, meanWithout(tallies.received.get(score.fromTeamId), back?.total))}
          ${cells}
          <td class="text-end">${openButton(names.gameHref(score))}</td>
        </tr>
      `;
    });
  return table(head, rows, "games");
}

/**
 * Pitch names sort as text, so pad numeric ones to keep 10 after 9
 * @param {string} pitch
 * @returns {string} an HTML snippet, one <td>
 */
function pitchCell(pitch) {
  const sort = /^\d+$/.test(pitch) ? pitch.padStart(6, "0") : pitch;
  return `<td class="text-center" data-sort="${esc(sort)}">${esc(pitch) || "–"}</td>`;
}

/**
 * Completed games still waiting on a spirit score, one row per team that
 * hasn't submitted, earliest first
 * - Team: the team that owes the score
 * - Missing: the team the score is for
 * - Received: what Team was given by Missing in the same game, a dash when that's
 *   outstanding too
 * @param {Game[]} games
 * @param {Names} names
 * @param {SpiritTallies} tallies
 * @returns {string} an HTML snippet
 */
function missingTable(games, names, tallies) {
  const head = `
    <tr>
      ${th("Time", false)}
      ${th("Pitch", false)}
      ${th("Division", false)}
      ${th("Team", false, "the team that hasn't submitted its score")}
      ${th("Missing", false, "the team the missing score is for")}
      ${th("Received", true, "the score this team was given in this game, a dash when that's missing too")}
      <th scope="col"><span class="visually-hidden">Open</span></th>
    </tr>
  `;
  const rows = games
    .filter((g) => g.completed && g.homeTeamId && g.visitorTeamId)
    .sort((a, b) => a.time.localeCompare(b.time) || a.pitch.localeCompare(b.pitch, undefined, { numeric: true }))
    .flatMap((g) =>
      [[g.homeTeamId, g.visitorTeamId], [g.visitorTeamId, g.homeTeamId]]
        .filter(([, missing]) => !tallies.scoreFor(g.gameId, missing))
        .map(([team, missing]) => `
          <tr>
            ${gameTimeCell(g, names.gameHref(g))}
            ${pitchCell(g.pitch)}
            ${names.division(g.divisionId)}
            ${names.team(team)}
            ${names.team(missing)}
            <td class="text-center">${tallies.scoreFor(g.gameId, team)?.total ?? "–"}</td>
            <td class="text-end">${openButton(names.gameHref(g))}</td>
          </tr>
        `)
    );
  return table(head, rows, "missing");
}

/** @typedef {"overview" | "teams" | "games" | "missing"} Tab */

/** @type {{id: Tab, label: string}[]} */
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "teams", label: "Teams" },
  { id: "games", label: "Games" },
  { id: "missing", label: "Missing" },
];

/**
 * @param {URLSearchParams} params
 * @returns {Tab}
 */
function readTab(params) {
  const tab = params.get("tab");
  return tab === "teams" || tab === "games" || tab === "missing" ? tab : "overview";
}

/**
 * Everything spirit, switched between with Live!'s button tabs, so each view
 * gets the full width
 * each threshold's input sits in its tab's description, and the teams and
 * games tables are empty placeholders, see fillTables, so typing in an input
 * redraws the tables but never the input itself
 * @param {TournamentSummary} s
 * @param {SpiritScore[]} scores
 * @param {Game[]} games
 * @param {Thresholds} t
 * @param {Tab} selected
 * @param {Source} source
 * @returns {string} an HTML snippet
 */
function renderSpiritCard(s, scores, games, t, selected, source) {
  const buttons = tabs
    .map((tab) =>
      `<button type="button" data-tab="${tab.id}" aria-pressed="${tab.id === selected}"
        class="btn btn-sm px-3 py-2 me-2 mb-1 ${
        tab.id === selected ? "btn-primary" : "btn-secondary"
      }">${tab.label}</button>`
    )
    .join("");
  /** @param {Tab} tab */
  const hidden = (tab) => (tab === selected ? "" : "hidden");
  const body = `
    <form id="thresholds">
      <div class="mb-3">${buttons}</div>
      <div data-pane="overview" ${hidden("overview")}>
        <p class="text-body-secondary">
          Average spirit score received per game. Each score counts once, for
          the team it was given to.
        </p>
        ${overviewTable(s, scores, games, source)}
      </div>
      <div data-pane="teams" ${hidden("teams")}>
        <p class="text-body-secondary">
          Average below ${thresholdInput(t, "teamLow", "Team average below")}
          or above ${thresholdInput(t, "teamHigh", "Team average above")}.
          Red is an issue, green a highlight.
        </p>
        <div data-table="teams"></div>
      </div>
      <div data-pane="games" ${hidden("games")}>
        <p class="text-body-secondary">
          Total below ${thresholdInput(t, "gameLow", "Game total below")}
          or above ${thresholdInput(t, "gameHigh", "Game total above")},
          or any category at its minimum or maximum.
          Red is an issue, green a highlight.
        </p>
        <div data-table="games"></div>
      </div>
      <div data-pane="missing" ${hidden("missing")}>
        <p class="text-body-secondary">
          Completed games still waiting on a spirit score, one row for each
          team that hasn't submitted.
        </p>
        ${missingTable(games, namesFor(s, source), spiritTallies(scores))}
      </div>
    </form>
  `;
  return body;
}

/**
 * Fills renderSpiritCard's placeholders for the given thresholds
 * @param {HTMLElement} container
 * @param {TournamentSummary} s
 * @param {SpiritScore[]} scores
 * @param {Thresholds} t
 * @param {Map<string, SortState>} sorts  re-applied, so a redraw keeps each table's sort
 * @param {Source} source
 */
function fillTables(container, s, scores, t, sorts, source) {
  const cats = s.spiritCategories;
  const names = namesFor(s, source);
  /** @type {Record<string, string>} */
  const tables = {
    teams: teamTable(teamAverages(scores, cats), cats, names, t),
    games: gameTable(scores, cats, names, t, spiritTallies(scores)),
  };
  for (const el of container.querySelectorAll("[data-table]")) {
    el.innerHTML = tables[/** @type {HTMLElement} */ (el).dataset.table ?? ""] ?? "";
  }
  restoreSorts(container, sorts);
}

/**
 * Renders everything below the header, then redraws the flagged tables
 * whenever a threshold changes, mirroring the values into the URL so the
 * view is a shareable, reload-stable link
 * @param {HTMLElement} container
 * @param {TournamentSummary} s
 * @param {SpiritScore[]} scores
 * @param {Game[]} games
 * @param {Source} source
 */
function renderSpirit(container, s, scores, games, source) {
  const params = new URLSearchParams(location.search);
  const t = readThresholds(params);
  container.innerHTML = renderSpiritCard(s, scores, games, t, readTab(params), source);
  const form = /** @type {HTMLFormElement} */ (container.querySelector("#thresholds"));
  /** @type {Map<string, SortState>} */
  const sorts = new Map();
  enableSorting(container, sorts);
  fillTables(container, s, scores, t, sorts, source);

  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest("[data-tab]") : null;
    if (!(button instanceof HTMLElement)) return;
    const selected = readTab(new URLSearchParams({ tab: button.dataset.tab ?? "" }));
    for (const b of form.querySelectorAll("[data-tab]")) {
      const on = /** @type {HTMLElement} */ (b).dataset.tab === selected;
      b.classList.toggle("btn-primary", on);
      b.classList.toggle("btn-secondary", !on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const pane of form.querySelectorAll("[data-pane]")) {
      /** @type {HTMLElement} */ (pane).hidden = /** @type {HTMLElement} */ (pane).dataset.pane !== selected;
    }
    // overview is the default, so it stays out of the URL
    const url = new URL(location.href);
    if (selected === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", selected);
    history.replaceState(null, "", url);
  });
  form.addEventListener("input", () => {
    // blank or half-typed inputs fall back to the defaults via readThresholds
    const params = new URLSearchParams();
    for (const [key, name] of Object.entries(thresholdParams)) {
      const input = /** @type {HTMLInputElement | null} */ (form.elements.namedItem(key));
      params.set(name, input?.value ?? "");
    }
    const next = readThresholds(params);
    const url = new URL(location.href);
    writeThresholds(url, next);
    history.replaceState(null, "", url);
    fillTables(container, s, scores, next, sorts, source);
  });
}

/**
 * @param {Elements} el
 * @param {string} message
 */
function showError(el, message) {
  el.status.hidden = false;
  el.status.textContent = message;
}

/**
 * The tournament with the latest start date, the page's default
 * tournaments.yaml is kept newest first, but this doesn't rely on it
 * @param {Tournament[]} tournaments
 * @returns {Tournament | undefined}
 */
function mostRecent(tournaments) {
  return tournaments.reduce(
    (/** @type {Tournament | undefined} */ latest, x) => (!latest || x.start_date > latest.start_date ? x : latest),
    undefined,
  );
}

/**
 * @param {Elements} el
 */
async function loadPage(el) {
  const slug = new URLSearchParams(location.search).get("t");

  /** @type {Tournament[]} */
  let tournaments;
  try {
    tournaments = await loadTournamentList();
  } catch (err) {
    el.name.textContent = slug ?? "";
    showError(el, `Couldn't load tournaments: ${errorMessage(err)}`);
    return;
  }
  const t = slug ? tournaments.find((x) => x.slug === slug) : mostRecent(tournaments);
  if (!t) {
    el.name.textContent = slug ?? "No tournaments";
    showError(el, slug ? `${slug} isn't in tournaments.yaml.` : "tournaments.yaml lists no tournaments.");
    return;
  }
  if (!slug) {
    // pin the default into the URL, so a copied link keeps pointing here
    // after a newer tournament is added
    const url = new URL(location.href);
    url.searchParams.set("t", t.slug);
    history.replaceState(null, "", url);
  }

  el.name.textContent = t.event;
  document.title = `${t.event} · Live! by BULA Spirit Director`;
  try {
    const adapter = getVersion(t.version);
    const source = await resolveSource(t);
    const s = await adapter.loadSummary(source);
    el.dates.textContent = `${s.start} to ${s.end} · ${s.timezone} · ${s.status}`;
    el.source.innerHTML = `
      ${sourceBadge(t, source)}
      ${t.host ? `<code>${esc(t.host)}</code>` : ""}
      <code>${esc(t.version)}</code>
      <span class="small text-body-secondary">${esc(updatedText(source))}</span>
    `;
    // one file per team, so this is the slow part, show the header first
    el.overview.innerHTML = `<p class="text-body-secondary">Loading spirit scores for ${s.teams} teams&hellip;</p>`;
    const [scores, games] = await Promise.all([adapter.loadSpiritScores(source, s), adapter.loadGames(source, s)]);
    renderSpirit(el.overview, s, scores, games, source);
  } catch (err) {
    showError(el, `Couldn't load ${t.event}: ${errorMessage(err)}`);
  }
}

// modules are deferred, so the DOM is already parsed here
const elements = {
  name: document.getElementById("tournament-name"),
  dates: document.getElementById("tournament-dates"),
  source: document.getElementById("tournament-source"),
  status: document.getElementById("tournament-status"),
  overview: document.getElementById("tournament-overview"),
};
if (Object.values(elements).every((e) => e !== null)) {
  loadPage(/** @type {Elements} */ (elements));
}
