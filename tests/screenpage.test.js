/* focus screen e2e (browser only): boots the REAL built big screen in a
   sandboxed iframe and proves the v1.17 architecture end to end: the
   #focus deep link the popup opens lands in the room, and the room itself
   runs the countdown - starting writes focusSession into
   chrome.storage.local, a finished session is paid through the worker
   exactly like the deleted practice.js used to pay it, and the struggle
   line still reaches tomorrow's quiz.

   The iframe loads tests/screen-boot.html#focus (a real URL carrying the
   fragment, the way the extension tab does); that page wires the shared
   mock chrome from this test runner and boots the built bundle out of
   screen/index.html. After the deep link is asserted, each test walks one
   nav cycle (Today -> Focus room): under the suite's virtual clock React's
   first post-load commit can stall until a real interaction wakes the
   scheduler, and the cycle leaves the room showing exactly the state the
   engine holds. (The live browser flow - popup Start, deep link, begin,
   pause - is verified separately with a real Chromium and the extension
   loaded.) Runs under headless Chromium (`bash tests/run.sh`); under Node
   it registers one skipped test (no DOM to boot). */

(function () {
  'use strict';

  if (typeof document === 'undefined') {
    const T = require('./support.js');
    T.suite('focus screen (browser only)');
    T.test('skipped under Node - run this one with: bash tests/run.sh', () => {});
    T.finish();
    return;
  }

  const T = globalThis.DojoSuite;
  const M = globalThis.MockChrome;
  const W = globalThis.__dojoTest;

  async function bootScreen(seed) {
    await M.fresh(seed);
    const frame = document.createElement('iframe');
    frame.style.position = 'absolute';
    frame.style.left = '-9999px';
    frame.style.width = '1240px';
    frame.style.height = '940px';
    frame.src = 'screen-boot.html#focus';
    document.body.appendChild(frame);
    return frame;
  }

  function until(cond, what) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const tick = async () => {
        let ok = false;
        try {
          ok = await cond();
        } catch (_) {
          ok = false;
        }
        if (ok) return resolve();
        if (++n > 800) return reject(new Error('timed out waiting for ' + what));
        setTimeout(tick, 10);
      };
      void tick();
    });
  }

  const $ = (frame, sel) =>
    frame.contentDocument ? frame.contentDocument.querySelector(sel) : null;
  const label = (frame) =>
    ($(frame, '.timer-toggle') || { textContent: '(no toggle)' }).textContent.trim();
  const tick0 = () => new Promise((r) => setTimeout(r, 0));
  const storage = async (key) => (await M.chrome.storage.local.get(key))[key];

  function clickNav(frame, text) {
    const buttons = [].slice.call(frame.contentDocument.querySelectorAll('button'));
    for (const button of buttons) {
      if (button.textContent.indexOf(text) >= 0) {
        button.click();
        return true;
      }
    }
    return false;
  }

  async function nudgeToRoom(frame) {
    clickNav(frame, 'Today');
    await until(() => !$(frame, '.focus-room'), 'the Today page');
    clickNav(frame, 'Focus room');
    await until(() => $(frame, '.focus-room'), 'the focus room again');
  }

  T.suite('focus screen (headless e2e)');

  T.test('the #focus deep link lands in the room, and starting saves a live session', async () => {
    const todayKey = W.dateKey(new Date());
    const frame = await bootScreen({
      settings: { dailyGoalMinutes: 15, sound: false },
      quests: { day: todayKey, list: [] },
    });
    try {
      await until(() => $(frame, '.focus-room'), 'the focus room from the #focus hash');
      T.match($(frame, 'h1').textContent, /focus room/, 'the deep link opens the room, not Today');

      const chips = [...frame.contentDocument.querySelectorAll('.duration-selector button')];
      T.eq(chips.length, 3, '15 / 25 / 50 minute choices');
      T.eq(chips.every((button) => !button.disabled), true, 'the room owns its controls now');
      T.match($(frame, '.timer-digits').textContent, /^25:00$/);
      T.match($(frame, '.timer-state').textContent, /YOUR NEXT SMALL STEP/);

      await nudgeToRoom(frame);

      $(frame, '.timer-toggle').click();
      await until(() => /Pause session/.test(label(frame)), 'the running label');
      T.match($(frame, '.timer-state').textContent, /RIGHT WHERE/);

      const started = await storage('focusSession');
      T.ok(started, 'starting writes focusSession straight to storage');
      T.eq(started.minutes, 25);
      T.eq(started.running, true);
      T.eq(started.left, 25 * 60, 'the full 25 minutes are kept');

      /* hold the round briefly so the countdown visibly moves, then pause */
      await new Promise((r) => setTimeout(r, 1200));
      $(frame, '.timer-toggle').click();
      await until(() => /Resume session/.test(label(frame)), 'the paused label');
      const paused = await storage('focusSession');
      T.eq(paused.running, false, 'pausing saves the paused session');
      T.ok(paused.left < 25 * 60 && paused.left > 25 * 60 - 5, 'a second of the round is gone');
      T.match($(frame, '.timer-state').textContent, /PAUSED/);

      await tick0();
      T.deepEq(frame.contentWindow.__errors, []);
    } finally {
      frame.remove();
    }
  });

  T.test('a finished session pays through the worker and keeps the struggle line', async () => {
    const todayKey = W.dateKey(new Date());
    const frame = await bootScreen({
      profile: { xp: 0, streak: 0, freezes: 0, lastDay: null, best: 0 },
      daily: {},
      settings: { dailyGoalMinutes: 15, sound: false },
      quests: { day: todayKey, list: [] },
      focusSession: { minutes: 15, left: 1, running: false, ts: Date.now() },
    });
    try {
      await until(() => $(frame, '.timer-toggle'), 'the kept session');
      await nudgeToRoom(frame);
      T.match(label(frame), /Resume session/, 'a kept session comes back paused');
      T.match($(frame, '.timer-digits').textContent, /^00:01$/);

      $(frame, '.timer-toggle').click();
      await until(async () => {
        const daily = await storage('daily');
        return Boolean(daily && daily[todayKey] && daily[todayKey].focus === 1);
      }, 'the completion award');

      await until(() => $(frame, '.finished-title'), 'the finished ring');
      T.match($(frame, '.finished-title').textContent, /You showed up/);
      T.ok($(frame, '.reflection-section'), 'the struggle box appears exactly here');

      const profile = await storage('profile');
      T.eq(profile.xp, 30, '15 rated minutes at 2 XP each, paid by the worker');
      const session = await storage('focusSession');
      T.eq(session.left, 15 * 60, 'a fresh full timer is parked for the next round');
      T.eq(session.running, false);

      /* the struggle line rides the worker into tomorrow's quiz, like the
         old practice page's did */
      const input = $(frame, '.reflection-section input');
      const setValue = Object.getOwnPropertyDescriptor(
        frame.contentWindow.HTMLInputElement.prototype,
        'value',
      ).set;
      setValue.call(input, 'How do I keep state alive in a closure?');
      input.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
      const save = $(frame, '.reflection-section form button[type=submit]');
      await until(() => !save.disabled, 'the save button unlocks');
      save.click();

      await until(async () => {
        const list = await storage('struggles');
        return Array.isArray(list) && list.length === 1;
      }, 'saveStruggle through the worker');
      T.match((await storage('struggles'))[0].text, /closure/);
      await until(() => $(frame, '.saved-reflection'), 'the saved line replaces the form');

      await tick0();
      T.deepEq(frame.contentWindow.__errors, []);
    } finally {
      frame.remove();
    }
  });
})();
