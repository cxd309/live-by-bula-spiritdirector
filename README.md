# Live! by BULA Spirit Director

Additional information for spirit directors, drawn from the [Live! by BULA](https://beachultimate.org/livebybula/) API using UltiOrganizer data.

Unofficial, not endorsed by BULA, WFDF, EUF or UltiOrganizer.

## How this works

A static site on GitHub Pages (`docs/`), Bootstrap plus plain JavaScript modules, no build step. Everything is fetched from the browser:

- **During an event** from the tournament's live deployment, discovered through its `_heartbeat.json`
- **After an event** from the [ultimate-tournament-results](https://github.com/cxd309/ultimate-tournament-results) archive, which serves the same files. Live deployments delete their static files, or disappear entirely, once an event ends

The live deployment is always tried first. If it fails, the site falls back to the archive, and hovering the Archive badge shows why live wasn't used.

Tournaments are listed in [`docs/tournaments.yaml`](docs/tournaments.yaml). Leave `archive` empty while an event is running, then set it once UTR has archived the event.

### Versioning

Response shapes differ between Live! versions (see [live-by-bula-openapi](https://github.com/cxd309/live-by-bula-openapi)). This follows the same approach as `ultimate-tournament-results (UTR)`: generic code where possible, split into versioned modules where the shapes differ. Directory names are the Live! version, zero-padded (`1.9.14` -> `v01_09_14`), so they line up with UTR's Go packages.

Pages import only from `model.js`, `source.js` and `versions.js`, never from a `vXX_YY_ZZ` directly. Supporting a new Live! version means adding an adapter directory and registering it in `versions.js`.

| Live! by BULA app version | Adapter     |
| ------------------------- | ----------- |
| 1.9.14 - 1.9.17           | `v01_09_14` |
| 3.0.6                     | `v03_00_06` |

### Project structure

| Path                       | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `docs/`                    | GitHub Pages web root                                                   |
| `docs/tournaments.yaml`    | the tournaments this site interfaces                                    |
| `docs/js/theme.js`         | light/dark toggle, shared by every page                                 |
| `docs/js/index.js`         | homepage specific js                                                    |
| `docs/js/live/model.js`    | version-independent JSDoc types that every adapter returns              |
| `docs/js/live/source.js`   | finding (heartbeat or archive) and fetching a tournament's JSON files   |
| `docs/js/live/versions.js` | registry mapping a version key to its adapter, like UTR's `liveversion` |
| `docs/js/live/vXX_YY_ZZ/`  | one adapter per Live! response shape                                    |

### Types

JavaScript with JSDoc and `// @ts-check`. [`jsconfig.json`](jsconfig.json) turns on strict checking in VS Code's built-in TypeScript, and nothing needs installing.

## Dependencies

| Tool                                                               | Used for                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [just](https://github.com/casey/just)                              | running the recipes below                                                          |
| [dprint](https://dprint.dev/)                                      | `just fmt`, formats js/html/css/markdown/json                                      |
| [simple-file-server](https://github.com/cxd309/simple-file-server) | `just serve`, install via `go install github.com/cxd309/simple-file-server@latest` |

## Development usage

```
just check-deps   # confirm required CLI tools are installed
just serve        # http://localhost:8080/live-by-bula-spiritdirector/
just fmt          # dprint
```
