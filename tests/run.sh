#!/usr/bin/env bash
# Run the Code Dojo suites in headless Chromium. No Node.js needed.
# Usage: bash tests/run.sh   (requires: chromium or google-chrome, python3)
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8813}"
CHROMIUM="${CHROMIUM:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || command -v google-chrome-stable || true)}"
if [ -z "$CHROMIUM" ]; then
  echo "No Chromium/Chrome found. Install one, or run each suite with: node tests/ai.test.js" >&2
  exit 1
fi

python3 - "$PORT" <<'PY' &
import functools, http.server, os, sys
ROOT = os.getcwd()
PORT = int(sys.argv[1])

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT))
srv.serve_forever()
PY
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

OUT="$("$CHROMIUM" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=30000 \
  --dump-dom "http://127.0.0.1:$PORT/tests/run.html" 2>/dev/null || true)"

RESULTS="$(printf '%s' "$OUT" | python3 -c '
import sys, html, re
raw = sys.stdin.read()
m = re.search(r"<pre id=\"results\">(.*?)</pre>", raw, re.S)
print(html.unescape(m.group(1)) if m else "no results rendered (page failed to run)")
')"
printf '%s\n' "$RESULTS"

# the harness prints "ALL PASS" as its own last line on success; match that
# line, not the same words appearing somewhere in the page source
if printf '%s' "$RESULTS" | grep -qx "ALL PASS"; then
  exit 0
fi
exit 1
