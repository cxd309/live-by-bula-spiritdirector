// @ts-check

// Package sortable: click-to-sort table headers, like Live!'s data tables
// works on the rendered rows, reading each cell's text, so any table can opt
// in with markup alone:
// - <table data-sort-key="…">, a name to remember its sort under
// - a <button class="sort-button"> in each sortable <th>, plus a
//   <span class="sort-indicator"> for the arrow
// - data-sort-type="number" on a <th> to sort that column numerically
// - data-pinned on a <tr> to keep it above the sorted rows
// - data-sort on a <td> to sort by that instead of its text, for display
//   formats that don't sort, like "Sun 12 Jul - 10:20"

/**
 * @typedef {Object} SortState
 * @property {number} column  the th's cellIndex
 * @property {"asc" | "desc"} dir
 */

/** @type {Record<SortState["dir"], string>} */
const arrows = { asc: "▲", desc: "▼" };

/**
 * @param {HTMLTableRowElement} row
 * @param {number} column
 * @param {boolean} numeric
 * @returns {string | number} numbers that don't parse ("–") sort lowest
 */
function sortValue(row, column, numeric) {
  const cell = row.cells[column];
  const text = cell?.dataset.sort ?? cell?.textContent?.trim() ?? "";
  if (!numeric) return text;
  const n = parseFloat(text);
  return Number.isNaN(n) ? -Infinity : n;
}

/**
 * Reorders a table's body rows and marks the sorted header
 * the sort is stable, so ties keep their previous order
 * @param {HTMLTableElement} table
 * @param {SortState} state
 */
export function sortTable(table, { column, dir }) {
  const header = table.tHead?.rows[0];
  const tbody = table.tBodies[0];
  const th = header?.cells[column];
  if (!header || !tbody || !th) return;
  const numeric = th.dataset.sortType === "number";
  const rows = [...tbody.rows];
  const pinned = rows.filter((r) => r.dataset.pinned !== undefined);
  const rest = rows
    .filter((r) => r.dataset.pinned === undefined)
    .sort((a, b) => {
      const x = sortValue(a, column, numeric);
      const y = sortValue(b, column, numeric);
      const c = x === y ? 0 : x < y ? -1 : 1;
      return dir === "asc" ? c : -c;
    });
  tbody.append(...pinned, ...rest);

  for (const cell of header.cells) {
    cell.removeAttribute("aria-sort");
    const arrow = cell.querySelector(".sort-indicator");
    if (arrow) arrow.textContent = "";
  }
  th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
  const arrow = th.querySelector(".sort-indicator");
  if (arrow) arrow.textContent = arrows[dir];
}

/**
 * Sorts on header clicks anywhere under root, remembering each table's
 * sort in state by its data-sort-key
 * first click sorts numbers highest first and text A-Z, as Live! does, and
 * each click after that flips it
 * @param {HTMLElement} root
 * @param {Map<string, SortState>} state
 */
export function enableSorting(root, state) {
  root.addEventListener("click", (e) => {
    const button = e.target instanceof Element ? e.target.closest(".sort-button") : null;
    const th = button?.closest("th");
    const table = th?.closest("table");
    if (!th || !table?.dataset.sortKey) return;
    const previous = state.get(table.dataset.sortKey);
    /** @type {SortState["dir"]} */
    const dir = previous?.column === th.cellIndex
      ? previous.dir === "asc" ? "desc" : "asc"
      : th.dataset.sortType === "number"
      ? "desc"
      : "asc";
    const next = { column: th.cellIndex, dir };
    state.set(table.dataset.sortKey, next);
    sortTable(table, next);
  });
}

/**
 * Re-applies remembered sorts, for tables that have just been redrawn
 * @param {HTMLElement} root
 * @param {Map<string, SortState>} state
 */
export function restoreSorts(root, state) {
  for (const table of root.querySelectorAll("table[data-sort-key]")) {
    const saved = state.get(/** @type {HTMLElement} */ (table).dataset.sortKey ?? "");
    if (saved) sortTable(/** @type {HTMLTableElement} */ (table), saved);
  }
}
