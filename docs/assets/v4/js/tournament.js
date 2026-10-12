// @ts-check

// Tournament page: tournament.html?t={slug}, one tournament from
// tournaments.yaml, the most recent when t is left off
// views tabbed like Live!'s own pages:
// - overview: average spirit for the tournament and each division
// - teams: averages outside the thresholds
// - games: individual scores outside them
// - missing: completed games still waiting on a score
// - comments: every score that came with one, only when the event has any
// issues are coloured red and highlights green, thresholds come from the
// query string and are editable on the page
// the tables hold no links, every row opens the detail modal instead, which
// has the rest along with the links back into Live!, see enableDetail

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
  commentFlags,
  flagComment,
  flaggedWords,
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
 * @typedef {Object} Names
 * @property {(teamId: number, avg?: number) => string} team  a <td>, with avg after the name when given
 * @property {(divisionId: number) => string} division          a <td>
 * @property {(game: GameRef) => string | null} gameHref   that game's page on Live!
 * @property {(teamId: number) => NameRef} teamRef          for the detail view
 * @property {(divisionId: number) => NameRef} divisionRef  likewise
 */

/**
 * @typedef {Object} NameRef
 * @property {string} name
 * @property {string} short       shorthand, name when there isn't one
 * @property {string | null} href  its page on Live!
 */

/**
 * What identifies a game, which a Game and a SpiritScore both carry
 * @typedef {Pick<Game, "gameId" | "divisionId" | "homeTeamId" | "visitorTeamId" | "time">} GameRef
 */

/**
 * The screen width below which each kind of text switches to its shorthand,
 * as Bootstrap breakpoints: longest labels give way first, the time last
 * spirit categories aren't here, they're always shorthand, see categoryHead
 * headers shorten below md, see th
 */
const shortenBelow = { division: "lg", team: "md", time: "sm" };

/**
 * Classes for a column phones leave out, the detail view has it instead,
 * on both its th and its tds
 */
const wide = "d-none d-md-table-cell";

/**
 * Makes a row open a detail view, see enableDetail
 * @param {string} detail  e.g. "game-123", see renderDetail
 * @returns {string} attributes for the <tr>
 */
function detailAttrs(detail) {
  return `data-detail="${esc(detail)}" tabindex="0"`;
}

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
 * A value followed by an average, e.g. "6 (8.90)", the average on a line of
 * its own on phones, see .avg
 * @param {string} html     the value, an HTML snippet
 * @param {number | undefined} avg
 * @param {boolean} [muted]  false in cells that can be coloured, where muted
 *   text is hard to read
 * @returns {string} an HTML snippet
 */
function withAvg(html, avg, muted = true) {
  if (avg === undefined) return html;
  return `${html} <span class="avg ${muted ? "text-body-secondary" : ""}">(${fmt(avg)})</span>`;
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
      return `<td class="text-nowrap" title="${esc(t.name)}" data-sort="${esc(t.name)}">${
        withAvg(responsive(t.name, t.abbreviation, shortenBelow.team), avg)
      }</td>`;
    },
    division: (id) => {
      const name = divisionName(id);
      return shortCell(name, shortDivision(name), shortenBelow.division);
    },
    teamRef: (id) => {
      const t = teams.get(id);
      if (!t) return { name: "–", short: "–", href: null };
      return {
        name: t.name,
        short: t.abbreviation || t.name,
        href: liveTeamSpiritURL(source, divisionName(t.divisionId), t.name, t.id),
      };
    },
    divisionRef: (id) => {
      const name = divisionName(id);
      return { name, short: shortDivision(name), href: divisions.has(id) ? liveDivisionURL(source, name) : null };
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
 * @param {number} n
 * @returns {string} 1dp, or a dash when there was nothing to average
 */
function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(1) : "–";
}

/**
 * A sortable header cell, see sortable.js
 * @param {string} label     plain text
 * @param {boolean} numeric  sorts numerically, and is centred like its column
 * @param {string} [title]   hover text
 * @param {string} [classes] e.g. wide
 * @param {string} [short]   the label on phones
 * @returns {string} an HTML snippet
 */
function th(label, numeric, title = "", classes = "", short = "") {
  return `<th scope="col" class="${numeric ? "text-center" : ""} ${classes}" ${numeric ? `data-sort-type="number"` : ""}
    ${title ? `title="${esc(title)}"` : ""}><button type="button" class="sort-button">${
    responsive(label, short, "md")
  }<span class="sort-indicator bi ${idleIcon}"></span></button></th>`;
}

/** The division column's header, every table has one */
const divisionHead = th("Division", false, "", "", "Div");

/**
 * Header cells for the spirit categories, for a table whose totals have
 * their own columns
 * categories are always their shorthand, full labels make the columns far
 * wider than the numbers under them, the full label is on hover
 * phones leave the categories to the detail view
 * @param {SpiritCategory[]} categories
 * @returns {string} an HTML snippet
 */
function categoryHead(categories) {
  return categories
    .map((c) => th(shortCategory(c.label), true, `${c.label} (${c.min}-${c.max})`, wide))
    .join("");
}

/**
 * Body cells to go under categoryHead
 * @param {SpiritCategory[]} categories
 * @param {(c: SpiritCategory) => string} value  an HTML snippet
 * @param {(c: SpiritCategory) => string} [classes]  defaults to centred
 * @returns {string} an HTML snippet
 */
function categoryCells(categories, value, classes = () => "text-center") {
  return categories.map((c) => `<td class="${classes(c)} ${wide}">${value(c)}</td>`).join("");
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
 * @param {number} scores  scores in
 * @param {number} games   completed games, two scores each
 * @returns {string} the share in as a percentage, a dash rather than 0% when
 *   nothing has finished yet
 */
function scoresIn(scores, games) {
  return games > 0 ? `${Math.round((scores / (2 * games)) * 100)}%` : "–";
}

/**
 * One overview row
 * @param {string} label
 * @param {number} teams
 * @param {number} games   completed games
 * @param {number} scores  scores in, two per completed game when all are in
 * @param {SpiritAverage} avg
 * @param {SpiritCategory[]} categories
 * @param {boolean} pinned  stays on top whatever the sort
 * @param {string} detail   see detailAttrs
 * @returns {string} an HTML snippet
 */
function averageRow(label, teams, games, scores, avg, categories, pinned, detail) {
  return `
    <tr ${pinned ? "data-pinned" : ""} ${detailAttrs(detail)}>
      <td data-sort="${esc(label)}">${esc(label)}</td>
      <td class="text-center">${teams}</td>
      <td class="text-center">${games}</td>
      <td class="text-center">${scoresIn(scores, games)}</td>
      <td class="text-center">${fmt(avg.total)}</td>
      ${categoryCells(categories, (c) => fmt(avg.categories[c.key]))}
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
 * Whether a game should have its two spirit scores by now: it's finished,
 * and was played rather than forfeited
 * @param {Game} g
 * @returns {boolean}
 */
function owesSpirit(g) {
  return g.completed && !g.forfeit;
}

/**
 * Average spirit received in total and per category: the whole tournament,
 * then each division
 * Games counts completed games and Scores how many of their scores are in,
 * two per game, as a percentage, forfeits in neither since they're owed none
 * @param {TournamentSummary} s
 * @param {SpiritScore[]} scores
 * @param {Game[]} games
 * @returns {string} an HTML snippet
 */
function overviewTable(s, scores, games) {
  const cats = s.spiritCategories;
  const completed = games.filter(owesSpirit);
  // only scores for games that owe them count towards Scores, so one given
  // for a forfeit anyway can't take it past 100%
  const owed = new Set(completed.map((g) => g.gameId));
  const counted = scores.filter((x) => owed.has(x.gameId));
  const head = `
    <tr>
      ${divisionHead}
      ${th("Teams", true)}
      ${th("Games", true, "games completed, not counting forfeits")}
      ${th("Scores", true, "spirit scores in for completed games, two per game, 100% once every score is in")}
      ${th("Total", true)}
      ${categoryHead(cats)}
    </tr>
  `;
  const rows = [
    averageRow(
      "All tournament",
      s.teams,
      completed.length,
      counted.length,
      averageSpirit(scores, cats),
      cats,
      true,
      "division-0",
    ),
    ...s.divisions.map((d) =>
      averageRow(
        d.name,
        d.teams.length,
        completed.filter((g) => g.divisionId === d.id).length,
        counted.filter((x) => x.divisionId === d.id).length,
        averageSpirit(scores.filter((x) => x.divisionId === d.id), cats),
        cats,
        false,
        `division-${d.id}`,
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
 * teams are only here for their total, so that is the coloured cell, and
 * it comes before the categories
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
      ${divisionHead}
      ${th("Games", true)}
      ${th("Total", true)}
      ${categoryHead(categories)}
    </tr>
  `;
  const rows = teams
    .filter(({ avg }) => avg.total < t.teamLow || avg.total > t.teamHigh)
    .sort((a, b) => a.avg.total - b.avg.total)
    .map(({ teamId, divisionId, avg }) => `
      <tr ${detailAttrs(`team-${teamId}`)}>
        ${names.team(teamId)}
        ${names.division(divisionId)}
        <td class="text-center">${avg.games}</td>
        <td class="${cellClass(avg.total < t.teamLow, avg.total > t.teamHigh)}">${fmt(avg.total)}</td>
        ${categoryCells(categories, (c) => fmt(avg.categories[c.key]))}
      </tr>
    `);
  return table(head, rows, "teams");
}

/**
 * @param {GameRef} game
 * @returns {string} an HTML snippet, one <td>
 */
function gameTimeCell(game) {
  const full = formatGameTime(game.time);
  return shortCell(full, shortGameTime(game.time), shortenBelow.time, "text-nowrap", game.time);
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
 * - Given: what this team gave back in the same game, and what it averages
 *   given, coloured when anything about that score is flagged, its own row
 *   has the detail
 * - From: the team that gave it, and what it averages received
 * so a score's bracket is always what its giver usually gives, and a team's
 * what it usually receives
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
      ${divisionHead}
      ${th("Team", false, "the team given this score, and its average received, excluding this game")}
      ${
    th(
      "Received",
      true,
      "what this team was given, and the average its opponent gives, excluding this game",
      "",
      "Rec",
    )
  }
      ${th("Given", true, "what this team gave back in the same game, and the average it gives, excluding this game")}
      ${th("From", false, "the team that gave this score, and its average received, excluding this game")}
      ${categoryHead(categories)}
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
      const backClass = back
        ? cellClass(scoreIssues(back, categories, t).size > 0, scoreHighlights(back, categories, t).size > 0)
        : "text-center";
      return `
        <tr ${detailAttrs(`game-${score.gameId}`)}>
          ${gameTimeCell(score)}
          ${names.division(score.divisionId)}
          ${names.team(score.teamId, meanWithout(tallies.received.get(score.teamId), score.total))}
          <td class="${cls("total")} text-nowrap">${
        withAvg(String(score.total), meanWithout(tallies.given.get(score.fromTeamId), score.total), false)
      }</td>
          <td class="${backClass} text-nowrap">${
        back ? withAvg(String(back.total), meanWithout(tallies.given.get(score.teamId), back.total), false) : "–"
      }</td>
          ${names.team(score.fromTeamId, meanWithout(tallies.received.get(score.fromTeamId), back?.total))}
          ${categoryCells(categories, (c) => String(score.categories[c.key]), (c) => cls(c.key))}
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
 * - Not submitted: the team that owes the score
 * - For: the team the score is for
 * - Received: what Not submitted was given by For in the same game, a dash when that's
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
      ${divisionHead}
      ${th("Not submitted", false, "the team that hasn't submitted its score", "", "Not sub")}
      ${th("For", false, "the team the missing score is for")}
      ${
    th(
      "Received",
      true,
      "the score the team that hasn't submitted was given in this game, a dash when that's missing too",
      "",
      "Rec",
    )
  }
    </tr>
  `;
  const rows = games
    .filter((g) => owesSpirit(g) && g.homeTeamId && g.visitorTeamId)
    .sort((a, b) => a.time.localeCompare(b.time) || a.pitch.localeCompare(b.pitch, undefined, { numeric: true }))
    .flatMap((g) =>
      [[g.homeTeamId, g.visitorTeamId], [g.visitorTeamId, g.homeTeamId]]
        .filter(([, missing]) => !tallies.scoreFor(g.gameId, missing))
        .map(([team, missing]) => `
          <tr ${detailAttrs(`game-${g.gameId}`)}>
            ${gameTimeCell(g)}
            ${pitchCell(g.pitch)}
            ${names.division(g.divisionId)}
            ${names.team(team)}
            ${names.team(missing)}
            <td class="text-center">${tallies.scoreFor(g.gameId, team)?.total ?? "–"}</td>
          </tr>
        `)
    );
  return table(head, rows, "missing");
}

/**
 * A comment's text with its flagged words marked, see commentFlags
 * @param {string} comment
 * @returns {string} an HTML snippet
 */
function markedComment(comment) {
  let html = "";
  let last = 0;
  for (const m of comment.matchAll(flaggedWords)) {
    html += `${esc(comment.slice(last, m.index))}<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return html + esc(comment.slice(last));
}

/**
 * A badge for each group of flagged words a comment mentions
 * @param {string} comment
 * @returns {string} an HTML snippet, empty when it mentions none
 */
function flagBadges(comment) {
  const badges = flagComment(comment).map((f) => `<span class="badge text-bg-danger me-1">${esc(f.label)}</span>`);
  return badges.length ? `<div class="mb-1">${badges.join("")}</div>` : "";
}

/**
 * The words each flag looks for, under the comments table, from the same
 * list the matching uses so the two can't drift apart
 * @returns {string} an HTML snippet
 */
function flagKey() {
  const rows = commentFlags.map((f) => `
    <div class="mb-1">
      <span class="badge text-bg-danger me-1">${esc(f.label)}</span>${esc(f.words.join(", "))}
    </div>
  `);
  return `
    <div class="small text-body-secondary mt-3">
      <p class="mb-1">
        Flagged keywords. Each matching the start of a word in any case, so "cheat" also catches "cheated":
      </p>
      ${rows.join("")}
    </div>
  `;
}

/**
 * Every score that came with a comment, earliest first, the comment cut to
 * two lines on phones with the rest in the game's detail view
 * comments mentioning a flagged word carry a badge for its group and the
 * word marked, and sort first on the Comment column
 * @param {SpiritScore[]} scores
 * @param {Names} names
 * @returns {string} an HTML snippet
 */
function commentTable(scores, names) {
  const head = `
    <tr>
      ${th("Time", false)}
      ${divisionHead}
      ${th("From", false, "the team that wrote the comment")}
      ${th("For", false, "the team the comment is about")}
      ${th("Total", true, "the score it came with", wide)}
      ${th("Comment", false, "flagged comments sort first")}
    </tr>
  `;
  const rows = scores
    .filter((score) => score.comment)
    .sort((a, b) => a.time.localeCompare(b.time) || a.gameId - b.gameId)
    .map((score) => `
      <tr ${detailAttrs(`game-${score.gameId}`)}>
        ${gameTimeCell(score)}
        ${names.division(score.divisionId)}
        ${names.team(score.fromTeamId)}
        ${names.team(score.teamId)}
        <td class="text-center ${wide}">${score.total}</td>
        <td class="comment-cell" data-sort="${flagComment(score.comment).length ? 0 : 1} ${esc(score.comment)}">${
      flagBadges(score.comment)
    }<div class="comment">${markedComment(score.comment)}</div></td>
      </tr>
    `);
  return table(head, rows, "comments");
}

/** @typedef {"overview" | "teams" | "games" | "missing" | "comments"} Tab */

/**
 * short is the label on phones, where every tab shares one row
 * @type {{id: Tab, label: string, short: string}[]}
 */
const tabs = [
  { id: "overview", label: "Overview", short: "Over" },
  { id: "teams", label: "Teams", short: "Teams" },
  { id: "games", label: "Games", short: "Games" },
  { id: "missing", label: "Missing", short: "Mis." },
  { id: "comments", label: "Comments", short: "Com." },
];

/**
 * The tabs a tournament gets, Comments only once it has any, most events
 * don't publish them
 * @param {SpiritScore[]} scores
 * @returns {Tab[]}
 */
function tabsFor(scores) {
  const hasComments = scores.some((x) => x.comment);
  return tabs.map((tab) => tab.id).filter((id) => id !== "comments" || hasComments);
}

/**
 * @param {URLSearchParams} params
 * @param {Tab[]} available  see tabsFor
 * @returns {Tab}
 */
function readTab(params, available) {
  const tab = available.find((id) => id === params.get("tab"));
  return tab ?? "overview";
}

/**
 * Everything the detail view draws from, the thresholds being whatever the
 * inputs hold when it opens
 * @typedef {Object} DetailContext
 * @property {TournamentSummary} s
 * @property {SpiritScore[]} scores
 * @property {Map<number, Game>} games  by gameId
 * @property {Names} names
 * @property {SpiritTallies} tallies
 * @property {Thresholds} t
 * @property {boolean} hasComments  the event publishes spirit comments
 */

/**
 * One page of the detail modal, see tournament.html's #detail
 * @typedef {Object} DetailView
 * @property {string} title   plain text
 * @property {string} meta    an HTML snippet, under the title
 * @property {string} body    an HTML snippet
 * @property {string} footer  an HTML snippet, links back into Live!
 */

/**
 * A button opening another page of the detail modal
 * @param {string} html    its label, an HTML snippet
 * @param {string} detail  see renderDetail
 * @param {string} [classes]
 * @returns {string} an HTML snippet
 */
function detailButton(html, detail, classes = "") {
  return `<button type="button" class="btn btn-link p-0 align-baseline ${classes}"
    data-detail="${esc(detail)}">${html}</button>`;
}

/**
 * @param {string} label
 * @param {string | null} href
 * @returns {string} an HTML snippet, empty for an archive source
 */
function liveButton(label, href) {
  return href ? `<a class="btn btn-outline-primary" href="${esc(href)}">${esc(label)}</a>` : "";
}

/**
 * One spirit comment and who wrote it, flagged as on the Comments tab
 * @param {string} caption  plain text
 * @param {string} comment
 * @returns {string} an HTML snippet
 */
function commentBlock(caption, comment) {
  return `
    <figure class="mb-3">
      <figcaption class="small text-body-secondary mb-1">${esc(caption)}</figcaption>
      ${flagBadges(comment)}
      <blockquote class="comment border-start border-3 ps-3 mb-0">${markedComment(comment)}</blockquote>
    </figure>
  `;
}

/**
 * A table in the detail view, unsorted and with the full category labels,
 * there's room for them here
 * @param {string} head  the <tr> for <thead>
 * @param {string[]} rows
 * @returns {string} an HTML snippet
 */
function detailTable(head, rows) {
  return `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle live-table">
        <thead>${head}</thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

/**
 * @param {string} heading
 * @returns {string} an HTML snippet
 */
function detailHeading(heading) {
  return `<h3 class="h6 mt-4">${esc(heading)}</h3>`;
}

/**
 * A game's result for one side, e.g. "15-14 W"
 * a forfeit's score says nothing, 3.0 records them 0-0, so it just says so
 * @param {Game | undefined} g
 * @param {number} teamId
 * @returns {string} plain text, a dash before the game has a score
 */
function result(g, teamId) {
  if (g?.forfeit) return "Forfeit";
  if (!g || g.homeScore === null || g.visitorScore === null) return "–";
  const home = g.homeTeamId === teamId;
  const own = home ? g.homeScore : g.visitorScore;
  const other = home ? g.visitorScore : g.homeScore;
  const wld = !g.completed ? "" : own > other ? " W" : own < other ? " L" : " D";
  return `${own}-${other}${wld}`;
}

/**
 * A spirit total coloured when anything about the score is flagged, the
 * game's page has the detail
 * @param {DetailContext} ctx
 * @param {SpiritScore | undefined} score
 * @param {number | undefined} avg  what its giver usually gives
 * @returns {string} an HTML snippet, one <td>
 */
function flaggedTotalCell(ctx, score, avg) {
  if (!score) return `<td class="text-center">–</td>`;
  const cats = ctx.s.spiritCategories;
  const issue = scoreIssues(score, cats, ctx.t).size > 0;
  const highlight = scoreHighlights(score, cats, ctx.t).size > 0;
  return `<td class="${cellClass(issue, highlight)} text-nowrap">${withAvg(String(score.total), avg, false)}</td>`;
}

/**
 * Both halves of one game side by side: the result, each team's score by
 * category, the averages to read it against, and any comments
 * each team's name opens its own page
 * @param {DetailContext} ctx
 * @param {number} gameId
 * @returns {DetailView | null} null for a game that isn't known
 */
function gameDetail(ctx, gameId) {
  const { names, tallies, t } = ctx;
  const cats = ctx.s.spiritCategories;
  const score = ctx.scores.find((x) => x.gameId === gameId);
  const g = ctx.games.get(gameId)
    ?? (score && { ...score, pitch: "", completed: true, forfeit: false, homeScore: null, visitorScore: null });
  if (!g || !g.homeTeamId || !g.visitorTeamId) return null;

  const sides = [[g.homeTeamId, g.visitorTeamId], [g.visitorTeamId, g.homeTeamId]].map(([teamId, from]) => {
    const score = tallies.scoreFor(gameId, teamId);
    return {
      teamId,
      from,
      team: names.teamRef(teamId),
      giver: names.teamRef(from),
      score,
      issues: score ? scoreIssues(score, cats, t) : new Set(),
      highlights: score ? scoreHighlights(score, cats, t) : new Set(),
    };
  });
  /**
   * @param {string} key  a category key, or "total"
   * @returns {string} one <td> per side
   */
  const cells = (key) =>
    sides.map((x) => {
      if (!x.score) return `<td class="text-center">–</td>`;
      const value = key === "total" ? x.score.total : x.score.categories[key];
      return `<td class="${cellClass(x.issues.has(key), x.highlights.has(key))}">${value}</td>`;
    }).join("");
  /**
   * @param {string} label
   * @param {string} title
   * @param {(x: typeof sides[number]) => number | undefined} avg
   * @returns {string} a muted <tr>
   */
  const avgRow = (label, title, avg) => `
    <tr>
      <th scope="row" class="fw-normal text-body-secondary" title="${esc(title)}">${esc(label)}</th>
      ${sides.map((x) => `<td class="text-center text-body-secondary">${fmt(avg(x) ?? NaN)}</td>`).join("")}
    </tr>
  `;

  const played = g.homeScore !== null && g.visitorScore !== null;
  // a forfeit's score says nothing, see result
  const middle = g.forfeit
    ? `<span class="badge text-bg-secondary fs-6">Forfeit</span>`
    : `<span class="fs-3 fw-bold">${played ? `${g.homeScore} – ${g.visitorScore}` : "v"}</span>`;
  const scoreboard = `
    <div class="d-flex align-items-center text-center gap-2 mb-3">
      <div class="w-50">${detailButton(esc(sides[0].team.name), `team-${g.homeTeamId}`, "fw-semibold")}</div>
      <div class="text-nowrap">${middle}</div>
      <div class="w-50">${detailButton(esc(sides[1].team.name), `team-${g.visitorTeamId}`, "fw-semibold")}</div>
    </div>
  `;
  const head = `
    <tr>
      <th scope="col">Score for</th>
      ${
    sides.map((x) =>
      `<th scope="col" class="text-center" title="${esc(`${x.team.name}, given by ${x.giver.name}`)}">${
        esc(x.team.short)
      }</th>`
    ).join("")
  }
    </tr>
  `;
  // the total last, beside the averages it's read against
  const rows = [
    ...cats.map((c) => `
      <tr>
        <th scope="row" class="fw-normal" title="${esc(`${c.min}-${c.max}`)}">${esc(c.label)}</th>
        ${cells(c.key)}
      </tr>
    `),
    `<tr class="fw-bold"><th scope="row">Total</th>${cells("total")}</tr>`,
    avgRow(
      "Usually receives",
      "this team's average received, excluding this game",
      (x) => meanWithout(tallies.received.get(x.teamId), x.score?.total),
    ),
    avgRow(
      "Opponent usually gives",
      "the average the opponent gives, excluding this game",
      (x) => meanWithout(tallies.given.get(x.from), x.score?.total),
    ),
  ];

  const missing = owesSpirit(g)
    ? sides.filter((x) => !x.score).map((x) =>
      `<p class="text-warning-emphasis small mb-2">
        <i class="bi bi-exclamation-triangle me-1"></i>${esc(x.giver.name)} hasn't submitted a score for ${
        esc(x.team.name)
      }.
      </p>`
    )
    : [];
  const comments = sides.flatMap((x) =>
    x.score?.comment ? [commentBlock(`${x.giver.name} on ${x.team.name}`, x.score.comment)] : []
  );

  const division = names.divisionRef(g.divisionId);
  const pitch = /^\d+$/.test(g.pitch) ? `Pitch ${g.pitch}` : g.pitch;
  return {
    title: formatGameTime(g.time) || "Game",
    meta: [esc(pitch), detailButton(esc(division.name), `division-${g.divisionId}`)].filter(Boolean).join(" · "),
    body: `
      ${scoreboard}
      ${
      g.forfeit && sides.every((x) => !x.score)
        ? `<p class="text-body-secondary fst-italic">Forfeited, so no spirit scores are owed.</p>`
        : detailTable(head, rows)
    }
      ${missing.join("")}
      ${
      ctx.hasComments
        ? `${detailHeading("Comments")}${comments.join("") || `<p class="text-body-secondary fst-italic">None.</p>`}`
        : ""
    }
    `,
    footer: liveButton("Game on Live!", names.gameHref(g)),
  };
}

/**
 * One team: its averages received and given, every completed game, each
 * opening that game's page, and the comments it received and gave
 * brackets as on the Games tab, a score's is what its giver usually gives,
 * leaving this game out
 * @param {DetailContext} ctx
 * @param {number} teamId
 * @returns {DetailView | null} null for a team that isn't known
 */
function teamDetail(ctx, teamId) {
  const { names, tallies, t } = ctx;
  const cats = ctx.s.spiritCategories;
  const division = ctx.s.divisions.find((d) => d.teams.some((x) => x.id === teamId));
  if (!division) return null;
  const team = names.teamRef(teamId);
  const received = ctx.scores.filter((x) => x.teamId === teamId);
  const given = ctx.scores.filter((x) => x.fromTeamId === teamId);
  const avgReceived = averageSpirit(received, cats);
  const avgGiven = averageSpirit(given, cats);

  const averages = detailTable(
    `<tr><th scope="col">Average</th><th scope="col" class="text-center">Received</th>
      <th scope="col" class="text-center">Given</th></tr>`,
    [
      `<tr class="fw-bold">
        <th scope="row">Total</th>
        <td class="${cellClass(avgReceived.total < t.teamLow, avgReceived.total > t.teamHigh)}">${
        fmt(avgReceived.total)
      }</td>
        <td class="text-center">${fmt(avgGiven.total)}</td>
      </tr>`,
      ...cats.map((c) => `
        <tr>
          <th scope="row" class="fw-normal" title="${esc(`${c.min}-${c.max}`)}">${esc(c.label)}</th>
          <td class="text-center">${fmt(avgReceived.categories[c.key])}</td>
          <td class="text-center">${fmt(avgGiven.categories[c.key])}</td>
        </tr>
      `),
    ],
  );

  // every completed game it played, scored or not, then any scored game the
  // schedule doesn't list
  const played = [...ctx.games.values()]
    .filter((g) => g.completed && (g.homeTeamId === teamId || g.visitorTeamId === teamId))
    .map((g) => g.gameId);
  const gameIds = [...new Set([...played, ...[...received, ...given].map((x) => x.gameId)])];
  const games = gameIds
    .map((gameId) => {
      const g = ctx.games.get(gameId);
      const r = tallies.scoreFor(gameId, teamId);
      const opponent = g
        ? (g.homeTeamId === teamId ? g.visitorTeamId : g.homeTeamId)
        : r?.fromTeamId ?? given.find((x) => x.gameId === gameId)?.teamId ?? 0;
      const gv = tallies.scoreFor(gameId, opponent);
      return { gameId, g, time: g?.time ?? r?.time ?? gv?.time ?? "", opponent, r, gv };
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.gameId - b.gameId)
    .map(({ gameId, g, time, opponent, r, gv }) => {
      const opp = names.teamRef(opponent);
      const flagged = [r, gv].some((x) => x && flagComment(x.comment).length);
      const commented = flagged
        ? `<i class="bi bi-chat-left-text-fill ms-1 text-danger" title="has a flagged comment"></i>`
        : r?.comment || gv?.comment
        ? `<i class="bi bi-chat-left-text ms-1 text-body-secondary" title="has comments"></i>`
        : "";
      return `
        <tr ${detailAttrs(`game-${gameId}`)}>
          <td class="text-nowrap">${esc(shortGameTime(time))}</td>
          <td title="${esc(opp.name)}">${responsive(opp.name, opp.short, "md")}${commented}</td>
          <td class="text-nowrap">${esc(result(g, teamId))}</td>
          ${flaggedTotalCell(ctx, r, meanWithout(tallies.given.get(opponent), r?.total))}
          ${flaggedTotalCell(ctx, gv, meanWithout(tallies.given.get(teamId), gv?.total))}
        </tr>
      `;
    });
  const gameTable = detailTable(
    `<tr>
      <th scope="col">Time</th>
      <th scope="col">Opponent</th>
      <th scope="col">Score</th>
      <th scope="col" class="text-center"
        title="what this team was given, and the average its opponent gives, excluding this game">Received</th>
      <th scope="col" class="text-center"
        title="what this team gave, and the average it gives, excluding this game">Given</th>
    </tr>`,
    games,
  );

  /**
   * @param {SpiritScore[]} list
   * @param {(x: SpiritScore) => number} other  the team on the other end of each comment
   * @param {string} heading
   * @returns {string} an HTML snippet
   */
  const commentSection = (list, other, heading) => {
    const blocks = list
      .filter((x) => x.comment)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((x) => commentBlock(`${names.teamRef(other(x)).name}, ${formatGameTime(x.time)}`, x.comment));
    return `${detailHeading(heading)}${blocks.join("") || `<p class="text-body-secondary fst-italic">None.</p>`}`;
  };

  return {
    title: team.name,
    meta: `${detailButton(esc(division.name), `division-${division.id}`)} · ${avgReceived.games} ${
      avgReceived.games === 1 ? "game" : "games"
    } scored`,
    body: `
      ${averages}
      ${detailHeading("Games")}
      ${games.length ? gameTable : `<p class="text-body-secondary fst-italic">None yet.</p>`}
      ${
      ctx.hasComments
        ? commentSection(received, (x) => x.fromTeamId, "Comments received")
          + commentSection(given, (x) => x.teamId, "Comments given")
        : ""
    }
    `,
    footer: liveButton("Team spirit on Live!", team.href),
  };
}

/**
 * A division's average received, then each of its teams, each opening the
 * team's page, the whole tournament for 0
 * @param {DetailContext} ctx
 * @param {number} divisionId
 * @returns {DetailView | null} null for a division that isn't known
 */
function divisionDetail(ctx, divisionId) {
  const { t } = ctx;
  const cats = ctx.s.spiritCategories;
  const division = ctx.s.divisions.find((d) => d.id === divisionId);
  if (divisionId && !division) return null;
  const scores = division ? ctx.scores.filter((x) => x.divisionId === divisionId) : ctx.scores;
  const completed = [...ctx.games.values()].filter((g) => owesSpirit(g) && (!division || g.divisionId === divisionId));
  const owed = new Set(completed.map((g) => g.gameId));
  const avg = averageSpirit(scores, cats);
  const teamCount = division ? division.teams.length : ctx.s.teams;
  const averages = detailTable(
    `<tr><th scope="col">Category</th><th scope="col" class="text-center">Average received</th></tr>`,
    [
      `<tr class="fw-bold"><th scope="row">Total</th><td class="text-center">${fmt(avg.total)}</td></tr>`,
      ...cats.map((c) => `
        <tr>
          <th scope="row" class="fw-normal" title="${esc(`${c.min}-${c.max}`)}">${esc(c.label)}</th>
          <td class="text-center">${fmt(avg.categories[c.key])}</td>
        </tr>
      `),
    ],
  );

  // the whole tournament has too many teams to list usefully
  const teams = (division?.teams ?? [])
    .map((x) => ({
      team: x,
      received: averageSpirit(scores.filter((s) => s.teamId === x.id), cats),
      given: averageSpirit(ctx.scores.filter((s) => s.fromTeamId === x.id), cats),
    }))
    // teams with nothing in yet last
    .sort((a, b) => (a.received.total || Infinity) - (b.received.total || Infinity))
    .map(({ team, received, given }) => `
      <tr ${detailAttrs(`team-${team.id}`)}>
        <td title="${esc(team.name)}">${responsive(team.name, team.abbreviation, "md")}</td>
        <td class="text-center">${received.games}</td>
        <td class="${cellClass(received.total < t.teamLow, received.total > t.teamHigh)}">${fmt(received.total)}</td>
        <td class="text-center">${fmt(given.total)}</td>
      </tr>
    `);
  const teamTable = detailTable(
    `<tr>
      <th scope="col">Team</th>
      <th scope="col" class="text-center">Games</th>
      <th scope="col" class="text-center">Received</th>
      <th scope="col" class="text-center">Given</th>
    </tr>`,
    teams,
  );

  return {
    title: division ? division.name : "All tournament",
    meta: `${teamCount} teams · ${completed.length} games completed · ${
      scoresIn(scores.filter((x) => owed.has(x.gameId)).length, completed.length)
    } of scores in`,
    body: `
      ${averages}
      ${division ? `${detailHeading("Teams, lowest received first")}${teamTable}` : ""}
    `,
    footer: division ? liveButton("Division on Live!", ctx.names.divisionRef(divisionId).href) : "",
  };
}

/**
 * @param {DetailContext} ctx
 * @param {string} detail  "game-{id}", "team-{id}" or "division-{id}", the
 *   tournament as a whole being division-0
 * @returns {DetailView | null} null when it doesn't parse or isn't known
 */
function renderDetail(ctx, detail) {
  const m = /^(game|team|division)-(\d+)$/.exec(detail);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "game") return gameDetail(ctx, id);
  if (m[1] === "team") return teamDetail(ctx, id);
  return divisionDetail(ctx, id);
}

/**
 * The slice of Bootstrap's bundle this page uses, loaded by tournament.html
 * as a classic script, so it hangs off window
 * @typedef {{show(): void, hide(): void}} BootstrapModal
 * @typedef {{Modal: {getOrCreateInstance(el: Element): BootstrapModal}}} Bootstrap
 */

/**
 * Where the detail modal is in its own history, kept in history.state
 * @typedef {Object} DetailState
 * @property {string} detail
 * @property {number} depth  pages opened since the modal did, 1 for the first
 */

/**
 * The detail modal, a little browser over game, team and division pages:
 * any row or button with a data-detail opens one, as does a detail in the
 * URL, so a link opens straight onto it
 * every page opened is a history entry, so Back, in the modal or a phone's
 * own gesture, steps back through them, and closing steps back over them all
 * clicks on any other link, button or input are theirs, not the row's
 * @param {HTMLElement} container  the tabs and tables
 * @param {() => DetailContext} context  read when a page opens, for the current thresholds
 */
function enableDetail(container, context) {
  const bootstrap = /** @type {Bootstrap | undefined} */ (/** @type {any} */ (window).bootstrap);
  const el = document.getElementById("detail");
  const back = document.getElementById("detail-back");
  const title = document.getElementById("detail-title");
  const meta = document.getElementById("detail-meta");
  const body = document.getElementById("detail-body");
  const footer = document.getElementById("detail-footer");
  // without Bootstrap's script the tables still work, just without detail
  if (!bootstrap || !el || !back || !title || !meta || !body || !footer) return;
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  let open = false;
  // set while closing steps back over the modal's entries, so the popstate
  // that causes doesn't reopen it
  let closing = false;

  /** @returns {DetailState | null} */
  const state = () => (history.state?.detail ? history.state : null);

  /**
   * @param {string} detail
   * @returns {boolean} false when there was nothing to show
   */
  const fill = (detail) => {
    const view = renderDetail(context(), detail);
    if (!view) return false;
    title.textContent = view.title;
    meta.innerHTML = view.meta;
    body.innerHTML = view.body;
    footer.innerHTML = `${view.footer}
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;
    back.hidden = (state()?.depth ?? 0) < 2;
    body.scrollTop = 0;
    return true;
  };

  /** @param {string} detail */
  const show = (detail) => {
    const url = new URL(location.href);
    url.searchParams.set("detail", detail);
    /** @type {DetailState} */
    const next = { detail, depth: (open ? state()?.depth ?? 0 : 0) + 1 };
    history.pushState(next, "", url);
    if (!fill(detail)) {
      history.back();
      return;
    }
    open = true;
    modal.show();
  };

  el.addEventListener("hidden.bs.modal", () => {
    open = false;
    const depth = state()?.depth ?? 0;
    if (depth > 0) {
      closing = true;
      history.go(-depth);
      return;
    }
    // opened from a link, so there's nothing to step back over
    const url = new URL(location.href);
    url.searchParams.delete("detail");
    history.replaceState(null, "", url);
  });
  addEventListener("popstate", () => {
    const detail = new URLSearchParams(location.search).get("detail");
    if (closing) {
      closing = false;
      // back on the entry a link opened the modal from
      if (detail) {
        const url = new URL(location.href);
        url.searchParams.delete("detail");
        history.replaceState(null, "", url);
      }
      return;
    }
    if (detail && fill(detail)) {
      open = true;
      modal.show();
    } else if (open) {
      modal.hide();
    }
  });
  back.addEventListener("click", () => history.back());

  /**
   * @param {Event} e
   * @returns {string | null} the page the event asks for, if any
   */
  const target = (e) => {
    if (!(e.target instanceof Element)) return null;
    const opener = e.target.closest("[data-detail]");
    const control = e.target.closest("a, button, input");
    if (!(opener instanceof HTMLElement) || (control && control !== opener)) return null;
    return opener.dataset.detail ?? null;
  };
  for (const root of [container, el]) {
    root.addEventListener("click", (e) => {
      const detail = target(e);
      if (detail) show(detail);
    });
    root.addEventListener("keydown", (e) => {
      if (!(e instanceof KeyboardEvent) || e.key !== "Enter" || !(e.target instanceof HTMLTableRowElement)) return;
      const detail = target(e);
      if (detail) show(detail);
    });
  }

  const initial = new URLSearchParams(location.search).get("detail");
  if (initial && fill(initial)) {
    open = true;
    modal.show();
  }
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
 * @param {Tab[]} available  see tabsFor
 * @param {Tab} selected
 * @param {Source} source
 * @returns {string} an HTML snippet
 */
function renderSpiritCard(s, scores, games, t, available, selected, source) {
  const names = namesFor(s, source);
  const buttons = tabs
    .filter((tab) => available.includes(tab.id))
    .map((tab) =>
      `<button type="button" data-tab="${tab.id}" aria-pressed="${tab.id === selected}"
        class="btn btn-sm ${tab.id === selected ? "btn-primary" : "btn-secondary"}">${
        responsive(tab.label, tab.short, "md")
      }</button>`
    )
    .join("");
  /** @param {Tab} tab */
  const hidden = (tab) => (tab === selected ? "" : "hidden");
  const body = `
    <form id="thresholds">
      <div class="tab-bar mb-3">${buttons}</div>
      <div data-pane="overview" ${hidden("overview")}>
        <p class="text-body-secondary">
          Average spirit score received per game. Each score counts once, for
          the team it was given to.
        </p>
        ${overviewTable(s, scores, games)}
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
        ${missingTable(games, names, spiritTallies(scores))}
      </div>
      ${
    available.includes("comments")
      ? `<div data-pane="comments" ${hidden("comments")}>
          <p class="text-body-secondary">
            Every spirit score that came with a comment, earliest first.
            Comments mentioning dangerous play, cheating or harassment are
            flagged red.
            Select a row for the full score.
          </p>
          ${commentTable(scores, names)}
          ${flagKey()}
        </div>`
      : ""
  }
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
  let t = readThresholds(params);
  const available = tabsFor(scores);
  container.innerHTML = renderSpiritCard(s, scores, games, t, available, readTab(params, available), source);
  const form = /** @type {HTMLFormElement} */ (container.querySelector("#thresholds"));
  /** @type {Map<string, SortState>} */
  const sorts = new Map();
  enableSorting(container, sorts);
  fillTables(container, s, scores, t, sorts, source);

  const names = namesFor(s, source);
  const tallies = spiritTallies(scores);
  const byId = new Map(games.map((g) => [g.gameId, g]));
  const hasComments = available.includes("comments");
  enableDetail(container, () => ({ s, scores, games: byId, names, tallies, t, hasComments }));

  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest("[data-tab]") : null;
    if (!(button instanceof HTMLElement)) return;
    const selected = readTab(new URLSearchParams({ tab: button.dataset.tab ?? "" }), available);
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
    t = readThresholds(params);
    const url = new URL(location.href);
    writeThresholds(url, t);
    history.replaceState(null, "", url);
    fillTables(container, s, scores, t, sorts, source);
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
