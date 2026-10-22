# Changelog

All notable changes to Code Dojo. Releases before v1.11 are summarized in
the version block at the top of `README.md`; this file starts with the
release that completed and verified them.

## v1.17.0

One focus surface. The small focus-timer page is gone: the **big screen's
focus room now runs the session itself**, and the popup's **Start focus
session** opens it directly at `#focus`.

### Removed

- `practice.html`, `practice.css`, `practice.js` - the small-screen focus
  timer. Its whole loop moved into the big screen's focus room, so there is
  still exactly one focus experience to keep.

### Changed

- `screen/` (rebuilt from the `code-dojo-bigscreen` source via
  `npm run build:ext`): the focus room owns the countdown engine -
  - **start / pause / reset / length picks / keyboard shortcuts** (Space,
    R, 1-3) and the **live tab title** run on the big screen itself;
  - the running session is saved to `chrome.storage.local.focusSession` as
    it goes, so **a reload resumes it**; a gap of **20+ minutes voids the
    round** (no XP), and a closed tab always comes back **paused** -
    nothing is ever earned silently;
  - the worker protocol is unchanged: a **quiet 0.5-minute heartbeat every
    30 seconds** of a running round, then **one rated award at completion**
    (2 XP per minute up to the stretch, `focus: 1` on the day), plus the
    **"what couldn't you do today?"** line, which still rides
    `saveStruggle` into tomorrow's quiz;
  - **wake lock**, break timer, sound and ambient bar all stay.
- `dojo.js`: `openBigScreen` is the one entry point - the popup's Start
  button, `sessionStarted`, and **reminder-notification clicks** all land
  here. It focuses an already-open big screen and steers it back to
  `#focus` instead of duplicating tabs; the retired v1.15 "off" choice is
  normalized to "tab" on boot so Start can never be a dead button.
- `popup`: **Start focus session** sends `openBigScreen` (no auto-start;
  you begin from the room); *Settings → Big screen on focus start* now
  offers **New tab** and **Fullscreen window** only.

### Tests

- The shipped-files guard drops the deleted page, and the worker suite
  covers `openBigScreen` (a fresh tab at `#focus`, tab reuse, and the
  retired "off" choice).
- A new **focus-screen e2e** boots the real built screen against the mock
  chrome and the real worker: the `#focus` deep link lands in the room,
  starting saves a live session, a finished 15-minute round pays **+30 XP**
  with `daily.focus = 1` and parks a fresh timer, and the struggle line
  reaches the worker. `bash tests/run.sh` - **73 checks**.

## v1.16.0

The popup gets the "Dark Zen" pass: same widget, same behavior, re-dressed
as a premium dark surface - a deep slate canvas, translucent cards with
hairline borders, real breathing room, and a calmer palette.

### Changed

- `popup.css` - full restyle, no markup or script changes (every id and
  class `popup.js` reaches for is untouched):
  - **Spacious**: 24px container padding and a 20px rhythm between
    sections replace the cramped 14px margins.
  - **Dark Zen palette**: a deep slate gradient canvas (#12161a to
    #1a1f26); cards become translucent surfaces (`rgba(34,41,51,.72)`)
    with 1px hairline borders instead of flat panels; headers are white,
    body text `#a0aec0`.
  - **Typography**: bundled **Inter** (latin variable woff2 + its OFL
    license in `fonts/`, offline) replaces the system stack.
  - **Hero button**: forest green (`#2f855a`, `#38a169` on hover) with a
    12px radius and a soft hover glow - the neon green and dark ink are
    gone (white ink keeps 4.5:1 contrast).
  - **Stats row**: one seamless bar with hairline dividers replaces the
    three tiles; the goal ring's stroke thins from 10px to 6px.
  - **Quests**: individual soft cards with the reward in muted gold
    (`#d69e2e`) aligned right - the dashed separators are gone.
  - Tabs become a calm segmented control; settings, notes and backup
    controls are re-tuned to the same tokens.
  - Audited with `impeccable detect` (59-rule anti-pattern scan): the
    side-tab accent borders, the 3.2:1 hover contrast, sub-11px micro
    text and the flat type hierarchy it caught are all fixed; Inter is a
    deliberate, documented exception (the face was specced on purpose).

## v1.15.0

The big screen's hub becomes honest: the raid boss and the medal shelf now
mirror real extension stats instead of keeping a second ledger, and the
capped side-game pays into the real economy.

### Changed

- `screen/` - rebuilt from the hardened `code-dojo-bigscreen`:
  - **One raid**: Syntax Specter's HP is derived from real work - focused
    minutes, finished sessions, graded quiz answers, review XP, claimed
    strikes and drills - so it can never drift from the small screen.
  - **One medal engine**: the shelf runs the workspace's own medal
    evaluator over the real numbers, celebrates new medals live, and only
    grows (a streak reset no longer un-earns history). Clock-based medals
    (night owl, early bird) stay on the small screen.
  - **The daily strike** is a claim the worker records - once a day, only
    after the day's goal is finished - and it deals 35 raid damage.
  - **Lightning syntax drills** are real graded reps: the worker pays +5 XP
    for each of the first three correct drills a day and caps the rest.
    Drills are never streak activity.
  - Ambient sound fix: switching tracks mid-fade no longer silences the
    freshly started track.
- New worker message `hubAward` backs the drill and strike rewards; the
  worker test suite grows to 72 checks (`bash tests/run.sh`).

### Notes

- The old big-screen hub ledger (`code-dojo.bigscreen.hub`) is unused from
  this version; the medal shelf remembers itself under
  `code-dojo.bigscreen.medals`.

## v1.14.0

The big screen gets its new identity: the workspace is now the improved
"Night Zen" build - day/night themes, ambient focus sounds and the Dojo
Mastery & Raid hub - and the extension icon is the new garden gate mark.
A started focus session opens it as a plain tab by default.

### Changed

- `screen/` - rebuilt from the improved workspace (`code-dojo-bigscreen`):
  Day/Night theme toggle (top bar + Settings), ambient sound bar in the
  focus room, and the Dojo Mastery & Raid hub (boss raid, medals, lightning
  syntax drills) on Today. Raid damage and the medals it can read from real
  stats persist on the big screen; XP and streaks stay on the small screen.
- "Big screen on focus start" now defaults to **New tab** (still
  switchable to Fullscreen window / Off in the popup). Installs whose
  stored settings had inherited the old fullscreen default are moved to
  New tab once, on the first v1.14 boot.
- Extension icon is now the garden gate + code brackets mark
  (`icons/icon.svg`, rasterized to 16/32/48/128).

### Notes

- The previous arcade build remains in `code-dojo-arcade-skin/`
  (standalone: `npm run build`, one self-contained HTML file).

## v1.13.0

The big screen: a started focus session opens the web workspace (the
arcade-themed build shipped in `screen/`) as a fullscreen window. The
popup stays the small screen - the big screen just shows, live.

### Added

- `screen/` - the workspace as an extension page. Today, Focus room,
  Progress, Notes and Settings render the real `chrome.storage.local`
  state (profile, daily, notes, focusSession) and follow it live via
  `storage.onChanged`; the focus room mirrors the running countdown.
- "Big screen on focus start" setting (Fullscreen window / New tab /
  Off; default fullscreen).
- Worker messages `sessionStarted` and `openBigScreen`; an open big
  screen is focused, never duplicated.

### Changed

- `practice.js` reports a started focus countdown to the worker
  (`startTicker` only: breaks are silent, resumes reuse the window).

## v1.12.0

UI release: the v2 web-concept improvements that fit v1.11's honesty
rules, ported with the economy untouched — the full suite (70 checks)
stays green.

### Added

- **Live note-cap preview** in the composer: while you type, the popup
  shows `N words → at most X of 4 checks can count · M more words unlock
  check X+1 · C/300`, computed with the exact `noteWordCount` /
  `capForText` rules the review page and the worker enforce. The caps
  now shape the note while it is written instead of surprising it at
  review time.
- Inline SVG icons replace emoji chrome: popup summary tiles and the
  quiz button, the focus HUD, the break button and the blocker label,
  the quiz streak/retry pills, the hint button, the grading line and the
  summary trophy. Emoji rendered differently per OS and broke the dark
  panels' rhythm; the new icons inherit `currentColor`.
- A `web/` v2 concept app (Vite + React, single-file build) that rebuilds
  the dashboard on the same v1.11 economy — the live spec for the UI
  upgrades above. Not part of the extension bundle; run it with
  `npm install && npm run dev` inside `web/`.

### Changed

- The two-lap goal ring's second lap turns amber once the stretch is
  hit, and both laps now ease with a `cubic-bezier` transition — still
  disabled under `prefers-reduced-motion`.
- The focus page gains the same global `:focus-visible` rings the popup
  and quiz pages already ship (the blocker input keeps its blue ring).
- The quiz e2e still proves the worker's streak value renders; it now
  reads the pill's value element (`streakNum`) since the flame moved
  into an SVG.
- Manifest version `1.11.0` → `1.12.0`.

## v1.11.0

The release that makes v1.10 whole: the six feature files the pages and
the README already promised (`ai.js`, `notes.js`, `grade.js`,
`quiz.html`, `quiz.css`, `quiz.js`) are implemented, and two real streak
bugs are fixed.

### Added

- `ai.js` — the one voice for the on-device model: availability ladder
  (`available` / `downloadable` / `downloading` / `unavailable` /
  `unsupported`), English `expectedInputs`/`expectedOutputs` declaration
  on every session, download-progress monitor, cached sessions per system
  prompt, brace-safe JSON extraction, and JSON asks with exactly one
  retry before throwing.
- `notes.js` — the note-review rules as pure functions: four-check
  rubric, strict JSON validator, prompt builder that delimits the note,
  and the length caps (1 / 2 / 3 / 4 checks by word count) the popup
  displays and the worker enforces.
- `grade.js` — the quiz grading rules as pure functions: deterministic
  prechecks (blank / one-word / question-echo), the grader prompt that
  carries the lesson as untrusted reference, and the strict reply
  validator (one result, verdict enum, one sentence that quotes the
  student). The XP mirror (25 / 10 / 0) is cross-checked against the
  worker.
- `quiz.html` / `quiz.css` / `quiz.js` — the on-device quiz page: model
  ladder with download progress, always-editable topic prefilled from
  the captured lesson or the last session's blocker, three questions
  generated on-device, strict grading, XP **priced by the worker**
  (`quizAward`), and missed questions requeued for tomorrow
  (`quizRequeue` / `consumeStruggle`).
- `tests/` — a dependency-free suite (tiny harness + chrome mock):
  70 checks over the worker economy, streak/freeze/backwards clock,
  notes math and caps, the AI layer, page-vs-worker rule drift,
  non-empty/parse/id guards on every shipped file, and an end-to-end
  quiz round played in a sandboxed page. `bash tests/run.sh` needs only
  Chromium + python3 and exits non-zero on failure.

### Fixed

- **A streak freeze now saves the streak.** It was consumed on rollover
  and then the next award reset the streak to 1 anyway; rollover now
  re-anchors `lastDay` to the day the freeze covered.
- **One missed day burns exactly one freeze.** Every rollover wake
  during the same missed day used to burn another freeze.
- **A backwards clock jump no longer resets the streak.** Timezone
  travel / DST re-anchors the day instead; the freeze reward only fires
  when the day truly advances.
- `tests/run.sh` exits non-zero on failure (it previously matched
  `ALL PASS` anywhere in the dumped page, including script source).

### Changed

- Manifest version `1.10.0` → `1.11.0`, so browsers accept the fixed
  build as an update over the broken one.
