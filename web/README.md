# Code Dojo v2 — web concept

A live, interactive redesign concept of the Code Dojo Chrome extension. Same
economy, new face: 2 XP/min with stretch half-rate, note word caps, strict
local grading, requeue, freeze promises. Nothing here talks to a server —
state saves to `localStorage` under `code-dojo-v2-state`.

## Run it

    cd web
    npm install
    npm run dev      # opens on http://localhost:5173

## Build (single self-contained file)

    npm run build    # → dist/index.html, everything inlined

The six tabs: **Today** (two-lap goal ring, quests, popup preview with live
data), **Focus** (timer + heartbeat banking + struggle box), **Quiz** (strict
grading, 3-paid cap, requeue), **Notes** (live cap preview, 4-check review,
revision delta), **Progress** (leagues, weeks, 28-day grid, settings), and
**Improve Plan** (20 file-by-file upgrades for the real extension).

Reset demo data lives in Progress → Settings & data.
