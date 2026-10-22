/* Code Dojo - popup dashboard */

'use strict';

const $ = (id) => document.getElementById(id);
const send = async (msg) => {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (_) {
    return null;
  }
};

const N = window.DojoNotes; // note review rules (notes.js)
const AI = window.DojoAI; // shared model plumbing (ai.js)
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const QUOTES = [
  'Discipline beats motivation. Show up, even for five minutes.',
  'A coder is defined by the days they practiced, not the days they felt like it.',
  'Small reps every day beat occasional marathons.',
  'The streak is not the point — the person you are becoming is.',
  'You do not need more time. You need fewer distractions.',
  'Consistency is compounding interest for your skills.',
  'Miss once, continue. Miss twice, start again — stronger.',
  'The best thing you can write is the habit you keep.',
  'Obsession with improvement is just discipline wearing enthusiasm.',
  'Practice does not make perfect. Practice makes permanent.',
  'One round a day keeps the skill decay away.',
  'You are always one session ahead of who you were yesterday.',
];

const CIRC = 326.7; // 2*pi*r at r=52 — both ring laps share it (v1.10)
let report = null;

/* v1.8 note review state */
let reviewBusy = false; // one review at a time — no double pays
let lastShownAt = 0; // the note the review card currently talks about
let dismissedAt = 0; // a "review it" offer the user waved off

function render(r) {
  report = r;

  /* header */
  $('streakVal').textContent = r.profile.streak;
  $('xpVal').textContent = r.profile.xp;
  $('levelVal').textContent = r.level.n;
  $('leaguePill').textContent = r.league.name;
  $('levelFill').style.width = `${Math.max(2, r.level.pct)}%`;
  $('levelNote').textContent = `${r.level.into} / ${r.level.need} XP to level ${r.level.n + 1}`;

  /* daily goal ring (v1.10): one ring, two laps. Lap 1 fills to the goal;
     past it, lap 2 keeps drawing on the SAME radius in a lighter shade
     until the stretch threshold. */
  const goal = r.settings.dailyGoalMinutes;
  const stretch = r.stretch || Math.max(45, goal * 2);
  const minutes = r.today.minutes || 0;
  const pct = Math.min(1, minutes / goal);
  const lap2 = Math.min(1, Math.max(0, (minutes - goal) / Math.max(1, stretch - goal)));
  $('ringFg').style.strokeDashoffset = String(CIRC * (1 - pct));
  $('ringStretch').style.strokeDashoffset = String(CIRC * (1 - lap2));
  $('ringVal').textContent = String(Math.floor(minutes));
  const goalDone = minutes >= goal;
  const stretchHit = minutes >= stretch;
  /* v1.12: the second lap turns amber once the stretch is hit */
  $('ringStretch').classList.toggle('done', stretchHit);
  /* short labels only: the ring's usable inner width is 66px */
  $('ringUnit').textContent = stretchHit ? 'stretch ✓' : goalDone ? 'goal ✓' : `of ${goal} min`;
  $('goalNote').textContent = stretchHit
    ? `Stretch hit: ${Math.floor(minutes)} min past a ${goal}-min goal. Everything from here compounds.`
    : goalDone
      ? `Streak safe. ${Math.max(0, Math.ceil(stretch - minutes))} min more reaches today's stretch (${stretch}) — the minimum is not the lesson.`
      : `${Math.max(0, Math.ceil(goal - minutes))} minutes to keep the ${r.profile.streak}-day streak alive.`;

  /* quests */
  const ul = $('questList');
  ul.textContent = '';
  for (const q of r.quests.list) {
    const li = document.createElement('li');
    const top = document.createElement('div');
    top.className = 'q-top';
    const title = document.createElement('span');
    title.textContent = q.title;
    top.append(title);
    if (q.done) {
      const d = document.createElement('span');
      d.className = 'done';
      d.textContent = '✓ Done';
      top.append(d);
    } else {
      const rw = document.createElement('span');
      rw.className = 'rw';
      rw.textContent = `+${q.reward} XP`;
      top.append(rw);
    }
    li.append(top);

    const bar = document.createElement('div');
    bar.className = 'q-bar';
    const fill = document.createElement('div');
    fill.style.width = `${Math.min(100, Math.round((q.progress / q.target) * 100))}%`;
    bar.append(fill);
    li.append(bar);
    ul.append(li);
  }

  /* league */
  const L = r.league;
  const note = $('leagueNote');
  note.textContent = '';
  note.append(`${L.thisWeekXp} XP this week`);
  note.append(L.next ? ` — ${L.next.needed} XP to ${L.next.name}` : ' — top league');
  const activeWeeks = (L.history || []).filter((x) => x > 0).length;
  note.append(
    activeWeeks
      ? ` · you beat ${L.beaten} of your last ${activeWeeks} active week${activeWeeks === 1 ? '' : 's'}`
      : ' · first week — this one sets the baseline'
  );

  const bars = $('leagueBars');
  bars.textContent = '';
  const series = [...L.history, L.thisWeekXp];
  const max = Math.max(...series, 1);
  series.forEach((v, i) => {
    const b = document.createElement('div');
    b.className = 'b' + (i === series.length - 1 ? ' now' : '');
    b.style.height = `${Math.max(6, Math.round((v / max) * 100))}%`;
    bars.append(b);
  });

  /* week */
  const week = $('weekBars');
  week.textContent = '';
  const maxMin = Math.max(...r.week.map((d) => d.minutes), r.settings.dailyGoalMinutes);
  let total = 0;
  r.week.forEach((d) => {
    total += d.minutes;
    const col = document.createElement('div');
    col.className = 'd' + (d.complete ? ' hit' : '');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(4, Math.round((d.minutes / maxMin) * 44))}px`;
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = d.day.slice(8) === new Date().getDate().toString()
      ? 'now'
      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d.day + 'T00:00:00').getDay()];
    col.append(bar, lbl);
    week.append(col);
  });
  // one number, one formatter: floor, like the ring - never show "124"
  // next to a ring that says "123" for the same minutes
  $('weekNote').textContent = `${Math.floor(total)} minutes trained this week · ${r.profile.bestStreak}-day best streak`;

  /* quote of the day */
  const dayNo = Math.floor(Date.now() / 86400000);
  $('quoteCard').textContent = `“${QUOTES[dayNo % QUOTES.length]}”`;

  /* coding habit (learned from Odin Project sessions) */
  const o = r.odin || {};
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;
  const habitEl = $('habitNote');
  habitEl.textContent = '';
  if (o.usual) {
    const b = document.createElement('b');
    b.textContent = hh(o.usual.hour);
    habitEl.append('You usually code around ', b, ` — ${o.usual.count} of your last ${o.usual.sessions} sessions started then.`);
  } else {
    habitEl.textContent =
      'Code on the Odin Project a couple of times — Dojo will learn your usual time and nudge you then.';
  }
  $('odinToday').textContent =
    o.todayMinutes > 0
      ? `Today on Odin Project: ${Math.floor(o.todayMinutes)} min — counts toward your goal.`
      : 'No Odin Project practice recorded today.';
  $('nudgeToggle').checked = r.settings.practiceNudge !== false;

  /* learning log */
  $('noteHint').textContent =
    r.paidToday >= r.noteCap
      ? `${r.paidToday}/${r.noteCap} paying notes today — extra notes are still reviewed, but pay nothing.`
      : `${r.noteCap - r.paidToday} paying note(s) left — the review pays +${r.noteXpPerCheck} XP per check passed (max ${r.noteMaxXp}).`;
  const nl = $('noteList');
  nl.textContent = '';
  for (const n of r.notes || []) {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 'nt';
    t.textContent = n.text;
    const m = document.createElement('span');
    m.className = 'nm';
    const pts = typeof n.points === 'number' ? n.points : n.paid ? r.noteMaxXp : 0;
    const label = pts > 0 ? `+${pts} XP` : n.duplicate ? 'dup · free' : n.reviewed ? '0 XP' : 'to review';
    m.textContent = `${label} · ${n.day.slice(5)}`;
    li.append(t, m);
    nl.append(li);
  }
  maybeOfferReview(r);
  /* the Notes tab shows a dot when a note is waiting for review */
  $('notesDot').hidden = !(r.notes || []).some((n) => !n.reviewed && !n.duplicate);

  /* coding elsewhere (VS Code / assignment pages) */
  const a = r.away || {};
  $('awayToggle').checked = !!a.manual;
  $('awayNote').textContent = a.manual
    ? `On — ${Math.floor(a.minutes || 0)} min counted today. Pauses itself when you leave the machine.`
    : a.autoLeft > 0
      ? `Auto-on for ${Math.ceil(a.autoLeft / 60000)} more min (you left Odin mid-session). Switch it on to keep counting.`
      : 'Off. Turn on when you code outside the browser — counts only while you are actually at the machine.';

  /* settings */
  $('goalSelect').value = String(r.settings.dailyGoalMinutes);
  $('hourSelect').value = String(r.settings.reminderHour);
  $('soundToggle').checked = r.settings.sound !== false;
  $('bigScreenSelect').value = r.settings.bigScreen || 'tab';

  // one reminder, one winner: say which hour actually fires
  const rem = r.reminder || { hour: r.settings.reminderHour, learned: false };
  $('reminderNote').textContent = rem.learned
    ? `Firing at ${hh(rem.hour)} — your learned usual time wins. This hour is the fallback if you turn the nudge off.`
    : r.settings.practiceNudge !== false
      ? `Fixed at ${hh(rem.hour)} until Dojo learns your usual time (a couple of Odin Project sessions) — then that time wins.`
      : `${hh(rem.hour)}, fixed — the usual-time nudge is off.`;
}

async function reload() {
  const r = await send({ type: 'getState' });
  if (r && r.ok) render(r);
}

/* ---------------- actions ---------------- */
/* v1.17: the focus room on the big screen is the session surface - the
   worker opens (or refocuses) it at #focus. */
$('startBtn').addEventListener('click', async () => {
  await send({ type: 'openBigScreen' });
  window.close();
});

$('goalSelect').addEventListener('change', async (e) => {
  await send({ type: 'setSettings', patch: { dailyGoalMinutes: Number(e.target.value) } });
  await reload();
});

$('hourSelect').addEventListener('change', async (e) => {
  await send({ type: 'setSettings', patch: { reminderHour: Number(e.target.value) } });
  await reload();
});

$('soundToggle').addEventListener('change', async (e) => {
  await send({ type: 'setSettings', patch: { sound: e.target.checked } });
});

$('nudgeToggle').addEventListener('change', async (e) => {
  await send({ type: 'setSettings', patch: { practiceNudge: e.target.checked } });
  await reload();
});

$('bigScreenSelect').addEventListener('change', async (e) => {
  await send({ type: 'setSettings', patch: { bigScreen: e.target.value } });
});

/* ---------------- on-device model (note review) ----------------
   Session creation, the English output-language declaration and JSON asks
   live in ai.js - shared with the quiz page, one home for the setting.
   The popup only answers the model's four checks; the WORKER computes the
   points, so nothing on this page can inflate a payout. */

async function lessonTopic() {
  try {
    const { quizContext } = await chrome.storage.local.get('quizContext');
    if (quizContext && quizContext.title && Date.now() - (quizContext.at || 0) < 12 * 3600000) {
      return String(quizContext.title).slice(0, 160);
    }
  } catch (_) {}
  return '';
}

/* ---------------- note review (v1.8) ---------------- */
function showReviewBox(noteAt) {
  lastShownAt = noteAt;
  const box = $('noteReview');
  box.textContent = '';
  box.hidden = false;
  return box;
}

function paintReviewBusy() {
  const box = showReviewBox(lastShownAt);
  box.append(el('p', 'nr-head', '🔍 Reviewing your note on-device…'));
  box.append(el('p', 'nr-note', 'Four quick checks: concept, own words, example, and what is still unclear.'));
}

function paintReviewOffer(note) {
  const box = showReviewBox(note.at);
  box.append(el('p', 'nr-head', '📝 One note is waiting for its review.'));
  box.append(el('p', 'nr-comment', `“${note.text}”`));
  const row = el('div', 'nr-actions');
  const go = el('button', 'primary', 'Review it now');
  const later = el('button', 'ghost', 'Not now');
  row.append(go, later);
  box.append(row);
  go.addEventListener('click', () => void runNoteReview(note));
  later.addEventListener('click', () => {
    dismissedAt = note.at;
    $('noteReview').hidden = true;
  });
}

function paintDuplicate(note) {
  const box = showReviewBox(note.at);
  box.append(el('p', 'nr-head', '✋ You already wrote this one.'));
  box.append(el('p', 'nr-note', `Near-duplicate of your note from day ${String(note.dupOf || '').slice(5)} — duplicates pay nothing. Say what is new today.`));
}

function paintReviewFailed(note) {
  const box = showReviewBox(note.at);
  box.append(el('p', 'nr-head', '😕 The review did not finish.'));
  box.append(el('p', 'nr-note', 'The note is saved either way. The on-device model may be busy — try once more.'));
  const row = el('div', 'nr-actions');
  const retry = el('button', 'primary', 'Try again');
  row.append(retry);
  box.append(row);
  retry.addEventListener('click', () => void runNoteReview(note));
}

function paintReviewResult(res) {
  const box = showReviewBox(res.noteAt);
  if (res.base) {
    box.append(el('p', 'nr-head', res.capped ? "Saved — today's note cap is full, so it pays nothing." : `Saved — +${res.points} XP base.`));
    box.append(el('p', 'nr-note', "The full review needs Chrome's on-device model (the same one the quiz uses). This note still counts for streaks and quests."));
    return;
  }
  const passed = res.passed || 0;
  box.append(el('p', 'nr-head', `Review done — ${passed}/4 checks passed.`));
  const chips = el('div', 'nr-checks');
  for (const c of N.CHECK_DEFS) {
    chips.append(el('span', 'nr-check' + (res.checks[c.key] ? ' pass' : ''), `${res.checks[c.key] ? '✓' : '✗'} ${c.label}`));
  }
  box.append(chips);
  if (res.comment) box.append(el('p', 'nr-comment', `💬 ${res.comment}`));
  if (res.rewrite) {
    const rw = el('div', 'nr-rewrite');
    rw.append(el('b', null, 'try it stronger'));
    rw.append(el('div', null, res.rewrite));
    rw.append(el('p', 'nr-note', 'Your note stays exactly as you wrote it — this rewrite is just for comparison.'));
    box.append(rw);
  }
  const points = el('p', 'nr-points');
  if (res.capped) {
    points.append(el('span', 'cap', `Reviewed — but today's cap (${(report && report.noteCap) || 2} paying notes) is full, so it pays nothing.`));
  } else {
    points.append(el('span', 'xp', `+${res.points} XP`));
    points.append(document.createTextNode(` · ${N.XP_PER_CHECK} XP per check passed`));
  }
  box.append(points);
  if (res.shortCap) {
    box.append(
      el(
        'p',
        'nr-note',
        `Short note — at most ${res.shortCap} check${res.shortCap === 1 ? '' : 's'} can count until you say a bit more.`
      )
    );
  }
  if (!res.capped && passed < 4) attachRevise(box, res);
}

function attachRevise(box, res) {
  const wrap = el('div');
  wrap.append(el('p', 'nr-note', 'Rewrite it once — pass more checks and you earn the difference.'));
  const ta = el('textarea');
  ta.value = res.text || '';
  ta.maxLength = 300;
  const row = el('div', 'nr-actions');
  const save = el('button', 'primary', 'Save rewrite');
  const keep = el('button', 'ghost', 'Keep my words');
  row.append(save, keep);
  wrap.append(ta, row);
  box.append(wrap);
  keep.addEventListener('click', () => wrap.remove());
  save.addEventListener('click', () => void runRevision(res, ta.value.trim(), wrap));
}

async function runRevision(res, text, wrap) {
  if (reviewBusy || text.length < ((report && report.noteMin) || 15)) return;
  reviewBusy = true;
  wrap.textContent = '';
  wrap.append(el('p', 'nr-note', '🔍 Reviewing the rewrite…'));
  try {
    const topic = await lessonTopic();
    const data = await AI.askJson(N.buildNotePrompt(text, topic), N.NOTE_SCHEMA);
    const review = N.validateReview(data);
    if (!review) throw new Error('bad review');
    const r = await send({
      type: 'reviewNote',
      at: res.noteAt,
      checks: N.applyNoteCaps(review.checks, text),
      comment: review.comment,
      rewrite: review.rewrite,
      revised: true,
      text,
    });
    if (!(r && r.ok)) throw new Error((r && r.error) || 'save failed');
    wrap.textContent = '';
    if (r.improved) {
      wrap.append(el('p', 'nr-head', `Better — +${r.delta} XP (now +${r.points} XP total, ${r.passed}/4 checks).`));
    } else if (r.capped) {
      wrap.append(el('p', 'nr-note', "The rewrite passed more checks, but today's note cap is full — no extra XP."));
    } else {
      wrap.append(el('p', 'nr-note', 'The rewrite did not pass more checks — your original words (and points) stand.'));
    }
    await reload();
  } catch (_) {
    wrap.textContent = '';
    wrap.append(el('p', 'nr-note', 'The rewrite review did not finish — try once more.'));
  } finally {
    reviewBusy = false;
  }
}

async function runNoteReview(note) {
  if (reviewBusy) return;
  reviewBusy = true;
  lastShownAt = note.at;
  paintReviewBusy();
  try {
    const avail = await AI.availability();
    if (avail !== 'available') {
      const r = await send({ type: 'reviewNote', at: note.at, unavailable: true });
      paintReviewResult({ noteAt: note.at, base: true, points: (r && r.points) || 0, capped: !!(r && r.capped) });
      await reload();
      return;
    }
    const topic = await lessonTopic();
    const data = await AI.askJson(N.buildNotePrompt(note.text, topic), N.NOTE_SCHEMA);
    const review = N.validateReview(data);
    if (!review) throw new Error('bad review');
    // v1.9: short notes cannot claim checks they have no words for - cap it
    // HERE so the chips are honest, and the worker caps again before paying
    const checks = N.applyNoteCaps(review.checks, note.text);
    const rawPassed = N.checksPassed(review.checks);
    const r = await send({
      type: 'reviewNote',
      at: note.at,
      checks,
      comment: review.comment,
      rewrite: review.rewrite,
    });
    if (!(r && r.ok)) throw new Error((r && r.error) || 'save failed');
    paintReviewResult({
      noteAt: note.at,
      text: note.text,
      checks,
      shortCap: N.checksPassed(checks) < rawPassed ? N.capForText(note.text) : 0,
      comment: review.comment,
      rewrite: review.rewrite,
      points: r.points,
      passed: r.passed,
      capped: r.capped,
    });
    await reload();
  } catch (_) {
    paintReviewFailed(note);
  } finally {
    reviewBusy = false;
  }
}

function maybeOfferReview(r) {
  if (reviewBusy) return;
  const pending = (r.notes || []).find((n) => !n.reviewed && !n.duplicate);
  if (!pending || pending.at === dismissedAt) return;
  const box = $('noteReview');
  if (!box.hidden && lastShownAt === pending.at) return; // already showing this one
  paintReviewOffer(pending);
}

async function sendNote() {
  if (reviewBusy) return;
  const input = $('noteInput');
  const text = input.value.trim();
  if (!text) return;
  const res = await send({ type: 'saveNote', text });
  if (!res || !res.ok) {
    $('noteHint').textContent = (res && res.error) || 'Could not save the note.';
    return;
  }
  input.value = '';
  paintCapPreview();
  await reload();
  if (res.duplicate) {
    paintDuplicate(res.note);
    return;
  }
  void runNoteReview(res.note);
}
$('noteBtn').addEventListener('click', () => void sendNote());
$('noteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendNote();
});
$('noteInput').addEventListener('input', paintCapPreview);

/* v1.12: live cap preview — the word caps the review and the worker
   enforce, made visible while the note is written. Mirrors notes.js
   noteWordCount/capForText exactly; the worker still does the final math. */
function paintCapPreview() {
  const input = $('noteInput');
  const box = $('capPreview');
  const text = input.value;
  if (!text.trim()) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  const wc = N.noteWordCount(text);
  const cap = N.capForText(text);
  box.textContent = '';
  box.hidden = false;
  const dots = el('span', 'cap-dots');
  for (let i = 1; i <= 4; i += 1) dots.append(el('i', i <= cap ? 'on' : null));
  const info = el('span', 'cap-info');
  info.append(el('b', null, `${wc} word${wc === 1 ? '' : 's'}`));
  info.append(` → at most ${cap} of 4 checks can count`);
  const nextAt = cap === 1 ? 5 : cap === 2 ? 10 : cap === 3 ? 15 : 0;
  if (nextAt) {
    const n = nextAt - wc;
    info.append(` · ${n} more word${n === 1 ? '' : 's'} unlock check ${cap + 1}`);
  }
  info.append(` · ${text.length}/${N.NOTE_MAX_CHARS}`);
  box.append(dots, info);
}

$('awayToggle').addEventListener('change', async (e) => {
  await send({ type: 'setAway', on: e.target.checked });
  await reload();
});

/* v1.6: open the on-device quiz straight from the popup. If a lesson was
   captured it is the prefill; otherwise type the topic (VS Code practice,
   an article — the quiz never assumes). */
$('quizBtn').addEventListener('click', () => {
  void send({ type: 'openQuiz' });
});

/* ---------------- v1.10: four tabs ----------------
   All panels stay mounted, so a half-typed note survives switching tabs.
   The popup always opens on Today; arrows/Home/End move between tabs. */
const TABS = ['today', 'progress', 'notes', 'more'];

function showTab(name) {
  const want = TABS.includes(name) ? name : 'today';
  for (const btn of document.querySelectorAll('#tabBar [data-tab]')) {
    const on = btn.dataset.tab === want;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
    const panel = document.getElementById('panel-' + btn.dataset.tab);
    if (panel) panel.hidden = !on;
  }
}

$('tabBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) showTab(btn.dataset.tab);
});

$('tabBar').addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  const current = document.querySelector('#tabBar .active');
  const from = current ? current.dataset.tab : 'today';
  const next =
    e.key === 'Home'
      ? TABS[0]
      : e.key === 'End'
        ? TABS[TABS.length - 1]
        : TABS[(TABS.indexOf(from) + step + TABS.length) % TABS.length];
  showTab(next);
  const button = document.querySelector('#tabBar [data-tab="' + next + '"]');
  if (button) button.focus();
});

/* ---------------- v1.10: backups ----------------
   Export downloads a JSON copy; import replaces everything after one
   confirmation; reset asks twice. No native confirm() popups. */
$('exportBtn').addEventListener('click', async () => {
  try {
    const ex = await send({ type: 'exportData' });
    if (!(ex && ex.ok)) throw new Error('export failed');
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const day = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = 'code-dojo-backup-' + day + '.json';
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 800);
    $('backupNote').textContent = 'Backup downloaded — keep it somewhere safe.';
  } catch (_) {
    $('backupNote').textContent = 'Export failed — reload the extension and try again.';
  }
});

let pendingImport = null;
$('importBtn').addEventListener('click', () => $('importInput').click());

$('importInput').addEventListener('change', async (e) => {
  pendingImport = null;
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || parsed.app !== 'code-dojo' || !parsed.data || typeof parsed.data !== 'object') {
      throw new Error('not a backup');
    }
    pendingImport = parsed.data;
    const when = parsed.exportedAt
      ? new Date(parsed.exportedAt).toLocaleDateString()
      : 'an unknown date';
    $('importLabel').textContent = 'Backup from ' + when + ' — replace everything?';
    $('importConfirm').hidden = false;
    $('backupNote').textContent = 'Backup looks valid — confirm to replace, or cancel.';
  } catch (_) {
    $('importConfirm').hidden = true;
    $('backupNote').textContent = 'That file is not a Code Dojo backup.';
  }
});

$('importGo').addEventListener('click', async () => {
  if (!pendingImport) return;
  const r = await send({ type: 'importData', data: pendingImport });
  $('importConfirm').hidden = true;
  if (r && r.ok) {
    pendingImport = null;
    await reload();
    $('backupNote').textContent = 'Backup restored.';
  } else {
    $('backupNote').textContent = (r && r.error) || 'Import failed — nothing changed.';
  }
});

$('importCancel').addEventListener('click', () => {
  pendingImport = null;
  $('importConfirm').hidden = true;
  $('backupNote').textContent = 'Import cancelled — nothing changed.';
});

let resetTimer = null;
$('resetBtn').addEventListener('click', async () => {
  if (!resetTimer) {
    $('resetBtn').textContent = 'Really wipe everything? Click again to confirm';
    $('resetBtn').classList.add('armed');
    resetTimer = setTimeout(() => {
      resetTimer = null;
      $('resetBtn').textContent = 'Reset all progress';
      $('resetBtn').classList.remove('armed');
    }, 4000);
    return;
  }
  clearTimeout(resetTimer);
  resetTimer = null;
  $('resetBtn').textContent = 'Reset all progress';
  $('resetBtn').classList.remove('armed');
  await send({ type: 'resetAll' });
  await reload();
  $('backupNote').textContent = 'All progress was reset.';
});

/* always open on Today */
showTab('today');
void reload();
