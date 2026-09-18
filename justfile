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
