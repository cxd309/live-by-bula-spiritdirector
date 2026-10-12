# Live! by BULA Spirit Director

Additional information for spirit directors, drawn from the [Live! by BULA](https://beachultimate.org/livebybula/) API using UltiOrganizer data.

Unofficial, not endorsed by BULA, WFDF, EUF or UltiOrganizer.

## Pages

### Homepage

One row per tournament in [`docs/tournaments.yaml`](docs/tournaments.yaml): dates, location, Live/Archive badge for where the data is coming from, and the number of divisions and teams.

### Tournament

`tournament.html?t={slug}`, default to the most recent tournament.

Tabs for different feature of the tournamnet to follow as an SD:

- **Overview** average spirit across the tournament and per division
- **Teams** highlight teams with high or low average scores
- **Games** highlight games with high or low average or category specific scores
- **Missing** highlight teams that have not submitted spirit scores
- **Comments** All spirit comments, highlight concerning keywords (only shown on tournaments that publish comments)

Issues are highlighted red and highlights green in the table cell that resulted in them being highlighted. Selecting a row opens a detail view.

All tables can be sorted using the column headers.

#### Games

A row per game with a high or low total score or the minimum or maximum score in any category.

Next to scores are bracketted scores which are intended to give additional context to each score. For example, a score given includes the average score given across the tournament by that team not including the game. So the SD can see the difference between a 7 from a team that normally gives an 8 and one that normally gives a 12.

Bracket averages never include the scores for this game.

| Column       | Holds                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Time         | Game start time                                                                                                      |
| Division     |                                                                                                                      |
| Team         | The receving team. Bracket: the average score receieved across this tournament not including this game               |
| Received     | Total score received. Bracket: the average score giving team has given across the tournament not including this game |
| Given        | Total score given. Bracket: average score giving team has given across the tournament not including this game        |
| From         | The giving team. Bracket: the average score recieved across this tournament not including this game                  |
| Rules … Comm | breakdown of score by category                                                                                       |

#### Missing

All missing spirit scores. This is only accurate on tournaments where the API exposes individual spirit scores. 3.x.x only exposes spirit scores when both scores for a game have been submitted.

| Column        | Holds                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| Time          | Game start time                                                                     |
| Pitch         |                                                                                     |
| Division      |                                                                                     |
| Not submitted | the team that hasn't submitted a score                                              |
| For           | the team the missing score is for                                                   |
| Received      | The paired other score for this game. Where it also is missing "-" is shown instead |

#### Comments

All the comments in the tournament. Keywords for Dangerous Play, Harrassment or Cheating are used to highlight comments. Sorting by Comment shows these at the top of the table.

| Column   | Holds                                                   |
| -------- | ------------------------------------------------------- |
| Time     | Game start time                                         |
| Division |                                                         |
| From     | Team that wrote the comment                             |
| For      | The team the comment is for/about                       |
| Total    | The total spirit score that goes along with the comment |
| Comment  | The comment including highlighting any keywords         |

Comments are flagged with keyword groups, a red badge for each group a comment mentions and the words themselves marked. Each word matches the start of a word in any case, so `cheat` also catches "cheating" and `danger` "dangerous", and the list only needs the stems. Sorting by Comment puts flagged ones first, and the words are listed under the table. The groups are `commentFlags` in [`spirit.js`](docs/assets/v4/js/spirit.js):

| Flag           | Words                                                    |
| -------------- | -------------------------------------------------------- |
| Dangerous play | danger, reckless, unsafe                                 |
| Cheating       | cheat, intentional                                       |
| Harassment     | abuse, abusive, swear, unwarranted, harass, insult, rude |

## How this works

A static site on GitHub Pages (`docs/`), Bootstrap plus plain JavaScript modules. Everything is fetched from the browser:

- **During an event** from the tournament's live deployment, discovered through its `_heartbeat.json`
- **After an event** from the [ultimate-tournament-results](https://github.com/cxd309/ultimate-tournament-results) archive, which serves the same files. Live deployments delete their static files, or disappear entirely, once an event ends

The live deployment is always tried first. If it fails, the site falls back to the archive, and hovering the Archive badge shows why live wasn't used. A few things make that more than a single fetch:

- **Hosts get reused** for the next edition of an event (`eucf.ultimatefederation.eu` moved from EUCF 2025 to 2026), so a heartbeat reporting a different season id counts as live being unavailable
- **Live! only writes a static file the first time it is asked for**, through a dynamic route with no CORS headers. The server also sends no CORS headers on a missing file, so the browser sees it as a network error rather than a 404. When that happens on a live source the site fires the dynamic route with `mode: "no-cors"`, which still makes the server write the file, then fetches the static file again
- **Live! only rewrites a static file when it is asked for again after it expires.** During an event most files live for two minutes, but a team's file can sit hours out of date if nobody has opened that team on Live!. So whenever a live file's `meta.expires_timestamp` has passed, the site fires the dynamic route the same way, then fetches the static file again. Otherwise scores submitted since the last rewrite would still show as missing
- **That rewrite is slow**, most of a second of PHP per file, so after a quiet spell it would cost one per team (WUCC's 136 teams took about 13s). An expired team file is therefore only rewritten when that team has a completed game whose score for it isn't in the file yet. A team with every score in keeps its file as it is, so a finished event loads in a couple of seconds and a running one only refreshes the teams still owed a score. The catch is that an edit to a score already in only shows once that file is rewritten for some other reason
- **Each file is fetched once per page load**, however many parts of the page need it
- **Spirit scores** come from each team's `_teams_{teamId}.json` (`spiritreceived`), fetched eight at a time so a live server isn't flooded. Each score counts once, for the team it was given to. On 3.0 only scores Live! itself would show (complete and visible) are counted
- **Spirit comments** come from the same `spiritreceived` rows. They're blanked unless the event turns spirit comments on, so a blank one can mean either none was written or they're hidden. EUF's events publish them, WFDF's so far don't
- **Games** come from `_games.json`, with each game's division from its pool, its pitch from `_reference.json`'s `reservations`, and its result from `homescore` and `visitorscore`

### Tournaments

Listed in [`docs/tournaments.yaml`](docs/tournaments.yaml), newest first.

| Field        | Description                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------- |
| `slug`       | season id, used verbatim in filenames (casing varies)                                         |
| `event`      | display name                                                                                  |
| `start_date` | `YYYY-MM-DD`, shown until the tournament's own dates load                                     |
| `location`   |                                                                                               |
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
