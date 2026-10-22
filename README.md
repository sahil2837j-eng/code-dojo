# Code Dojo — Daily Coding Practice

A Chrome extension that applies **Duolingo's habit mechanics to learning to code**:
streaks, XP, levels, leagues, daily quests, reminders — and it learns **when you
usually code** from your real practice on the Odin Project.

The rule it enforces: **a little practice every day beats a lot sometimes.**

> **v1.17**: **one focus surface** — the small focus-timer page is gone and
> the **big screen's focus room runs the session itself**: the popup's
> **Start focus session** opens it directly at `#focus`, where starting,
> pausing, resetting, the lengths and the live tab title all live now. A
> round survives a reload (a 20+ minute gap voids it; a closed tab comes
> back paused), and each finished round is still paid by the worker. The
> suite is now **73 checks** (`bash tests/run.sh`).
> **v1.16**: the popup is re-dressed in **Dark Zen** — a deep slate
> canvas, translucent cards with hairline borders, **bundled Inter**
> offline, a forest-green hero button and muted-gold quest rewards. No
> markup or behavior changes: same widget, reload to see it.
> **v1.15**: the big screen's raid and medal shelf now **mirror real
> small-screen stats** (one ledger, not two) — boss HP is derived from your
> real minutes, sessions, quizzes, reviews, strikes and drills, and medals
> celebrate live. The worker backs two capped rewards: **+5 XP for each of
> the first three correct syntax drills a day** (drills are never streak
> activity) and the **daily strike** claim, recorded once the day's goal is
> finished. The suite is now **72 checks** (`bash tests/run.sh`).
> **v1.14**: the big screen gets its "Night Zen" workspace build —
> day/night themes, ambient focus sounds — and opens as a **plain tab** by
> default (old installs are moved once from the fullscreen default).
> **v1.11**: **the streak keeps its promises** — a **freeze now actually
> saves the streak** (it used to be consumed and the streak reset anyway
> two seconds later), one missed day burns **exactly one** freeze however
> many times the worker wakes on rollover, and a **clock that jumps
> backwards** (timezone travel, DST) re-anchors the day instead of
> resetting the streak. The on-device files (`ai.js`, `notes.js`,
> `grade.js` and the quiz page) are complete and the whole extension is
> now guarded by a dependency-free test suite: **`bash tests/run.sh`**,
> 70 checks, Chromium only.
> **v1.10**: **minutes stop paying full price forever** — the rate is 2 XP per
> minute up to your stretch threshold, then 1, and the **worker** applies that
> rate itself (no page can farm full-price minutes; a finished focus session is
> rated by where it started, since its minutes were heartbeated in at zero XP).
> **Backups**: Settings gains **Export/Import JSON** and a **two-step Reset**
> (no native dialogs). **The popup now matches Focus Tracker** — the same design
> tokens (only the accent is Dojo green), four tabs (**Today / Progress / Notes
> / More**), one ring that keeps filling as a **second lap** past the goal, and
> the quiz door moved to Today. Notes, quizzes and quests are unchanged.
> **v1.9**: **one voice for the model** — a shared `ai.js` declares **English
> output** (`expectedInputs`/`expectedOutputs`) on every on-device session, so
> Chrome stops guessing which language to answer in (and warning about it);
> session creation, JSON extraction and asks live in that one file. **Stricter
> grading**: the grader now sees the lesson's own **code and section headings**
> as reference, replies must pass a shape check (one result per question,
> verdicts only correct/partial/wrong, one sentence that **quotes something you
> wrote**) with **one retry** — a garbled round pays nothing instead of
> guessing "partial". **Notes stay honest**: short texts cap their own checks
> (a 2-word fragment can count at most one, however friendly the model feels),
> and the week total and the goal ring round the same way.
> **v1.8**: a note is a **mini learning exercise** now. The on-device model
> reads it and answers four yes/no checks — does it **name a concept**, is it
> **your own words**, does it **include an example**, does it say **what you're
> unsure about** — and **plain code does the math**: +5 XP per check passed,
> max 20, still below a 15-minute session. You get one specific comment and a
> **suggested rewrite to compare** (your text is never replaced), and you can
> **rewrite your note once to earn the difference**. Junk stops paying:
> near-duplicates of an earlier note pay nothing, and the 2-paying-notes cap
> stands. No on-device model? A conservative 5 XP base, same cap.
> **v1.7**: the quiz is **strict now** — blank, one-word and question-restating
> answers are wrong by rule, before the model is even asked, and the grader is
> told to judge what an answer *proves*: **correct pays 25 XP, partial 10,
> wrong nothing** (up to 3 paying answers a day). **Wrong and partial answers
> come back** — they are queued and lead tomorrow's quiz until they are fixed.
> XP rebalanced: a focus session out-earns a typed note (**20 XP**, the same
> number on the quest card). A **stretch ring** past the daily goal (so 58
> minutes at a 15-minute goal teaches something), the **"what couldn't you do
> today?"** line at the end of a focus round feeding tomorrow's quiz, and
> **one reminder** — your learned usual time wins, the fixed hour is the
> fallback.
> **v1.6**: the quiz **never assumes what you are studying** — the quiz page has
> an always-editable **"Quiz me on"** field (prefilled from the captured Odin
> lesson, nothing more) plus an optional *"anything else in play"* line for
> **VS Code practice, an article you were assigned**, anything. You can also
> open the quiz from the popup with no lesson captured at all and just type the
> topic. The captured lesson is only a guess; what you confirm is what gets
> quizzed, and grading follows it.
> **v1.5**: **on-device lesson quizzes** — on any Odin Project lesson, the page
> shows a small **🧠 Quiz me on this lesson** button. It opens a quiz page that
> writes three questions **from that exact lesson** (title, sections, a code
> block from the page) plus your recent learning notes, using **Chrome's built-in
> model (Gemini Nano)** — generated and graded locally, nothing leaves your
> machine. (XP rules superseded by the v1.7 verdict scale above.) No model? The
> page explains and everything else works as usual.
> **v1.4**: the focus page got a real one — **countdown ring**, a **5-minute
> break timer** after each round, **keyboard shortcuts** (Space / R / 1–3), a
> **favicon + tab countdown** and a **screen wake lock** while a session runs.
> Level-ups now celebrate themselves (confetti + overlay on the focus page,
> toasts on the Odin Project), and quest/goal moments toast too.
> **v1.3**: **Learning notes** — say what you actually learned (reviewed on-device since v1.8: 5 XP per check passed, max 20). Focus sessions must be
> **continuous**: a break under 20 minutes keeps the session, 20+ minutes voids
> it. **"Coding elsewhere" mode** counts VS Code and assignment pages honestly
> (idle-checked). v1.2: generic quizzes gone — all XP still comes from **real
> focused minutes**. v1.5 brings quizzes back the only way they make sense:
> generated from the lesson you are actually on.

## What's inside

| Duolingo mechanic | Here |
|---|---|
| 🔥 Streak | Practiced your daily goal today? Streak +1. Miss a day → a **streak freeze** covers you once (you earn more at every 7th day). **A learning note also counts as the day's activity** — a VS Code day with a written note never loses the streak. |
| ⚡ XP | **Verified effort pays the most**: +2 per focused minute, quiz answers pay by verdict (correct 25, partial 10, wrong 0), +10 daily-goal bonus, quest rewards. Learning notes are a small capped garnish: a **reviewed note pays by its checks** (5 XP each, max 20, 2 a day). No points for anything you didn't actually do. |
| 📝 Learning log | In the popup: write *what you figured out* in a multi-line box (it grows as you type). The **on-device model reviews it** against four checks — names a concept, own words, has an example, flags what's unsure — gives **one specific comment** and a **suggested rewrite to compare** (your text is never replaced). **Code computes the points**: +5 per check passed, max 20, capped at **2 paying notes a day**. Short notes **cap their own checks** (a 2-word fragment can count at most one). Near-duplicates of an earlier note pay nothing. **Rewrite once to earn the difference.** No model? A 5 XP base. Feeds a daily quest too. |
| 📈 Levels | Level 1 → ∞. Needs 100·(n−1)² XP, so early levels fly by and later ones demand real work. |
| 🏆 Leagues | Bronze → Silver → Gold → Platinum → Sapphire → Emerald → Ruby → Diamond → **Legendary**, decided by this week's XP. Promotion line shown live — and in your first week it says *"first week — this one sets the baseline"* instead of pretending you lost to 8 ghost weeks. |
| ✅ Daily quests | 3 new quests every day (deterministic per date): earn XP, practice minutes, focus sessions, Odin Project time, learning notes, an on-device lesson quiz. Auto-completing with bonus XP. |
| 🎯 Goal + stretch | **15 min keeps the streak** (configurable); past it, the outer blue ring fills toward a **stretch goal** (at least 45 min) — so a 58-minute day at a 15-minute goal shows *58 past the minimum*, not a full ring and nothing more. |
| 🧠 On-device quiz (v1.5–1.7) | From an Odin lesson (**🧠 Quiz me on this lesson**) or straight from the popup (**🧠 Quiz me**). The **"Quiz me on" field is always editable** — prefilled with the captured lesson, but VS Code days or assigned articles can just be typed in. Three questions, written from *what you confirm*. **Strict local grading** (v1.7): blank, one-word and question-echoing answers are wrong by rule; the model is told vague or buzzword-only answers are *never* correct, and feedback must name the exact gap — no generic praise. **Correct 25 XP, partial 10, wrong 0, up to 3 paying answers a day.** **Missed questions come back**: wrong/partial answers are queued and lead the next day's quiz (up to 2, expire after a week) until a retry is finally correct. Requires a recent Chrome on capable hardware; otherwise the page explains and hides nothing else. |
| 🥋 Practice | **Focus sessions** — 15/25/50-minute timers on a countdown ring, with a 5-minute break timer offered after each round, keyboard shortcuts (Space, R, 1–3), a live favicon/tab countdown and a screen wake lock so the machine stays awake mid-session. **Continuous focus**: pause/close and come back within 20 min → the same session continues (XP safe); gone 20+ min → the session is void, no XP. Saved locally, so a tab close doesn't kill it. When a round ends, one optional line — **"what couldn't you do today?"** — is kept and turned into a question in tomorrow's quiz. **Odin Project mode** — tracked automatically (see below). |
| 🖥️ Big screen (v1.13–1.14) | Start a focus session and the **web workspace opens itself** — a new tab (default) with your real streak, XP, quests and notes, mirroring the running countdown live. Day/Night themes, ambient focus sounds and the Dojo Mastery & Raid hub included. The popup stays the small screen in charge: the setting **Big screen on focus start** picks New tab / Fullscreen window / Off. |
| 💻 Coding elsewhere | Coding in VS Code or an Odin **assignment page**? Flip *Coding elsewhere* in the popup (or just click the assignment link from Odin — it auto-counts for the next 20 minutes). Minutes accrue only while you're actually at the machine (system idle check), count toward your goal, and keep the streak alive. Pauses itself if you walk away. |
| 🔔 Reminders | **One reminder a day, at the hour that wins**: once Dojo has learned your usual coding time (a couple of Odin sessions, and the nudge is on) that hour beats the fixed setting; the popup's *Reminder at* is the fallback and says so. No day with two nudges. |

Everything is stored locally (`chrome.storage`). No account, no server, no tracking.

## Odin Project mode (automatic practice)

Code Dojo watches for real activity on `theodinproject.com` — mouse, keyboard,
page focused — and then:

1. **Starts a session by itself** after ~45 s of real activity. No button to press.
   A tiny badge (bottom-right) shows the running time; a short toast
   (*"Practice detected — +2 XP per minute"*) fades away in ~3.5 seconds, so it
   never interrupts your work. Milestones (25, 50, 75 min) toast the same way.
2. **Banks 2 XP per focused minute** toward your daily goal and quests.
   Merely loading the page counts for nothing — idle time is never counted.
3. **Learns your usual coding time.** Every session records its start hour.
   After a couple of sessions the popup shows *"You usually code around 21:00"*,
   and on any day you haven't practiced by then you get a gentle notification —
   this learned time wins over the fixed *Reminder at* setting (that hour is the
   fallback, and there is never more than one nudge a day).
   Toggle it in the popup ("Nudge at my usual time").
4. Remembers your last session ("Welcome back — last session: 42 min").
5. **Feeds the quiz (v1.5–1.6):** a compact snapshot of the lesson you're reading
   (title, section headings, one code block) is captured and kept for 12 hours,
   so **🧠 Quiz me on this lesson** opens with your last lesson as the prefill —
   edit the topic freely and that is what gets quizzed.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this folder (the one containing `manifest.json`)
4. Pin it — the badge icon is your dojo.

## How to use it

- Click the icon → dashboard: streak, XP, level bar, **daily goal + stretch
  rings**, quests, league card, week chart, **coding habit** card.
- **Start focus session** opens the **focus room on the big screen** (also
  reachable from any reminder notification). The room runs the session itself:
  Space starts/pauses, R resets, 1–3 picks a length — and after each round the
  dojo offers the 5-minute break. The tab title counts down with you, so a
  background tab still shows the session.
- The **big screen is your one focus surface** (v1.17): a round survives a
  reload, a 20+ minute gap voids it, a closed tab comes back paused — nothing
  is ever earned silently. Open it under *Settings → Big screen on focus start*
  as a **New tab** (default) or a **Fullscreen window**.
- Work on the Odin Project — the dojo tracks it, banks XP, and learns your schedule.
  A lesson page also gets the **🧠 Quiz me on this lesson** button, and the
  popup has **🧠 Quiz me** for days when you weren't on Odin: three on-device
  questions written from the topic you type (the captured lesson is just the
  prefill), typed answers, strict local grading. Missed questions lead the
  next day's quiz until they are fixed.
- Set the goal to something laughably small (10 minutes) — the streak matters
  more than the volume at the start.

## Files

- `manifest.json` — MV3 manifest (storage, alarms, notifications, idle; content script on theodinproject.com).
- `dojo.js` — service worker: XP, learning notes (save + review math: cap, near-duplicates, revision deltas), streaks, levels, leagues, quests, Odin memory, away mode, quiz XP + retry queue, struggles, reminders.
- `odin.js` — content script: activity detection, session badge, brief toasts, assignment-link detection, lesson capture + quiz button.
- `ai.js` — shared on-device model plumbing (v1.9): one session helper that declares English output (kills the "no output language" console warning), availability checks, brace-safe JSON extraction and JSON asks. Covered by `tests/ai.test.js` (`node tests/ai.test.js`).
- `screen/` — the big screen (v1.14): the Night Zen web workspace built as an extension page (from the `code-dojo-bigscreen` source via `npm run build:ext`) — day/night themes, ambient focus sounds and the Dojo Mastery & Raid hub. Reads the real `chrome.storage.local` state and follows it live, and since v1.17 the **focus room runs the focus session itself** (countdown, save/resume, break, worker hand-off).
- `quiz.html/css/js` — the on-device quiz (model availability → download progress → editable “Quiz me on” topic, prefilled from the captured lesson or your last session's struggle → generate → strict grade → XP; wrong/partial answers are queued for tomorrow).
- `grade.js` — the strict grading rules: deterministic checks (blank / one-word / echo = wrong, settled before the model is asked), the grader prompt (v1.9: carries the lesson's own code/headings as reference) and the reply validator (exactly one result per question, verdict enum, one-sentence feedback that quotes the student; one retry on the page side). Pure functions, covered by `tests/grade.test.js` (`node tests/grade.test.js`).
- `notes.js` — the note review rules (v1.8, v1.9 length caps): strict JSON shape, four-check validation, prompt builder, points math (+5 per check) and the caps that stop a two-word fragment from claiming four checks. Pure functions, covered by `tests/notes.test.js` (`node tests/notes.test.js`).
- `popup.html/css/js` — the dashboard (incl. coding-habit card and the on-device note review).
- `icons/` — generated by `python3 make_icons.py`.
- `tests/` — dependency-free suites (tiny harness + chrome mock + the real worker internals). **`bash tests/run.sh`** runs everything in headless Chromium (needs only `chromium` + `python3`, exits non-zero on failure); with Node installed, each `node tests/<file>.test.js` also runs standalone. Covers the worker economy (XP, stretch discount, streak/freeze/backwards clock), notes math + caps, the AI layer, page-vs-worker rule drift, a parse/id guard on every shipped file, a full end-to-end quiz round played in a sandboxed page, and a focus-screen e2e (the `#focus` deep link lands in the room, starting saves a live session, a finished 15-minute round pays +30 XP with the fresh timer parked, and the struggle line reaches the worker).

## Tips for the "obsession" loop

1. Set the goal to something laughably small (10 minutes) — the streak matters
   more than the volume at the start.
2. Keep the reminder hour at a time you are always free.
3. Do the Odin Project *before* you open any social site; the streak makes that automatic.
4. Watch the league card: beating your own past weeks is the only competition
   that matters.
