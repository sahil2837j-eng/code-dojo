/* quiz page e2e (browser only): boots the REAL quiz.html in a sandboxed
   iframe against the mock chrome and a fake on-device model, plays a full
   three-question round, and asserts what the worker paid, what got queued
   for tomorrow - and that the honest path still exists when there is no
   model at all. This is the runtime proof for quiz.html/quiz.js; the id
   cross-check in parse.test.js only proves the wiring compiles.
   Runs under headless Chromium (`bash tests/run.sh`); under Node it
   registers one skipped test (no DOM to boot). */

(function () {
  'use strict';

  if (typeof document === 'undefined') {
    const T = require('./support.js');
    T.suite('quiz page (browser only)');
    T.test('skipped under Node - run this one with: bash tests/run.sh', () => {});
    T.finish();
    return;
  }

  const T = globalThis.DojoSuite;
  const M = globalThis.MockChrome;
  const W = globalThis.__dojoTest;

  /* injected into the iframe head: error collector + the shared mock chrome
     (the iframe runs in the same origin, so parent.MockChrome is reachable) */
  const HEAD_STUB = [
    'window.__errors = [];',
    'window.onerror = function (m) { window.__errors.push(String(m)); };',
    'window.addEventListener("unhandledrejection", function (e) {',
    '  window.__errors.push("rejection: " + ((e.reason && e.reason.message) || e.reason));',
    '});',
    'var c = window.parent.MockChrome.chrome;',
    'try { window.chrome = c; } catch (e) {}',
    'if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.sendMessage) {',
    '  try { Object.defineProperty(window, "chrome", { value: c, configurable: true, writable: true }); } catch (e) {}',
    '}',
    'if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.sendMessage) window.__errors.push("chrome stub failed");',
  ].join('\n');

  /* a fake on-device model: three canned questions, then correct -> partial */
  const FAKE_MODEL = [
    'window.LanguageModel = {',
    '  availability: async function () { return "available"; },',
    '  params: async function () { return { defaultTopK: 3, maxTopK: 8, defaultTemperature: 0.7, maxTemperature: 1.2 }; },',
    '  create: async function () {',
    '    return {',
    '      prompt: async function (p) {',
    '        if (p.indexOf("short-answer") >= 0) {',
    '          window.__gen = (window.__gen || 0) + 1;',
    '          return JSON.stringify([',
    '            { q: "How does a promise settle, and what happens after?", hint: "state machine" },',
    '            { q: "What does a closure keep alive, and for how long?", hint: "lexical scope" },',
    '            { q: "Why can the event loop never block on one task?", hint: "single thread" }',
    '          ]);',
    '        }',
    '        window.__grade = (window.__grade || 0) + 1;',
    '        if (window.__grade === 1) {',
    '          return JSON.stringify({ verdict: "correct", feedback: "You said \\"promise settles\\" - correct: the state locks once settled.", gap: "" });',
    '        }',
    '        return JSON.stringify({ verdict: "partial", feedback: "You said \\"wait for the stack\\" - right, now say what runs the loop.", gap: "the mechanism" });',
    '      },',
    '      destroy: function () {},',
    '    };',
    '  },',
    '};',
  ].join('\n');

  async function quizBody() {
    const res = await fetch('../quiz.html');
    const html = await res.text();
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!m) throw new Error('quiz.html has no body');
    return m[1];
  }

  /* the iframe's document URL is /tests/run.html, so <base href="../">
     makes quiz.html's own relative paths (ai.js, icons) resolve from / */
  function bootFrame(body, opts) {
    opts = opts || {};
    const frame = document.createElement('iframe');
    frame.style.position = 'absolute';
    frame.style.left = '-9999px';
    frame.style.width = '720px';
    frame.style.height = '900px';
    document.body.appendChild(frame);
    const head =
      '<base href="../">' +
      '<script>' + HEAD_STUB + '</script>' +
      (opts.noModel ? '<script>' + NO_MODEL_STUB + '</script>' : '') +
      (opts.model ? '<script>' + FAKE_MODEL + '</script>' : '');
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head>' + head + '</head><body>' + body + '</body></html>');
    doc.close();
    return frame;
  }

  function until(cond, what) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const tick = () => {
        let ok = false;
        try {
          ok = cond();
        } catch (_) {
          ok = false;
        }
        if (ok) return resolve();
        if (++n > 800) return reject(new Error('timed out waiting for ' + what));
        setTimeout(tick, 10);
      };
      tick();
    });
  }

  const $id = (d, id) => d.getElementById(id);
  const tick0 = () => new Promise((r) => setTimeout(r, 0));

  /* This Chromium ships a real on-device LanguageModel, and its
     availability() answers on real async time - which the virtual-time
     harness would race. The no-model branch is exercised deterministically
     by removing the global (it is a configurable own property). */
  const NO_MODEL_STUB = [
    'try { delete window.LanguageModel; } catch (e) {}',
    'if (typeof LanguageModel !== "undefined") {',
    '  try { Object.defineProperty(window, "LanguageModel", { value: undefined, configurable: true }); } catch (e) {}',
    '}',
  ].join('\n');

  T.suite('quiz page (headless e2e)');

  T.test('no on-device model: honest explanation, start stays locked', async () => {
    await M.fresh();
    const frame = bootFrame(await quizBody(), { noModel: true });
    const d = frame.contentDocument;
    await until(() => !$id(d, 'modelCard').hidden, 'the model card');
    T.match($id(d, 'modelNote').textContent, /Chrome/);
    T.match($id(d, 'modelNote').textContent, /keeps working/);
    T.eq($id(d, 'startBtn').disabled, true);
    await tick0();
    T.deepEq(d.defaultView.__errors, []);
    frame.remove();
  });

  T.test('a full round: prechecks, worker-paid XP, requeue, honest summary', async () => {
    const todayKey = W.dateKey(new Date());
    await M.fresh({
      quizContext: {
        title: 'Promises',
        headings: 'States · Thenables',
        code: 'promise.then((x) => x)',
        url: 'https://theodinproject.com/lessons/promises',
        at: Date.now(),
      },
      quests: { day: todayKey, list: [] },
    });
    const frame = bootFrame(await quizBody(), { model: true });
    const d = frame.contentDocument;

    await until(() => $id(d, 'startBtn').disabled === false, 'start unlocked');
    T.eq($id(d, 'topicInput').value, 'Promises', 'prefilled from the captured lesson');
    T.match($id(d, 'topicNote').textContent, /Prefilled from your last Odin lesson/);
    T.match($id(d, 'queueNote').textContent, /None waiting/);
    T.eq($id(d, 'streakNum').textContent, '0', 'the streak pill shows the worker\u2019s count');
    T.eq($id(d, 'quizCapPill').textContent, '0/3 paid today');

    $id(d, 'startBtn').click();
    await until(() => !$id(d, 'questionCard').hidden, 'question 1');
    T.eq($id(d, 'qBadge').textContent, 'Question 1 of 3');
    T.match($id(d, 'questionText').textContent, /promise settle/);
    T.eq($id(d, 'retryPill').hidden, true);
    T.eq(d.defaultView.__gen, 1, 'the model was asked exactly once');

    // a blank submit does nothing at all
    $id(d, 'submitBtn').click();
    await tick0();
    T.eq($id(d, 'result').hidden, true, 'blank submit does not grade');

    // one word is wrong by the deterministic precheck - no model call
    $id(d, 'answerInput').value = 'state';
    $id(d, 'submitBtn').click();
    await until(() => !$id(d, 'result').hidden, 'q1 result');
    T.eq($id(d, 'verdictBadge').textContent, 'Wrong');
    T.eq($id(d, 'xpBadge').textContent, '0 XP');
    T.match($id(d, 'resultFeedback').textContent, /One or two words/);
    T.eq(d.defaultView.__grade, undefined, 'the precheck ran alone');

    $id(d, 'nextBtn').click();
    await until(() => $id(d, 'qBadge').textContent === 'Question 2 of 3', 'question 2');
    $id(d, 'answerInput').value = 'A promise settles once when resolve or reject is called.';
    $id(d, 'submitBtn').click();
    await until(() => $id(d, 'verdictBadge').textContent === 'Correct', 'q2 graded correct');
    T.eq($id(d, 'xpBadge').textContent, '+25 XP');
    T.eq(d.defaultView.__grade, 1);

    $id(d, 'nextBtn').click();
    await until(() => $id(d, 'qBadge').textContent === 'Question 3 of 3', 'question 3');
    $id(d, 'answerInput').value = 'Callbacks wait for the stack to empty before running';
    $id(d, 'submitBtn').click();
    await until(() => $id(d, 'verdictBadge').textContent === 'Partial', 'q3 graded partial');
    T.eq($id(d, 'xpBadge').textContent, '+10 XP');
    T.match($id(d, 'resultGap').textContent, /the mechanism/);

    $id(d, 'nextBtn').click();
    await until(() => $id(d, 'sumQueue').textContent === '2', 'the summary settled');
    T.eq($id(d, 'sumXp').textContent, '+35', 'the worker paid 25 + 10');
    T.eq($id(d, 'sumAcc').textContent, '33%');
    T.match($id(d, 'sumNote').textContent, /2 questions will lead tomorrow's quiz/);
    T.eq($id(d, 'streakNum').textContent, '1', 'the worker saluted the streak');
    T.deepEq(d.defaultView.__errors, []);

    const requeue = (await M.chrome.storage.local.get('requeue')).requeue;
    T.eq(requeue.length, 2, 'the wrong and the partial wait for tomorrow');
    T.eq(requeue.every((x) => x && typeof x.q === 'string' && x.tries === 0), true);
    const daily = (await M.chrome.storage.local.get('daily')).daily;
    T.eq(daily[todayKey].quizPaid, 2, 'two paid answers banked');
    T.eq(daily[todayKey].quiz, 3, 'all three answers counted');
    frame.remove();
  });
})();
