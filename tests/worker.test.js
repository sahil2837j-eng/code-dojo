/* worker tests: the economy (award math and the stretch discount), the
   streak / freeze honesty, note review math + caps, quiz XP + the daily
   cap, the retry queue lifecycle, struggles, backup restore and the small
   pure helpers - all against the mock chrome.
   Runs under Node (`node tests/worker.test.js`) or headless Chromium. */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;

  if (typeof module !== 'undefined' && module.exports) {
    globalThis.chrome = require('./mock-chrome.js').chrome;
    globalThis.__DOJO_TEST__ = true;
    require('../dojo.js');
  }
  const M = typeof module !== 'undefined' && module.exports ? require('./mock-chrome.js') : globalThis.MockChrome;
  const W = globalThis.__dojoTest;

  const DAY = 86400000;
  const T0 = new Date('2026-05-04T12:00:00').getTime(); // a fixed Monday

  const key = (ms) => W.dateKey(new Date(ms));
  /* deterministic awards: seed the day's quest list empty */
  const questsOff = (ms) => ({ quests: { day: key(ms), list: [] } });

  async function withClock(ms, fn) {
    const clock = T.clock(ms);
    try {
      return await fn(clock);
    } finally {
      clock();
    }
  }

  async function get(name) {
    return (await M.chrome.storage.local.get(name))[name];
  }

  T.suite('dojo.js worker');

  T.test('getState answers over the real message listener', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const r = await M.sendToWorker({ type: 'getState' });
      T.ok(r && r.ok, 'the report must come back ok');
      T.eq(r.profile.streak, 0);
      T.eq(r.today.quizPaid, 0);
      T.ok(Array.isArray(r.quests.list));
      T.eq(r.level.n, 1);
      T.eq(r.noteCap, 2);
      T.eq(r.noteXpPerCheck, 5);
    });
  });

  T.test('minutes pay 2 XP each, then the stretch discount bites - exactly once', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));

      const a = await W.award({ xp: 80, minutes: 40, quiet: true });
      T.eq(a.minuteXp, 80);
      T.eq(a.goalHit, true, 'the 15-minute goal bonus fires on the first crossing');
      T.eq(a.stretchHit, false);

      const b = await W.award({ xp: 20, minutes: 10, session: 10, quiet: true });
      T.eq(b.minuteXp, 20, 'minutes under the 45-minute stretch pay in full');
      T.eq(b.stretchHit, true);

      const c = await W.award({ xp: 20, minutes: 10, session: 10, quiet: true });
      T.eq(c.minuteXp, 15, 'the minutes past the stretch pay half');

      const d = await W.award({ xp: 2, minutes: 1, away: 1, quiet: true });
      T.eq(d.minuteXp, 1, 'away minutes settle the same way');

      const daily = (await get('daily'))[key(T0)];
      T.eq(daily.minutes, 61);
      T.eq(daily.away, 1);
      T.eq(daily.goalDone, true);
      T.eq(daily.stretchDone, true);

      const profile = await get('profile');
      T.eq(profile.xp, 126, '80 + 20 + 15 + 1 + one goal bonus');
      T.eq(profile.streak, 1);
    });
  });

  T.test('big screen drills pay +5 XP three times a day and never touch the streak', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));

      const one = await M.sendToWorker({ type: 'hubAward', kind: 'drill' });
      T.eq(one.ok, true);
      T.eq(one.xp, 5, 'a correct drill is a graded rep');
      T.eq(one.drillsLeft, 2);

      await M.sendToWorker({ type: 'hubAward', kind: 'drill' });
      const three = await M.sendToWorker({ type: 'hubAward', kind: 'drill' });
      T.eq(three.drillsLeft, 0);

      const four = await M.sendToWorker({ type: 'hubAward', kind: 'drill' });
      T.eq(four.xp, 0, 'the fourth rep pays nothing');
      T.eq((await get('daily'))[key(T0)].drills, 3, 'the counter stops at the cap');

      const profile = await get('profile');
      T.eq(profile.xp, 15, 'three reps, three payouts');
      T.eq(profile.streak, 0, 'drills are not activity: no streak');
      T.eq(profile.lastDay, null, 'and the day is not marked active');
    });
  });

  T.test('the big screen strike needs the finished goal and is claimed once', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));

      const early = await M.sendToWorker({ type: 'hubAward', kind: 'strike' });
      T.eq(early.ok, false, 'before the goal there is nothing to claim');
      T.eq(early.reason, 'goal');

      await W.award({ xp: 30, minutes: 15, quiet: true }); // the goal is met
      const before = (await get('profile')).xp;
      const landed = await M.sendToWorker({ type: 'hubAward', kind: 'strike' });
      T.eq(landed.ok, true);
      T.eq((await get('profile')).xp, before, 'the strike itself pays no XP');

      const again = await M.sendToWorker({ type: 'hubAward', kind: 'strike' });
      T.eq(again.ok, false, 'one strike a day');
      T.eq(again.reason, 'claimed');
      T.eq((await get('daily'))[key(T0)].bossStrikes, 1);
    });
  });

  T.test('the streak counts once per day and advances on consecutive days', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      await W.award({ xp: 2, minutes: 1, quiet: true });
      await W.award({ xp: 2, minutes: 1, quiet: true });
      T.eq((await get('profile')).streak, 1, 'two sessions, one day, one streak tick');
    });
    await withClock(T0 + DAY, async () => {
      const r = await W.award({ xp: 2, minutes: 1, quiet: true });
      T.eq(r.streak, 2);
      T.eq((await get('profile')).bestStreak, 2);
    });
  });

  T.test('a freeze covers one missed day - and burns exactly one freeze', async () => {
    await withClock(T0 + 2 * DAY, async () => {
      await M.fresh(
        Object.assign(questsOff(T0 + 2 * DAY), {
          profile: { xp: 50, streak: 5, bestStreak: 5, lastDay: key(T0), freezes: 2, createdAt: 0 },
        })
      );
      await W.rollover();
      await W.rollover(); // the worker wakes more than once a day
      const p1 = await get('profile');
      T.eq(p1.freezes, 1, 'one missed day burns exactly one freeze');
      T.eq(p1.streak, 5, 'the freeze keeps the streak');
      T.eq(M.chrome.notifications.created.length, 1, 'one freeze notification, not two');

      const r = await W.award({ xp: 2, minutes: 1, quiet: true });
      T.eq(r.streak, 6, 'resuming continues the streak instead of resetting it');
      const p2 = await get('profile');
      T.eq(p2.freezes, 1, 'no phantom freeze reward for day 6');
      T.eq(p2.bestStreak, 6);
    });
  });

  T.test('no freeze: the missed day resets the streak, the next rep starts at 1', async () => {
    await withClock(T0 + 2 * DAY, async () => {
      await M.fresh(
        Object.assign(questsOff(T0 + 2 * DAY), {
          profile: { xp: 50, streak: 5, bestStreak: 5, lastDay: key(T0), freezes: 0, createdAt: 0 },
        })
      );
      await W.rollover();
      T.eq((await get('profile')).streak, 0, 'no freeze -> the streak is lost');
      const r = await W.award({ xp: 2, minutes: 1, quiet: true });
      T.eq(r.streak, 1, 'the next practice starts a fresh streak');
    });
  });

  T.test('a backwards clock jump never punishes the streak', async () => {
    await withClock(T0, async () => {
      await M.fresh(
        Object.assign(questsOff(T0), {
          profile: { xp: 10, streak: 7, bestStreak: 7, lastDay: key(T0 + DAY), freezes: 1, createdAt: 0 },
        })
      );
      const r = await W.award({ xp: 2, minutes: 1, quiet: true });
      T.eq(r.streak, 7, 'a rollback keeps the streak');
      const p = await get('profile');
      T.eq(p.lastDay, key(T0), 'the day re-anchors so tomorrow continues');
      T.eq(p.freezes, 1, 'no freeze reward for a day that did not advance');
    });
  });

  T.test('saveNote: minimum length and the near-duplicate guard', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const short = await W.handleMessage({ type: 'saveNote', text: 'too short' });
      T.eq(short.ok, false);

      const a = await W.handleMessage({
        type: 'saveNote',
        text: 'I learned that map transforms arrays by applying a function',
      });
      T.eq(a.ok, true);
      T.eq(a.duplicate, false);

      const b = await W.handleMessage({
        type: 'saveNote',
        text: 'I learned that map transforms arrays by applying a function today',
      });
      T.eq(b.duplicate, true, 'mostly repeating an earlier note is flagged');
      T.eq((await get('notes')).length, 2);
    });
  });

  T.test('reviewNote without a model pays the conservative base, twice a day max', async () => {
    await withClock(T0, async (clock) => {
      await M.fresh(questsOff(T0));
      const a = await W.handleMessage({
        type: 'saveNote',
        text: 'I learned that map transforms arrays by applying a function',
      });
      clock.advance(60);
      const b = await W.handleMessage({
        type: 'saveNote',
        text: 'Flexbox aligns items along a main axis and wraps when asked',
      });
      clock.advance(60);
      const c = await W.handleMessage({
        type: 'saveNote',
        text: 'Fetch returns a promise that resolves to a response object',
      });

      const r1 = await W.handleMessage({ type: 'reviewNote', at: a.note.at, unavailable: true });
      T.eq(r1.points, 5);
      T.eq(r1.base, true);
      const r2 = await W.handleMessage({ type: 'reviewNote', at: b.note.at, unavailable: true });
      T.eq(r2.points, 5);
      const r3 = await W.handleMessage({ type: 'reviewNote', at: c.note.at, unavailable: true });
      T.eq(r3.points, 0);
      T.eq(r3.capped, true, 'only two paying notes a day');

      const again = await W.handleMessage({ type: 'reviewNote', at: a.note.at, unavailable: true });
      T.eq(again.delta, 0, 'an already-reviewed note never pays twice');
    });
  });

  T.test('reviewNote: the model\'s yeses pass through the word-count caps', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const a = await W.handleMessage({ type: 'saveNote', text: 'closure scope lexical environment' });
      const r = await W.handleMessage({
        type: 'reviewNote',
        at: a.note.at,
        checks: { concept: true, ownWords: true, example: true, unsure: true },
        comment: 'ok',
        rewrite: '',
      });
      T.eq(r.passed, 1, 'a four-word note caps at one check');
      T.eq(r.points, 5);
      const note = (await get('notes')).find((n) => n.at === a.note.at);
      T.deepEq(note.review.checks, { concept: true, ownWords: false, example: false, unsure: false });
    });
  });

  T.test('reviewNote: exactly one revision can earn the difference', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const a = await W.handleMessage({ type: 'saveNote', text: 'i looked at arrays and loops today again' });
      const r1 = await W.handleMessage({
        type: 'reviewNote',
        at: a.note.at,
        checks: { concept: false, ownWords: false, example: false, unsure: false },
        comment: 'x',
        rewrite: '',
      });
      T.eq(r1.points, 0);

      const better = 'closure captures its lexical environment and keeps it alive after return';
      const r2 = await W.handleMessage({
        type: 'reviewNote',
        at: a.note.at,
        revised: true,
        checks: { concept: true, ownWords: true, example: true, unsure: true },
        text: better,
        comment: 'better',
        rewrite: '',
      });
      T.eq(r2.improved, true);
      T.eq(r2.points, 15, 'three capped checks pay 15, the difference on 0');

      const r3 = await W.handleMessage({
        type: 'reviewNote',
        at: a.note.at,
        revised: true,
        checks: { concept: true, ownWords: true, example: true, unsure: true },
        text: better,
        comment: 'again',
        rewrite: '',
      });
      T.eq(r3.delta, 0);
      T.eq(r3.reason, 'revision already used');
    });
  });

  T.test('quizAward: the worker prices the verdicts and enforces 3/day', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const r = await W.handleMessage({
        type: 'quizAward',
        verdicts: ['correct', 'partial', 'wrong'],
        answered: 3,
      });
      T.eq(r.paid, 2);
      T.eq(r.xpForQuiz, 35);

      const r2 = await W.handleMessage({ type: 'quizAward', verdicts: ['correct'], answered: 1 });
      T.eq(r2.paid, 1);
      T.eq(r2.xpForQuiz, 25);

      const r3 = await W.handleMessage({ type: 'quizAward', verdicts: ['correct'], answered: 1 });
      T.eq(r3.paid, 0, 'the third paid answer was the last');
      T.eq(r3.xpForQuiz, 0);

      const r4 = await W.handleMessage({ type: 'quizAward', verdicts: [], answered: 0 });
      T.eq(r4.paid, 0);

      const daily = (await get('daily'))[key(T0)];
      T.eq(daily.quizPaid, 3);
      T.eq(daily.quiz, 5, 'answered is counted even when the cap pays nothing');
    });
  });

  T.test('quizRequeue: misses queue, fixed retries leave, missed retries wait', async () => {
    const Q1 = 'Why does a closure keep its scope?';
    const Q2 = 'What settles a promise?';

    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const a = await W.handleMessage({
        type: 'quizRequeue',
        items: [
          { q: Q1, hint: 'scope', topic: 'js', retry: false, verdict: 'wrong' },
          { q: Q2, hint: '', topic: 'js', retry: false, verdict: 'correct' },
        ],
      });
      T.eq(a.queued, 1, 'only the miss is kept');
      T.eq(a.pending, 1);
    });

    await withClock(T0 + DAY, async () => {
      const b = await W.handleMessage({
        type: 'quizRequeue',
        items: [{ q: Q1, hint: 'scope', topic: 'js', retry: true, verdict: 'correct' }],
      });
      T.eq(b.resolved, 1, 'a fixed retry leaves the queue for good');
      T.eq(b.pending, 0);
    });

    await withClock(T0 + 3 * DAY, async () => {
      await M.seed({ requeue: [{ q: Q2, hint: '', topic: 'js', day: key(T0), at: T0, tries: 0 }] });
      const c = await W.handleMessage({
        type: 'quizRequeue',
        items: [{ q: Q2, hint: '', topic: 'js', retry: true, verdict: 'partial' }],
      });
      T.eq(c.pending, 1, 'a missed retry waits for the next day');
      T.eq(c.queued, 0);
      const list = await get('requeue');
      T.eq(list[0].tries, 1);
      T.eq(list[0].day, key(T0 + 3 * DAY));
    });
  });

  T.test('struggles: saved, consumed once, never twice', async () => {
    await withClock(T0, async () => {
      await M.fresh();
      const short = await W.handleMessage({ type: 'saveStruggle', text: 'abc' });
      T.eq(short.ok, false);

      const s = await W.handleMessage({ type: 'saveStruggle', text: 'Array.reduce accumulator order confuses me' });
      T.eq(s.ok, true);
      const at = (await get('struggles'))[0].at;
      T.eq((await get('struggles'))[0].used, false);

      const c = await W.handleMessage({ type: 'consumeStruggle', at });
      T.eq(c.hit, true);
      T.eq((await get('struggles'))[0].used, true);

      const again = await W.handleMessage({ type: 'consumeStruggle', at });
      T.eq(again.hit, false, 'a struggle serves one quiz');
    });
  });

  T.test('backup: export shape, import validation, whitelist only', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const ex = await W.handleMessage({ type: 'exportData' });
      T.eq(ex.ok, true);
      T.eq(ex.app, 'code-dojo');
      T.eq(typeof ex.appVersion, 'string');
      T.ok(ex.data && typeof ex.data === 'object');

      const bad = await W.handleMessage({ type: 'importData', data: { nope: 1 } });
      T.eq(bad.ok, false, 'a file without a profile is not a backup');

      const good = await W.handleMessage({
        type: 'importData',
        data: {
          profile: { xp: 500, streak: 3, bestStreak: 4, lastDay: null, freezes: 1 },
          settings: { dailyGoalMinutes: 25 },
          junk: { a: 1 },
        },
      });
      T.ok(good.ok);
      T.eq((await get('profile')).xp, 500);
      T.eq((await get('settings')).dailyGoalMinutes, 25);
      T.eq(await get('junk'), undefined, 'unknown keys are ignored');
    });
  });

  T.test('pruneDaily keeps the most recent 120 days', () => {
    const map = {};
    for (let i = 0; i < 130; i++) map['d' + String(i).padStart(3, '0')] = { xp: i };
    const trimmed = W.pruneDaily(map);
    T.eq(Object.keys(trimmed).length, 120);
    T.eq(trimmed.d000, undefined);
    T.eq(trimmed.d129.xp, 129);
  });

  T.test('level and stretch math', () => {
    T.eq(W.levelFor(0), 1);
    T.eq(W.levelFor(99), 1);
    T.eq(W.levelFor(100), 2);
    T.eq(W.levelFor(399), 2);
    T.eq(W.levelFor(400), 3);
    T.eq(W.xpForLevel(1), 0);
    T.eq(W.xpForLevel(4), 900);
    T.eq(W.stretchFor(15), 45);
    T.eq(W.stretchFor(30), 60);
    T.eq(W.stretchFor(10), 45);
  });

  T.test('quests are deterministic per day - three of them', () => {
    const a = W.questsForDay('2026-05-04');
    const b = W.questsForDay('2026-05-04');
    T.eq(a.length, 3);
    T.deepEq(a.map((q) => q.id), b.map((q) => q.id));
  });

  T.test('a completed quest banks its reward', async () => {
    await withClock(T0, async () => {
      await M.fresh({
        quests: {
          day: key(T0),
          list: [{ id: 't', title: 'Practice five', track: 'minutes', target: 5, reward: 7, progress: 0, done: false }],
        },
      });
      const r = await W.award({ xp: 10, minutes: 5, quiet: true });
      T.deepEq(r.questsDone, ['Practice five']);
      T.eq((await get('daily'))[key(T0)].xp, 17, '10 minute XP + the 7 XP reward');
    });
  });

  T.test('setSettings round-trips and moves the stretch with the goal', async () => {
    await withClock(T0, async () => {
      await M.fresh(questsOff(T0));
      const r = await W.handleMessage({ type: 'setSettings', patch: { dailyGoalMinutes: 25 } });
      T.eq(r.settings.dailyGoalMinutes, 25);
      const rep = await W.handleMessage({ type: 'getState' });
      T.eq(rep.stretch, 50);
      T.eq(rep.settings.dailyGoalMinutes, 25);
    });
  });

  T.test('openQuiz opens one tab and reuses it after that', async () => {
    await M.fresh();
    const a = await W.handleMessage({ type: 'openQuiz' });
    T.ok(a.ok);
    T.eq(M.chrome.tabs.created.length, 1);
    T.match(M.chrome.tabs.created[0].url, /quiz\.html$/);
    const b = await W.handleMessage({ type: 'openQuiz' });
    T.eq(b.reused, true);
    T.eq(M.chrome.tabs.created.length, 1, 'no duplicate tabs');
  });

  T.test('openBigScreen opens the focus room at #focus and reuses that tab', async () => {
    await M.fresh();
    const a = await W.handleMessage({ type: 'openBigScreen' });
    T.ok(a.ok);
    T.eq(M.chrome.tabs.created.length, 1, 'the popup Start lands on the big screen');
    T.match(M.chrome.tabs.created[0].url, /screen\/index\.html#focus$/);
    const b = await W.handleMessage({ type: 'openBigScreen' });
    T.eq(b.reused, true);
    T.eq(M.chrome.tabs.created.length, 1, 'no duplicate tabs');
  });

  T.test('the retired bigScreen "off" choice still opens the focus room', async () => {
    await M.fresh({ settings: { bigScreen: 'off' } });
    const a = await W.handleMessage({ type: 'openBigScreen' });
    T.ok(a.ok);
    T.eq(a.skipped, undefined, 'off must not leave Start with nowhere to open');
    T.eq(M.chrome.tabs.created.length, 1);
    T.match(M.chrome.tabs.created[0].url, /screen\/index\.html#focus$/);
  });

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
