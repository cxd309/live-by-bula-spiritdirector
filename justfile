# ── Check Dependencies: print version for all cli's required ─────────────────
check-deps:
    dprint --version
    simple-file-server --version
    @echo "If you can read this and nothing is obviously wrong"
    @echo "All dependencies are probably found"

# ── Format: dprint ─────────────────────────────────────────
fmt:
    dprint fmt

# ── Serve: emulate GitHub Pages locally at /live-by-bula-spiritdirector/ ──────
serve:
    @echo "==> http://localhost:8080/live-by-bula-spiritdirector/"
    simple-file-server ./docs 8080 live-by-bula-spiritdirector

# ── Bump assets: move docs/assets/vN to vN+1 so browsers fetch fresh JS/CSS ──
bump-assets:
    #!/usr/bin/env bash
    set -euo pipefail
    current=$(ls docs/assets | grep -E '^v[0-9]+$' | sort -V | tail -1)
    next="v$(( ${current#v} + 1 ))"
    git mv "docs/assets/$current" "docs/assets/$next"
    perl -pi -e "s#assets/$current/#assets/$next/#g" docs/*.html jsconfig.json README.md
    echo "==> assets $current -> $next"
