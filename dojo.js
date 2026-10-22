/* ============================================================
   Code Dojo - MV3 service worker
   Streaks, XP, levels, leagues, daily quests, reminders,
   Odin Project auto-practice + usual-time learning.
   Everything is local; there is no account and no server.
   ============================================================ */

'use strict';

/* ---------------- rules of the game ---------------- */
const ALARM_MIDNIGHT = 'dojo-midnight';
const ALARM_REMINDER = 'dojo-reminder';
const ALARM_USUAL = 'dojo-usual'; // retired in v1.7 - only cleared, never scheduled
const ALARM_AWAY = 'dojo-away'; // "coding elsewhere" heartbeat (VS Code etc.)
const DAY = 86400000;

/* v1.3 learning notes, v1.8 reviewed: a note is a mini learning exercise now.
   The on-device model answers four yes/no checks and PLAIN CODE does the math -
   the model never decides points. A perfect note (20 XP) still pays less than
   the 15-minute minimum session (30 XP): verified practice beats typed text.
   Review unavailable (no on-device model)? A conservative flat base, capped. */
const NOTE_XP_PER_CHECK = 5; // 4 checks -> 0/5/10/15/20
const NOTE_MAX_XP = NOTE_XP_PER_CHECK * 4;
const NOTE_BASE_XP = 5; // no on-device model: the honest floor, not a jackpot
const NOTE_CAP = 2; // paying notes per day
const NOTE_MIN = 15; // characters - "i did stuff" does not pay
const NOTE_CHECK_KEYS = ['concept', 'ownWords', 'example', 'unsure'];

/* v1.5 on-device quiz, v1.7 honest scale: XP follows the grader's verdict.
   A correct answer out-earns a learning note; typed text that proves nothing
   earns nothing. */
const QUIZ_XP_CORRECT = 25;
const QUIZ_XP_PARTIAL = 10;
const QUIZ_DAY_MAX = 3; // paying answers per day (75 XP ceiling)

/* v1.7 retry queue: wrong/partial quiz answers come back tomorrow */
const REQUEUE_MAX = 12; // questions remembered at once
const REQUEUE_DAYS = 7; // older than this, the lesson has moved on

/* v1.10 backup: the keys Settings -> Export/Import cover (import replaces
   them wholesale; unknown keys in a file are ignored) */
const BACKUP_KEYS = ['profile', 'daily', 'quests', 'notes', 'odin', 'away', 'requeue', 'struggles', 'settings', 'lastAward'];

const LEAGUES = [
  { name: 'Bronze', xp: 0 },
  { name: 'Silver', xp: 150 },
  { name: 'Gold', xp: 400 },
  { name: 'Platinum', xp: 900 },
  { name: 'Sapphire', xp: 1800 },
  { name: 'Emerald', xp: 3200 },
  { name: 'Ruby', xp: 5000 },
  { name: 'Diamond', xp: 7500 },
  { name: 'Legendary', xp: 11000 },
];

/* level n starts at 100 * (n-1)^2 XP: L2=100, L3=400, L4=900 ... */
function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
function xpForLevel(level) {
  return 100 * Math.pow(level - 1, 2);
}

/* quest pool - 3 are picked every day, deterministically.
   v1.2: generic quizzes and flashcards are gone; everything is earned by
   real focused time (in the big screen's focus room, or on the Odin Project).
   v1.5: the quiz quest pays for an on-device quiz built from the real
   lesson you were on - not a generic question bank. */
const QUEST_POOL = [
  { id: 'xp50', title: 'Earn 50 XP', track: 'xp', target: 50, reward: 20 },
  { id: 'xp120', title: 'Earn 120 XP', track: 'xp', target: 120, reward: 40 },
  { id: 'min15', title: 'Practice 15 minutes', track: 'minutes', target: 15, reward: 25 },
  { id: 'min45', title: 'Practice 45 minutes', track: 'minutes', target: 45, reward: 45 },
  { id: 'focus1', title: 'Finish a 25-minute focus session', track: 'focus', target: 1, reward: 40 },
  { id: 'focus2', title: 'Finish two focus sessions', track: 'focus', target: 2, reward: 60 },
  { id: 'odin25', title: 'Code 25 min on Odin Project', track: 'odin', target: 25, reward: 35 },
  { id: 'odin50', title: 'Code 50 min on Odin Project', track: 'odin', target: 50, reward: 60 },
  { id: 'note1', title: 'Log one learning note', track: 'notes', target: 1, reward: NOTE_MAX_XP }, // same number as a perfect note
  { id: 'quiz1', title: 'Take an on-device lesson quiz', track: 'quiz', target: 1, reward: 30 },
];

const DEFAULT_SETTINGS = { dailyGoalMinutes: 15, reminderHour: 20, sound: true, practiceNudge: true, bigScreen: 'tab' };

/* ---------------- utils ---------------- */
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterdayKey() {
  return dateKey(new Date(Date.now() - DAY));
}
function nextLocalMidnight(now = Date.now()) {
  const n = new Date(now);
  n.setHours(24, 0, 0, 0);
  return n.getTime();
}
function nextHour(h, now = Date.now()) {
  const n = new Date(now);
  n.setHours(h, 0, 0, 0);
  if (n.getTime() <= now) n.setDate(n.getDate() + 1);
  return n.getTime();
}

/* serialize every storage mutation */
let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/* ---------------- state ---------------- */
async function getProfile() {
  const { profile } = await chrome.storage.local.get('profile');
  return (
    profile || {
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastDay: null,
      freezes: 1,
      createdAt: Date.now(),
    }
  );
}

/* v1.3 learning notes: what you learned, in your own words */
async function getNotes() {
  const { notes } = await chrome.storage.local.get('notes');
  return Array.isArray(notes) ? notes : [];
}

/* v1.8 note review: points live HERE only - the review page sends checks,
   the worker does the math, the cap and the anti-gaming. */
function notePoints(n) {
  if (n && typeof n.points === 'number') return n.points;
  return n && n.paid ? NOTE_MAX_XP : 0; // notes from before v1.8
}

function checksPassed(checks) {
  if (!checks || typeof checks !== 'object') return 0;
  return NOTE_CHECK_KEYS.filter((k) => checks[k] === true).length;
}

function normalizeNoteChecks(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of NOTE_CHECK_KEYS) out[k] = c[k] === true;
  return out;
}

/* v1.9: short notes cannot claim checks they have no words for - a two-word
   fragment cannot include an example or an open question. Mirrors notes.js
   (the popup applies the same cap for display; the worker is the referee
   that decides payment). */
function noteWordCount(s) {
  return String(s || '')
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
}
function noteCapFor(text) {
  const w = noteWordCount(text);
  if (w >= 15) return 4;
  if (w >= 10) return 3;
  if (w >= 5) return 2;
  return 1;
}
function applyNoteCaps(checks, text) {
  let room = noteCapFor(text);
  const out = {};
  for (const k of NOTE_CHECK_KEYS) {
    out[k] = !!(checks && checks[k] === true && room > 0);
    if (out[k]) room -= 1;
  }
  return out;
}

/* near-duplicate guard: mostly repeating an earlier note pays nothing -
   say what is new today. Jaccard over real words, last 14 days. */
function noteTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
function isNearDuplicate(text, notes) {
  const a = new Set(noteTokens(text));
  if (a.size < 3) return null;
  const cutoff = Date.now() - 14 * DAY;
  for (const n of notes.slice(0, 40)) {
    if (!n || !n.text || (n.at || 0) < cutoff) continue;
    const b = new Set(noteTokens(n.text));
    if (b.size < 3) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union >= 0.7) return n;
  }
  return null;
}

/* v1.3 away mode: "I am coding outside the browser" (VS Code, assignment
   pages...). Manual toggle + a 20-minute auto-window when you leave the
   Odin Project mid-session. Idle checks make it pause when you walk away. */
async function getAway() {
  const { away } = await chrome.storage.local.get('away');
  return away && typeof away === 'object'
    ? Object.assign({ manual: false, autoUntil: 0, lastOdin: 0 }, away)
    : { manual: false, autoUntil: 0, lastOdin: 0 };
}

function idleQueryState(seconds) {
  return new Promise((resolve) => {
    try {
      chrome.idle.queryState(seconds, (s) => resolve(s || 'active'));
    } catch (_) {
      resolve('active');
    }
  });
}

async function ensureAwayAlarm(on) {
  try {
    if (on) chrome.alarms.create(ALARM_AWAY, { periodInMinutes: 1 });
    else chrome.alarms.clear(ALARM_AWAY);
  } catch (_) {
    /* ignore */
  }
}

async function getDailyMap() {
  const { daily } = await chrome.storage.local.get('daily');
  return daily && typeof daily === 'object' ? daily : {};
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}

/* ---------------- coding-time memory (Odin Project) ----------------
   Every practice session on the Odin Project records its start hour.
   From that we learn the hour you usually code at, so the dojo can
   nudge you at *your* time instead of an arbitrary one.            */
async function getOdin() {
  const { odin } = await chrome.storage.local.get('odin');
  return odin && typeof odin === 'object'
    ? Object.assign({ starts: [], hist: new Array(24).fill(0), pendingXp: 0, last: null }, odin)
    : { starts: [], hist: new Array(24).fill(0), pendingXp: 0, last: null };
}

/* most frequent start hour with at least 2 sessions behind it */
function usualTime(odin) {
  const total = odin.starts.length;
  if (total < 2) return null;
  let best = 0;
  for (let h = 1; h < 24; h++) if (odin.hist[h] > odin.hist[best]) best = h;
  if (odin.hist[best] < 2) return null;
  return { hour: best, count: odin.hist[best], sessions: total };
}

/* v1.7 one reminder, one winner: the learned usual hour beats the fixed
   setting while the nudge is on; the fixed hour is the fallback. */
function reminderHourFor(settings, odin) {
  if (settings.practiceNudge !== false) {
    const u = usualTime(odin);
    if (u) return { hour: u.hour, learned: true };
  }
  return { hour: settings.reminderHour, learned: false };
}

/* v1.7 stretch goal: 15 min keeps the streak; the stretch is where the
   learning compounds. Always at least 45 min, whatever the goal. */
function stretchFor(goalMinutes) {
  return Math.max(45, (goalMinutes || 15) * 2);
}

/* normalize question text for retry-queue matching */
function normQ(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function questsForDay(dayKey) {
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = QUEST_POOL.slice();
  const list = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    list.push(Object.assign({}, pool.splice(h % pool.length, 1)[0], { progress: 0, done: false }));
  }
  return list;
}

async function getQuests() {
  const { quests } = await chrome.storage.local.get('quests');
  const today = dateKey();
  if (quests && quests.day === today && Array.isArray(quests.list)) return quests;
  return { day: today, list: questsForDay(today) };
}

/* ---------------- core: earning ---------------- */
/* award({ xp, minutes, focus, odin, notes, quiz, quizPaid, quiet }) - all XP
   comes from real focused time or graded answers. quiet: the page shows its
   own celebration toast. */
async function award(payload) {
  const today = dateKey();
  const profile = await getProfile();
  const dailyMap = await getDailyMap();
  const quests = await getQuests();
  const settings = await getSettings();

  const today0 = profile.xp;
  let day = dailyMap[today] || (dailyMap[today] = { xp: 0, minutes: 0, focus: 0, odin: 0, away: 0, notes: 0, quiz: 0, quizPaid: 0, goalDone: false, stretchDone: false });

  // streak: first activity of the day. v1.11: a clock that moved backwards
  // (timezone hop, manual change) is never punished - the streak is kept and
  // the day is re-anchored instead of reset to 1. The freeze reward belongs
  // to a day that actually advanced.
  if (profile.lastDay !== today) {
    if (profile.lastDay && profile.lastDay > today) {
      profile.lastDay = today;
    } else {
      profile.streak = profile.lastDay === yesterdayKey() ? profile.streak + 1 : 1;
      profile.lastDay = today;
      if (profile.streak > 0 && profile.streak % 7 === 0) {
        profile.freezes = Math.min(3, (profile.freezes || 0) + 1); // streak reward
      }
    }
    profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
  }

  const add = (n) => {
    if (!(n > 0)) return;
    profile.xp += n;
    day.xp += n;
  };

  /* v1.10: minutes pay 2 XP each up to the stretch threshold, then half - and
     the WORKER applies the rate, so no page can farm full price past the
     stretch. day.overMin is the discount the day still owes in minutes:
     Odin/away settle theirs as they tick, and a finished focus session
     settles from payload.session (its minutes were already heartbeated in
     without XP, so the session is rated by where it started). */
  const stretch = stretchFor(settings.dailyGoalMinutes);
  const minsBefore = +(day.minutes || 0);
  const minsAdded = Math.max(0, payload.minutes || 0);
  let minuteXp = Math.max(0, payload.xp | 0);
  let overChunk = 0;
  if (minsAdded > 0 && (payload.odin || payload.away)) {
    overChunk = Math.max(0, minsBefore + minsAdded - Math.max(minsBefore, stretch));
  } else if (payload.session > 0 && minuteXp > 0) {
    const s = Math.min(600, Math.max(0, payload.session || 0));
    const start = Math.max(0, minsBefore - s);
    overChunk = Math.max(0, start + s - Math.max(start, stretch));
  }
  if (overChunk > 0) {
    day.overMin = +((day.overMin || 0) + overChunk).toFixed(2);
    const owed = Math.floor(day.overMin);
    if (minuteXp > 0 && owed > 0) {
      const use = Math.min(owed, minuteXp);
      minuteXp -= use;
      day.overMin = +(day.overMin - use).toFixed(2);
    }
  }
  add(minuteXp);
  day.minutes = +(minsBefore + minsAdded).toFixed(2);
  day.odin = +((day.odin || 0) + Math.max(0, payload.odin || 0)).toFixed(2);
  day.away = +((day.away || 0) + Math.max(0, payload.away || 0)).toFixed(2);
  day.focus += Math.max(0, payload.focus | 0);
  day.notes += Math.max(0, payload.notes | 0);
  day.quiz = (day.quiz || 0) + Math.max(0, payload.quiz | 0);
  day.quizPaid = (day.quizPaid || 0) + Math.max(0, payload.quizPaid | 0);

  // daily goal bonus
  let goalHit = false;
  if (!day.goalDone && day.minutes >= settings.dailyGoalMinutes) {
    day.goalDone = true;
    goalHit = true;
    add(10);
  }

  // stretch goal: the goal is the streak's business; past it, the stretch is
  // where 58 minutes stops looking like 15. Feedback only - no XP attached.
  let stretchHit = false;
  if (!day.stretchDone && day.minutes >= stretch) {
    day.stretchDone = true;
    stretchHit = true;
  }

  // quests (a quest reward may complete another quest - loop until stable)
  const deltas = {
    xp: day.xp,
    minutes: day.minutes,
    focus: day.focus,
    odin: day.odin || 0,
    notes: day.notes || 0,
    quiz: day.quiz || 0,
  };
  const finished = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of quests.list) {
      if (q.done) continue;
      q.progress = Math.min(q.target, deltas[q.track] || 0);
      if (q.progress >= q.target) {
        q.done = true;
        add(q.reward);
        deltas.xp = day.xp;
        finished.push(q.title);
        changed = true;
      }
    }
  }

  const level = levelFor(profile.xp);
  const leveledUp = level > levelFor(today0);

  await chrome.storage.local.set({ profile, daily: pruneDaily(dailyMap), quests, lastAward: Date.now() });
  // celebrations: the focus room and the Odin page show their own toasts
  // ("quiet" awards), everything else gets a notification
  if (!payload.quiet) {
    if (goalHit) void notify('Daily goal complete 🔥', `${profile.streak}-day streak safe. Keep going!`);
    if (leveledUp) void notify(`⚡ Level ${level} unlocked`, `That is ${profile.xp} XP total — keep the streak fed.`);
    if (finished.length) void notify('Quest complete ✅', `${finished.join(' · ')} — reward banked.`);
  }

  return { ok: true, xpGained: profile.xp - today0, minuteXp, goalHit, stretchHit, stretch, leveledUp, level, streak: profile.streak, questsDone: finished, today: day, profile };
}

function pruneDaily(map) {
  const keys = Object.keys(map).sort();
  while (keys.length > 120) delete map[keys.shift()];
  return map;
}

/* hubAward({ kind }) - the big screen's capped side-game pays into the real
   economy: a correct syntax drill is a graded rep the worker rates (+5 XP,
   three a day) and the daily boss strike is a claim recorded for the raid the
   big screen derives. Neither is streak activity: drills never count as
   focused minutes, and lastDay/quests/lastAward stay exactly as award left
   them, so a drill can never keep a streak alive. */
async function hubAward(payload) {
  const kind = payload && payload.kind;
  const today = dateKey();
  const profile = await getProfile();
  const dailyMap = await getDailyMap();
  const day = dailyMap[today] || (dailyMap[today] = { xp: 0, minutes: 0, focus: 0, odin: 0, away: 0, notes: 0, quiz: 0, quizPaid: 0, goalDone: false, stretchDone: false });

  if (kind === 'drill') {
    const used = Math.min(3, Math.max(0, day.drills | 0));
    if (used >= 3) return { ok: true, xp: 0, drillsLeft: 0 };
    const before = profile.xp;
    day.drills = used + 1;
    profile.xp = before + 5;
    day.xp += 5;
    await chrome.storage.local.set({ profile, daily: pruneDaily(dailyMap) });
    const level = levelFor(profile.xp);
    if (level > levelFor(before))
      void notify(`⚡ Level ${level} unlocked`, `That is ${profile.xp} XP total — keep the streak fed.`);
    return { ok: true, xp: 5, drillsLeft: 3 - day.drills };
  }

  if (kind === 'strike') {
    if (!day.goalDone) return { ok: false, reason: 'goal' };
    if ((day.bossStrikes | 0) >= 1) return { ok: false, reason: 'claimed' };
    day.bossStrikes = 1;
    await chrome.storage.local.set({ daily: pruneDaily(dailyMap) });
    return { ok: true };
  }

  return { ok: false, reason: 'kind' };
}

/* ---------------- rollover + reminders ---------------- */
async function rollover() {
  const today = dateKey();
  const quests = await getQuests(); // regenerates itself for a new day
  const profile = await getProfile();
  const settings = await getSettings();
  const dailyMap = await getDailyMap();

  // A full day passed with no practice -> the streak is gone, or a freeze
  // covers the miss. v1.11: consuming a freeze re-anchors lastDay to
  // yesterday, so one missed day burns exactly ONE freeze however often the
  // worker wakes, and resuming practice continues the streak instead of
  // silently resetting it to 1.
  if (profile.lastDay && profile.lastDay < yesterdayKey()) {
    if ((profile.freezes || 0) > 0) {
      profile.freezes -= 1;
      profile.lastDay = yesterdayKey();
      await notify('Streak freeze used 🧊', `You missed a day. ${profile.freezes} freeze(s) left.`);
    } else if (profile.streak > 0) {
      profile.streak = 0;
      await notify('Streak lost 💔', 'Start again today - one practice session puts you back on track.');
    }
  }

  await chrome.storage.local.set({ profile, quests, daily: pruneDaily(dailyMap) });
  await scheduleAlarms(settings);
}

async function scheduleAlarms(settings) {
  try {
    chrome.alarms.create(ALARM_MIDNIGHT, { when: nextLocalMidnight() });
    // v1.7: ONE reminder, at the hour that wins - the learned usual time
    // while the nudge is on, otherwise the fixed setting. The old separate
    // "usual time" alarm is retired: two alarms meant two notifications.
    const eff = reminderHourFor(settings, await getOdin());
    chrome.alarms.create(ALARM_REMINDER, { when: nextHour(eff.hour) });
    chrome.alarms.clear(ALARM_USUAL);
  } catch (_) {
    /* ignore */
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 1,
    });
  } catch (_) {
    /* ignore */
  }
}

/* ---------------- reports ---------------- */
function weekKeys() {
  const keys = [];
  for (let i = 6; i >= 0; i--) keys.push(dateKey(new Date(Date.now() - i * DAY)));
  return keys;
}

function weekXp(dailyMap, startDaysAgo, span) {
  let sum = 0;
  for (let i = startDaysAgo; i < startDaysAgo + span; i++) {
    const k = dateKey(new Date(Date.now() - i * DAY));
    sum += (dailyMap[k] || {}).xp || 0;
  }
  return sum;
}

async function buildReport() {
  const [profile, dailyMap, quests, settings, odin] = await Promise.all([
    getProfile(),
    getDailyMap(),
    getQuests(),
    getSettings(),
    getOdin(),
  ]);
  const today = dateKey();

  const level = levelFor(profile.xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);

  const week = weekKeys().map((k) => ({
    day: k,
    minutes: (dailyMap[k] || {}).minutes || 0,
    xp: (dailyMap[k] || {}).xp || 0,
    complete: ((dailyMap[k] || {}).minutes || 0) >= settings.dailyGoalMinutes,
  }));

  const thisWeekXp = weekXp(dailyMap, 0, 7);
  let li = 0;
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (thisWeekXp >= LEAGUES[i].xp) { li = i; break; }
  }
  const nextLeague = LEAGUES[li + 1] || null;

  // "you beat N of your last 8 weeks"
  const past = [];
  for (let w = 0; w < 8; w++) past.push(weekXp(dailyMap, 7 + w * 7, 7));
  const beaten = past.filter((x) => thisWeekXp > x && x > 0).length;

  const usual = usualTime(odin);
  const todayObj = dailyMap[today] || { xp: 0, minutes: 0, focus: 0, odin: 0, away: 0, notes: 0, quiz: 0, quizPaid: 0, goalDone: false, stretchDone: false };
  const [allNotes, away] = await Promise.all([getNotes(), getAway()]);
  const paidToday = allNotes.filter((n) => n.day === today && notePoints(n) > 0).length;

  return {
    ok: true,
    profile,
    today: todayObj,
    stretch: stretchFor(settings.dailyGoalMinutes),
    reminder: reminderHourFor(settings, odin),
    odin: {
      usual,
      todayMinutes: todayObj.odin || 0,
      last: odin.last,
      sessions: odin.starts.length,
    },
    notes: allNotes.slice(0, 6),
    noteCap: NOTE_CAP,
    noteMaxXp: NOTE_MAX_XP,
    noteXpPerCheck: NOTE_XP_PER_CHECK,
    noteMin: NOTE_MIN,
    paidToday,
    away: {
      manual: !!away.manual,
      autoLeft: Math.max(0, (away.autoUntil || 0) - Date.now()),
      minutes: todayObj.away || 0,
    },
    quests,
    week,
    league: {
      index: li,
      name: LEAGUES[li].name,
      thisWeekXp,
      next: nextLeague ? { name: nextLeague.name, needed: nextLeague.xp - thisWeekXp } : null,
      beaten,
      history: past,
    },
    level: { n: level, into: profile.xp - cur, need: next - cur, pct: Math.round(((profile.xp - cur) / (next - cur)) * 100) },
    settings,
    now: Date.now(),
  };
}

/* ---------------- settings / maintenance ---------------- */
async function setSettings(patch) {
  const settings = Object.assign({}, await getSettings(), patch || {});
  await chrome.storage.local.set({ settings });
  await scheduleAlarms(settings);
  return { ok: true, settings };
}

/* ---------------- messaging ---------------- */
/* v1.17: the big screen IS the focus surface - the popup's Start button
   and a reminder-notification click land here, at #focus. Open the web
   workspace as a plain tab (the default) or a fullscreen window, whatever
   the setting says. An already-open big screen is focused - and steered
   back to the focus room if the reader had wandered - instead of
   duplicated, the way the quiz tab already works. The v1.15 "off" choice
   is retired: with no small-screen timer left, "off" would mean Start
   opens nothing, so a stored "off" is treated as "tab". */
async function openBigScreen() {
  const settings = await getSettings();
  const mode = settings.bigScreen === 'fullscreen' ? 'fullscreen' : 'tab';
  const url = chrome.runtime.getURL('screen/index.html#focus');
  let bigScreenTabId = null;
  try {
    ({ bigScreenTabId } = await chrome.storage.session.get('bigScreenTabId'));
  } catch (_) {
    bigScreenTabId = null;
  }
  if (bigScreenTabId) {
    try {
      await chrome.tabs.update(bigScreenTabId, { active: true });
      try {
        const tab = await chrome.tabs.get(bigScreenTabId);
        if (tab && tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        if (tab && typeof tab.url === 'string' && tab.url.indexOf('#focus') < 0) {
          await chrome.tabs.update(bigScreenTabId, { url });
        }
      } catch (_) {
        /* window focus and the #focus steer are best-effort */
      }
      return { ok: true, reused: true };
    } catch (_) {
      /* the tab is gone - open a fresh one below */
    }
  }
  if (mode === 'fullscreen') {
    try {
      const win = await chrome.windows.create({ url, state: 'fullscreen', focused: true });
      const first = win && win.tabs && win.tabs[0];
      if (first && first.id) {
        try {
          await chrome.storage.session.set({ bigScreenTabId: first.id });
        } catch (_) {
          /* session storage is best-effort here */
        }
      }
      return { ok: true, fullscreen: true };
    } catch (_) {
      /* no windows API on this platform - a plain tab still works */
    }
  }
  const tab = await chrome.tabs.create({ url });
  if (tab && tab.id) {
    try {
      await chrome.storage.session.set({ bigScreenTabId: tab.id });
    } catch (_) {
      /* session storage is best-effort here */
    }
  }
  return { ok: true };
}

async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'sessionStarted':
    case 'openBigScreen':
      return openBigScreen();
    case 'getState':
      return buildReport();
    case 'odinStart': {
      // a practice session began on the Odin Project - remember its start hour
      const start = Number(msg.start) || Date.now();
      return enqueue(async () => {
        const odin = await getOdin();
        if (!odin.starts.includes(start)) odin.starts.push(start);
        if (odin.starts.length > 40) odin.starts = odin.starts.slice(-40);
        odin.hist = new Array(24).fill(0);
        for (const s of odin.starts) odin.hist[new Date(s).getHours()] += 1;
        await chrome.storage.local.set({ odin });
        await scheduleAlarms(await getSettings());
        return { ok: true, usual: usualTime(odin) };
      });
    }
    case 'odinTick': {
      // active seconds accrued by the Odin content script -> XP + goal minutes
      const seconds = Math.max(0, msg.seconds | 0);
      if (seconds < 1) return { ok: true, skipped: true };
      return enqueue(async () => {
        const minutes = +(seconds / 60).toFixed(3);
        const odin = await getOdin();
        odin.pendingXp = (odin.pendingXp || 0) + minutes * 2; // 2 XP per focused minute
        const whole = Math.floor(odin.pendingXp);
        odin.pendingXp -= whole;
        const away = await getAway();
        away.lastOdin = Date.now(); // a live Odin session - assignment links may follow
        await chrome.storage.local.set({ odin, away });
        const res = await award({ xp: whole, minutes, odin: minutes, quiet: true });
        return Object.assign(res, { banked: whole });
      });
    }
    case 'odinEnd': {
      // session finished (tab closed / navigated away) - remember its length
      const minutes = +(msg.minutes || 0).toFixed(1);
      return enqueue(async () => {
        const odin = await getOdin();
        odin.last = { ts: Date.now(), minutes };
        await chrome.storage.local.set({ odin });
        return { ok: true };
      });
    }
    case 'award':
      return enqueue(() => award(msg.payload || {}));
    case 'hubAward':
      return enqueue(() => hubAward(msg));
    case 'saveNote': {
      // v1.3 learning note, v1.8: saved first, reviewed after. XP comes only
      // from reviewNote - the page never names its own price.
      const text = String(msg.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      if (text.length < NOTE_MIN) {
        return { ok: false, error: `Say what you learned - at least ${NOTE_MIN} characters.` };
      }
      return enqueue(async () => {
        const today = dateKey();
        const notes = await getNotes();
        const dup = isNearDuplicate(text, notes);
        const note = {
          at: Date.now(),
          day: today,
          text,
          points: 0,
          paid: false,
          reviewed: false,
          revisions: 0,
          duplicate: !!dup,
          dupOf: dup ? dup.day : null,
        };
        notes.unshift(note);
        while (notes.length > 60) notes.pop();
        await chrome.storage.local.set({ notes });
        const res = await award({ notes: 1 }); // streak + quest credit; XP waits for the review
        return Object.assign(res, { ok: true, note, duplicate: !!dup });
      });
    }
    case 'reviewNote': {
      // the popup ran the on-device review; the worker does the math, the cap
      // and the anti-gaming. checks=null + unavailable means no model.
      const at = Number(msg.at) || 0;
      const unavailable = !!msg.unavailable;
      const checks = normalizeNoteChecks(msg.checks);
      const comment = String(msg.comment || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      const rewrite = String(msg.rewrite || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const revised = !!msg.revised;
      const revisedText = String(msg.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      if (!unavailable && !checks) return { ok: false, error: 'No checks in the review.' };
      return enqueue(async () => {
        const notes = await getNotes();
        const note = notes.find((n) => n.at === at);
        if (!note) return { ok: false, error: 'Note not found.' };
        if (note.duplicate) return { ok: true, points: 0, delta: 0, capped: false, duplicate: true, passed: 0 };
        const today = dateKey();
        const current = notePoints(note);
        const othersPaid = notes.filter((n) => n.at !== note.at && n.day === today && notePoints(n) > 0).length;
        const room = NOTE_CAP - othersPaid;
        const had = current > 0;

        if (!note.reviewed) {
          // first review: the model's checks (or the base rate) set the points.
          // v1.9: the note's own words cap the checks - a 2-word note cannot
          // pass 4, however friendly the model feels.
          const shown = unavailable ? null : applyNoteCaps(checks, note.text);
          const passed = shown ? checksPassed(shown) : null;
          let points = unavailable ? NOTE_BASE_XP : passed * NOTE_XP_PER_CHECK;
          let capped = false;
          if (points > 0 && room <= 0) {
            points = 0;
            capped = true;
          }
          note.points = points;
          note.paid = points > 0;
          note.reviewed = true;
          if (!unavailable) note.review = { checks: shown, comment, rewrite, passed, at: Date.now() };
          await chrome.storage.local.set({ notes });
          if (points > 0) await award({ xp: points });
          return { ok: true, points, delta: points, capped, duplicate: false, passed, base: unavailable };
        }

        // one revision: earn the difference, and only if it improves
        if (!revised) return { ok: true, points: current, delta: 0, reason: 'already reviewed' };
        if (note.revisions >= 1) return { ok: true, points: current, delta: 0, reason: 'revision already used' };
        if (unavailable || !checks) return { ok: true, points: current, delta: 0, reason: 'no checks' };
        const textUsed = revisedText.length >= NOTE_MIN ? revisedText : note.text;
        const shown = applyNoteCaps(checks, textUsed);
        const newPassed = checksPassed(shown);
        let delta = Math.max(0, newPassed * NOTE_XP_PER_CHECK - current);
        let capped = false;
        if (delta > 0 && !had && room <= 0) {
          delta = 0;
          capped = true;
        }
        note.revisions = 1;
        note.review = { checks: shown, comment, rewrite, passed: newPassed, at: Date.now() };
        if (delta > 0) {
          note.points = current + delta;
          note.paid = true;
          // the rewrite becomes the note; the first version is kept for reference
          if (revisedText.length >= NOTE_MIN) {
            note.firstText = note.firstText || note.text;
            note.text = revisedText;
          }
        }
        await chrome.storage.local.set({ notes });
        if (delta > 0) await award({ xp: delta });
        return { ok: true, points: note.points, delta, capped, passed: newPassed, improved: delta > 0 };
      });
    }
    case 'setAway': {
      // "I am coding outside the browser" (VS Code, assignment pages...)
      const on = !!msg.on;
      return enqueue(async () => {
        const away = await getAway();
        away.manual = on;
        away.since = on ? Date.now() : away.since || 0;
        await chrome.storage.local.set({ away });
        await ensureAwayAlarm(on || away.autoUntil > Date.now());
        return { ok: true, away: { manual: !!away.manual, autoLeft: Math.max(0, away.autoUntil - Date.now()) } };
      });
    }
    case 'odinNav': {
      // clicked through to an external assignment page mid-session:
      // keep counting for the 20-minute continuity window
      return enqueue(async () => {
        const away = await getAway();
        if (Date.now() - (away.lastOdin || 0) > 120000) return { ok: true, skipped: 'no live session' };
        away.autoUntil = Math.max(away.autoUntil || 0, Date.now() + 20 * 60000);
        await chrome.storage.local.set({ away });
        await ensureAwayAlarm(true);
        return { ok: true, autoLeft: away.autoUntil - Date.now() };
      });
    }
    case 'setQuizContext': {
      // v1.5: odin.js captures the lesson that is on screen; the quiz page
      // (and only it) reads this back to build questions from THAT lesson
      const c = msg.context;
      if (!c || !c.title) return { ok: false, error: 'no context' };
      const context = {
        title: String(c.title).slice(0, 160),
        headings: String(c.headings || '').slice(0, 400),
        code: String(c.code || '').slice(0, 800),
        url: String(c.url || '').slice(0, 300),
        at: Date.now(),
      };
      await chrome.storage.local.set({ quizContext: context });
      return { ok: true };
    }
    case 'openQuiz': {
      // reuse the existing quiz tab when there is one - the popup button and
      // the on-page 🧠 button must not pile up duplicate tabs
      const url = chrome.runtime.getURL('quiz.html');
      let quizTabId = null;
      try {
        ({ quizTabId } = await chrome.storage.session.get('quizTabId'));
      } catch (_) {
        quizTabId = null;
      }
      if (quizTabId) {
        try {
          await chrome.tabs.update(quizTabId, { active: true });
          return { ok: true, reused: true };
        } catch (_) {
          /* tab is gone - fall through and open a fresh one */
        }
      }
      const tab = await chrome.tabs.create({ url });
      if (tab && tab.id) {
        try {
          await chrome.storage.session.set({ quizTabId: tab.id });
        } catch (_) {
          /* session storage is best-effort here */
        }
      }
      return { ok: true };
    }
    case 'quizAward': {
      // grading happened on-device in the quiz page; the worker decides the
      // XP from the verdicts (and the daily cap) so the page can never
      // overpay: correct 25, partial 10, wrong/blank nothing.
      const verdicts = (Array.isArray(msg.verdicts) ? msg.verdicts : [])
        .slice(0, 9)
        .map((v) => (v === 'correct' || v === 'partial' ? v : 'wrong'));
      const answered = Math.max(0, Math.min(9, msg.answered | 0));
      if (!answered) return { ok: true, paid: 0, xpForQuiz: 0, answered: 0 };
      return enqueue(async () => {
        const dailyMap = await getDailyMap();
        const room = Math.max(0, QUIZ_DAY_MAX - ((dailyMap[dateKey()] || {}).quizPaid || 0));
        let paid = 0;
        let xp = 0;
        for (const v of verdicts) {
          if (v === 'wrong' || paid >= room) continue;
          paid += 1;
          xp += v === 'correct' ? QUIZ_XP_CORRECT : QUIZ_XP_PARTIAL;
        }
        const res = await award({ xp, quiz: answered, quizPaid: paid, quiet: true });
        return Object.assign(res, { ok: true, paid, xpForQuiz: xp, answered });
      });
    }
    case 'quizRequeue': {
      // v1.7: a wrong or partial answer comes back in tomorrow's quiz.
      // A retry that is finally correct leaves the queue for good; one that
      // is missed again waits for the next day. Items expire after a week.
      const items = Array.isArray(msg.items) ? msg.items.slice(0, 12) : [];
      if (!items.length) return { ok: true, pending: 0, queued: 0, resolved: 0 };
      return enqueue(async () => {
        const { requeue } = await chrome.storage.local.get('requeue');
        const now = Date.now();
        const today = dateKey();
        const list = (Array.isArray(requeue) ? requeue : []).filter(
          (it) => it && it.q && now - (it.at || 0) < REQUEUE_DAYS * DAY
        );
        const keep = [];
        let resolved = 0;
        for (const it of list) {
          const item = items.find((x) => normQ(x.q) === normQ(it.q));
          if (item && item.retry && item.verdict === 'correct') {
            resolved += 1;
            continue; // fixed - gone
          }
          if (item && item.retry) {
            it.day = today; // missed again - back tomorrow
            it.at = now;
            it.tries = (it.tries || 0) + 1;
          }
          keep.push(it);
        }
        const known = new Set(keep.map((it) => normQ(it.q)));
        let queued = 0;
        for (const item of items) {
          if (item.retry || item.verdict === 'correct') continue;
          const key = normQ(item.q);
          if (!key || known.has(key)) continue;
          known.add(key);
          queued += 1;
          keep.push({
            q: String(item.q).slice(0, 320),
            hint: String(item.hint || '').slice(0, 200),
            topic: String(item.topic || '').slice(0, 120),
            day: today,
            at: now,
            tries: 0,
          });
        }
        keep.sort((a, b) => (b.at || 0) - (a.at || 0));
        while (keep.length > REQUEUE_MAX) keep.pop();
        await chrome.storage.local.set({ requeue: keep });
        return { ok: true, pending: keep.length, queued, resolved };
      });
    }
    case 'saveStruggle': {
      // v1.7 end-of-session "what couldn't you do today?" - tomorrow's quiz
      // turns it into at least one question. Small, local, capped at 5.
      const text = String(msg.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      if (text.length < 5) {
        return { ok: false, error: 'Say it in a few words - at least 5 characters.' };
      }
      return enqueue(async () => {
        const { struggles } = await chrome.storage.local.get('struggles');
        const list = Array.isArray(struggles) ? struggles : [];
        list.unshift({ at: Date.now(), day: dateKey(), text, used: false });
        while (list.length > 5) list.pop();
        await chrome.storage.local.set({ struggles: list });
        return { ok: true, text };
      });
    }
    case 'consumeStruggle': {
      // a quiz has just included the struggle - it has served its purpose
      const at = Number(msg.at) || 0;
      return enqueue(async () => {
        const { struggles } = await chrome.storage.local.get('struggles');
        const list = Array.isArray(struggles) ? struggles : [];
        let hit = false;
        for (const s of list) {
          if (!s.used && (!at || s.at === at)) {
            s.used = true;
            hit = true;
            break;
          }
        }
        await chrome.storage.local.set({ struggles: list });
        return { ok: true, hit };
      });
    }
    case 'setSettings':
      return enqueue(() => setSettings(msg.patch));
    case 'exportData': {
      // v1.10: a JSON copy of everything that matters, for safekeeping.
      // Settings -> Export in the popup downloads this.
      const data = await chrome.storage.local.get(BACKUP_KEYS);
      return {
        ok: true,
        app: 'code-dojo',
        appVersion: chrome.runtime.getManifest().version,
        exportedAt: Date.now(),
        data,
      };
    }
    case 'importData': {
      // restores a backup over the same whitelist; unknown keys are ignored
      // and a file without a numeric-xp profile is not a backup
      const incoming = msg.data;
      if (
        !incoming ||
        typeof incoming !== 'object' ||
        !incoming.profile ||
        typeof incoming.profile !== 'object' ||
        typeof incoming.profile.xp !== 'number'
      ) {
        return { ok: false, error: 'That file is missing the profile.' };
      }
      return enqueue(async () => {
        const patch = {};
        for (const k of BACKUP_KEYS) if (incoming[k] != null) patch[k] = incoming[k];
        await chrome.storage.local.remove(BACKUP_KEYS);
        await chrome.storage.local.set(patch);
        await scheduleAlarms(await getSettings());
        return { ok: true, imported: Object.keys(patch) };
      });
    }
    case 'resetAll':
      return enqueue(async () => {
        await chrome.storage.local.remove(['profile', 'daily', 'quests', 'srs', 'odin', 'notes', 'away', 'lastAward', 'quizContext', 'requeue', 'struggles']);
        await ensureAwayAlarm(false);
        return { ok: true };
      });
    default:
      return { ok: false, error: 'unknown message' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});

/* forget a closed quiz or big-screen tab so we never focus the wrong one */
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    try {
      const { quizTabId } = await chrome.storage.session.get('quizTabId');
      if (quizTabId === tabId) await chrome.storage.session.remove('quizTabId');
      const { bigScreenTabId } = await chrome.storage.session.get('bigScreenTabId');
      if (bigScreenTabId === tabId) await chrome.storage.session.remove('bigScreenTabId');
    } catch (_) {
      /* ignore */
    }
  })();
});

/* ---------------- alarms / lifecycle ---------------- */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_MIDNIGHT) {
    void enqueue(rollover);
  } else if (alarm.name === ALARM_REMINDER) {
    // fires at the one effective hour: the learned usual time when there is
    // one and the nudge is on - otherwise the fixed setting. One
    // notification a day, never two.
    void enqueue(async () => {
      const profile = await getProfile();
      const dailyMap = await getDailyMap();
      const settings = await getSettings();
      const today = dateKey();
      const done = ((dailyMap[today] || {}).minutes || 0) >= settings.dailyGoalMinutes;
      if (!done) {
        const eff = reminderHourFor(settings, await getOdin());
        if (eff.learned) {
          const hh = String(eff.hour).padStart(2, '0');
          await notify(
            `It's ${hh}:00 — your usual coding time 🥋`,
            `${settings.dailyGoalMinutes} minutes now keeps every streak alive.`
          );
        } else {
          await notify(
            profile.streak > 0 ? `${profile.streak}-day streak at risk 🔥` : 'Practice is waiting 🥋',
            `${settings.dailyGoalMinutes} minutes keeps your ${profile.streak}-day streak alive.`
          );
        }
      }
      await scheduleAlarms(settings);
    });
  } else if (alarm.name === ALARM_AWAY) {
    // v1.3 away heartbeat: count real time at the machine while away mode is on
    void enqueue(async () => {
      const away = await getAway();
      const now = Date.now();
      const active = away.manual || now < (away.autoUntil || 0);
      if (!active) {
        await ensureAwayAlarm(false);
        return;
      }
      const { lastAward = 0 } = await chrome.storage.local.get('lastAward');
      if (now - lastAward < 50000) return; // Odin or the focus page already counted this minute
      const state = await idleQueryState(60);
      if (state !== 'active') return; // away from the machine - no credit
      await award({ xp: 2, minutes: 1, away: 1 });
    });
  }
});

chrome.notifications.onClicked.addListener(() => {
  void openBigScreen();
});

async function init() {
  const settings = await getSettings();
  const quests = await getQuests();
  // v1.14 one-time migration: earlier versions persisted the old fullscreen
  // default into settings on every boot, so the quiet new-tab default would
  // never reach an existing install. Move that inherited value over exactly
  // once; a big-screen choice made in the popup afterwards is kept (the
  // flag stays written with it).
  const stored = await chrome.storage.local.get('settings');
  const raw = stored && stored.settings;
  if (!(raw && raw.bigScreenMigrated)) {
    if (!raw || !raw.bigScreen || raw.bigScreen === 'fullscreen') {
      settings.bigScreen = 'tab';
    }
    settings.bigScreenMigrated = true;
  }
  // v1.17: the "off" choice is retired - with no small-screen timer left it
  // would leave the popup's Start button with nowhere to open. Normalize it
  // on sight; the popup no longer offers it.
  if (settings.bigScreen === 'off') settings.bigScreen = 'tab';
  await chrome.storage.local.set({ settings, quests });
  await scheduleAlarms(settings);
  const away = await getAway();
  if (away.manual || Date.now() < (away.autoUntil || 0)) await ensureAwayAlarm(true);
}

/* test hook: tests set globalThis.__DOJO_TEST__ before loading this file
   (node: require() after installing the mock chrome; browser: the runner
   sets both before this script tag). In the extension nothing changes. */
if (typeof globalThis !== 'undefined' && globalThis.__DOJO_TEST__) {
  globalThis.__dojoTest = {
    award,
    hubAward,
    rollover,
    buildReport,
    handleMessage,
    notePoints,
    checksPassed,
    normalizeNoteChecks,
    noteCapFor,
    applyNoteCaps,
    noteWordCount,
    isNearDuplicate,
    questsForDay,
    levelFor,
    xpForLevel,
    stretchFor,
    usualTime,
    reminderHourFor,
    dateKey,
    pruneDaily,
    NOTE_XP_PER_CHECK,
    NOTE_MAX_XP,
    NOTE_BASE_XP,
    NOTE_CAP,
    NOTE_MIN,
    NOTE_CHECK_KEYS,
    QUIZ_XP_CORRECT,
    QUIZ_XP_PARTIAL,
    QUIZ_DAY_MAX,
    REQUEUE_MAX,
    REQUEUE_DAYS,
    LEAGUES,
    DEFAULT_SETTINGS,
    BACKUP_KEYS,
  };
} else {
  void enqueue(rollover).then(init);
}
