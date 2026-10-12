# Live! by BULA Spirit Director

Additional information for spirit directors, drawn from the [Live! by BULA](https://beachultimate.org/livebybula/) API using UltiOrganizer data.

Unofficial, not endorsed by BULA, WFDF, EUF or UltiOrganizer.

## Pages

### Homepage

One row per tournament in [`docs/tournaments.yaml`](docs/tournaments.yaml): dates, location, Live!'s season status with a Live/Archive badge for where the data is coming from, and the number of divisions and teams. The status links to the tournament's own Live! homepage, and Open goes to its page here.

### Tournament

`tournament.html?t={slug}`, the most recent tournament when `t` is left off, four tabs in the style of Live!'s spirit page:

- **Overview** average spirit received per game, for the whole tournament then each division. Games counts completed games and Scores the percentage of their spirit scores that are in, two per game
- **Teams** teams whose average received total is below or above the thresholds
- **Games** individual scores with a total below or above the thresholds, or any category at its minimum or maximum
- **Missing** completed games still waiting on a spirit score

Issues are coloured red and highlights green, on the cells that put the row there.

The Games tab is one row per score received, with the reply from the same game beside it, so a harsh giver reads differently from a struggling team:

| Column       | Holds                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Time         | game start, linking to that game on Live!                                                       |
| Division     | the game's division, linking to its page on Live!                                               |
| Team         | the team given this score, and its average received                                             |
| Received     | this score, and the average its opponent gives                                                  |
| Given        | what this team gave back in the same game, coloured when that score is flagged in its own right |
| From         | the team that gave this score, and its average received                                         |
| Rules … Comm | this score by category                                                                          |
| Open         | that game on Live!                                                                              |

Every bracketed average leaves that game out, so a score is never part of its own comparison, and is left off when there is no other game to average. A coloured Given cell means that score has a row of its own with the detail. Team and From link to that team's spirit tab on Live!, and Division, here and in the Overview, links to its Live! page. Archived tournaments have no live site to link to, so they show no links and no Open button.

The Missing tab is one row per team that hasn't submitted its score for a completed game:

| Column        | Holds                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Time          | game start, linking to that game on Live!                                                   |
| Pitch         | the field it was played on                                                                  |
| Division      | the game's division                                                                         |
| Not submitted | the team that hasn't submitted                                                              |
| For           | the team the score is for                                                                   |
| Received      | the score the Not submitted team was given in the same game, a dash when that's missing too |
| Open          | that game on Live!                                                                          |

A game counts as completed when Live! says so. On 1.9 that only happens once someone scores, so a finished 0-0 or forfeit never shows up as missing.

Every column sorts by clicking its header, marked by a filter icon that becomes a sort arrow. Spirit categories are always shown as shorthand (Rules, Cont, Fair, Att, Comm).

The view is kept in the URL, so a link opens exactly what was on screen. Defaults are left out:

| Parameter                | Default     | Meaning                                         |
| ------------------------ | ----------- | ----------------------------------------------- |
| `t`                      | most recent | tournament slug                                 |
| `tab`                    | `overview`  | `overview`, `teams`, `games` or `missing`       |
| `team_low` / `team_high` | `9` / `11`  | team average received below / above is flagged  |
| `game_low` / `game_high` | `7` / `13`  | a single score's total below / above is flagged |
| `theme`                  | system      | `light` or `dark`                               |

## How this works

A static site on GitHub Pages (`docs/`), Bootstrap plus plain JavaScript modules. Everything is fetched from the browser:

- **During an event** from the tournament's live deployment, discovered through its `_heartbeat.json`
- **After an event** from the [ultimate-tournament-results](https://github.com/cxd309/ultimate-tournament-results) archive, which serves the same files. Live deployments delete their static files, or disappear entirely, once an event ends

The live deployment is always tried first. If it fails, the site falls back to the archive, and hovering the Archive badge shows why live wasn't used. A few things make that more than a single fetch:

- **Hosts get reused** for the next edition of an event (`eucf.ultimatefederation.eu` moved from EUCF 2025 to 2026), so a heartbeat reporting a different season id counts as live being unavailable
- **Live! only writes a static file the first time it is asked for**, through a dynamic route with no CORS headers. The server also sends no CORS headers on a missing file, so the browser sees it as a network error rather than a 404. When that happens on a live source the site fires the dynamic route with `mode: "no-cors"`, which still makes the server write the file, then fetches the static file again
- **Live! only rewrites a static file when it is asked for again after it expires.** During an event most files live for two minutes, but a team's file can sit hours out of date if nobody has opened that team on Live!. So whenever a live file's `meta.expires_timestamp` has passed, the site fires the dynamic route the same way, then fetches the static file again. Otherwise scores submitted since the last rewrite would still show as missing
- **Spirit scores** come from each team's `_teams_{teamId}.json` (`spiritreceived`), fetched eight at a time so a live server isn't flooded. Each score counts once, for the team it was given to. On 3.0 only scores Live! itself would show (complete and visible) are counted
- **Games** come from `_games.json`, with each game's division from its pool and its pitch from `_reference.json`'s `reservations`

### Tournaments

Listed in [`docs/tournaments.yaml`](docs/tournaments.yaml), newest first.

| Field        | Description                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------- |
| `slug`       | season id, used verbatim in filenames (casing varies)                                         |
| `event`      | display name                                                                                  |
| `start_date` | `YYYY-MM-DD`, shown until the tournament's own dates load                                     |
| `location`   | where it's played, empty falls back to the live heartbeat's (UTR archives don't carry it)     |
| `host`       | live deployment, host plus any path prefix, empty for archive only                            |
| `version`    | Live! version, any form `versions.js` accepts (`v1.9.14`, `3.0.6`)                            |
| `archive`    | ultimate-tournament-results archive URL, empty while the event is running until it's archived |
| `notes`      | free text                                                                                     |

For a new event add it with `host` and no `archive`, then set `archive` once UTR has archived it.

### Versioning

Response shapes differ between Live! versions (see [live-by-bula-openapi](https://github.com/cxd309/live-by-bula-openapi)). This follows the same approach as `ultimate-tournament-results (UTR)`: generic code where possible, split into versioned modules where the shapes differ. Directory names are the Live! version, zero-padded (`1.9.14` -> `v01_09_14`), so they line up with UTR's Go packages.

Pages import only from `model.js`, `source.js` and `versions.js`, never from a `vXX_YY_ZZ` directly. Supporting a new Live! version means adding an adapter directory and registering it in `versions.js`.

| Live! by BULA app version | Adapter     |
| ------------------------- | ----------- |
| 1.9.14 - 1.9.17           | `v01_09_14` |
| 3.0.6                     | `v03_00_06` |

### Project structure

| Path                                  | Description                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `docs/`                               | GitHub Pages web root                                                         |
| `docs/tournaments.yaml`               | the tournaments this site interfaces                                          |
| `docs/index.html`                     | homepage                                                                      |
| `docs/tournament.html`                | tournament page                                                               |
| `docs/assets/v3/`                     | the pages' JavaScript and CSS, in a versioned directory, see Cache busting    |
| `docs/assets/v3/index.css`            | the little styling on top of Bootstrap, shared by both pages                  |
| `docs/assets/v3/js/theme.js`          | light/dark toggle, shared by every page                                       |
| `docs/assets/v3/js/page.js`           | shared page helpers: the tournament list, escaping, badges, shorthands, dates |
| `docs/assets/v3/js/index.js`          | homepage specific js                                                          |
| `docs/assets/v3/js/tournament.js`     | tournament page specific js                                                   |
| `docs/assets/v3/js/spirit.js`         | averages, thresholds and issue/highlight rules over spirit scores             |
| `docs/assets/v3/js/sortable.js`       | click-to-sort table headers                                                   |
| `docs/assets/v3/js/live/model.js`     | version-independent JSDoc types that every adapter returns                    |
| `docs/assets/v3/js/live/source.js`    | finding (heartbeat or archive) and fetching a tournament's JSON files         |
| `docs/assets/v3/js/live/versions.js`  | registry mapping a version key to its adapter, like UTR's `liveversion`       |
| `docs/assets/v3/js/live/reference.js` | the parts of `_reference.json` shaped the same on every version               |
| `docs/assets/v3/js/live/games.js`     | the parts of `_games.json` shaped the same on every version                   |
| `docs/assets/v3/js/live/links.js`     | URLs back into a deployment's own Live! pages, its routes and slug rule       |
| `docs/assets/v3/js/live/vXX_YY_ZZ/`   | one adapter per Live! response shape                                          |

### Cache busting

GitHub Pages lets browsers cache files for up to 10 minutes, and some hold JavaScript modules longer, so a returning visitor can run old code against new HTML. Every script and stylesheet therefore lives under `docs/assets/v{N}/`, and the pages link to that directory by name. When a release changes any of them, bump the version:

```bash
just bump-assets
```

This renames `v{N}` to `v{N+1}` and updates the links in the HTML pages and `jsconfig.json`. A browser that loads the new HTML then requests files at paths it has never seen. Imports inside the JavaScript are relative, so they follow the directory without any changes. `tournaments.yaml` stays outside it, because it's data and is always fetched with `no-cache`.

### Types

JavaScript with JSDoc and `// @ts-check`. [`jsconfig.json`](jsconfig.json) turns on strict checking in VS Code's built-in TypeScript, and nothing needs installing.

## Dependencies

| Tool                                                               | Used for                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [just](https://github.com/casey/just)                              | running the recipes below                                                          |
| [dprint](https://dprint.dev/)                                      | `just fmt`, formats js/html/css/markdown/json/yaml                                 |
| [simple-file-server](https://github.com/cxd309/simple-file-server) | `just serve`, install via `go install github.com/cxd309/simple-file-server@latest` |

## Development usage

```
just check-deps   # confirm required CLI tools are installed
just serve        # http://localhost:8080/live-by-bula-spiritdirector/
just fmt          # dprint
```
