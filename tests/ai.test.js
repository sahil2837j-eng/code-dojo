/* ai.js tests: the English declaration, the availability ladder, the
   download monitor, brace-safe JSON extraction and the one-retry ask.
   Runs under Node (`node tests/ai.test.js`) or headless Chromium
   (`bash tests/run.sh`). */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;
  const AI = typeof module !== 'undefined' && module.exports ? require('../ai.js') : globalThis.DojoAI;

  /* a fake LanguageModel: records every call, replays canned replies */
  function fakeLM(opts) {
    opts = opts || {};
    const calls = { availability: [], create: [], prompts: [], destroyed: 0 };
    const LM = {
      async availability(io) {
        calls.availability.push(io);
        return opts.state || 'available';
      },
      async params() {
        return { defaultTopK: 3, maxTopK: 8, defaultTemperature: 0.7, maxTemperature: 1.2 };
      },
      async create(o) {
        calls.create.push(o);
        if (o.monitor) {
          o.monitor({
            addEventListener(ev, cb) {
              calls.progressEvent = ev;
              calls.progress = cb;
            },
          });
        }
        const replies = (opts.replies || []).slice();
        return {
          async prompt(p, popts) {
            calls.prompts.push({ p, popts });
            return replies.length ? replies.shift() : '{}';
          },
          destroy() {
            calls.destroyed += 1;
          },
        };
      },
    };
    return { LM, calls };
  }

  async function withLM(lm, fn) {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'LanguageModel');
    const prev = globalThis.LanguageModel;
    if (lm) globalThis.LanguageModel = lm;
    else delete globalThis.LanguageModel;
    try {
      return await fn();
    } finally {
      if (had) globalThis.LanguageModel = prev;
      else delete globalThis.LanguageModel;
    }
  }

  T.suite('ai.js');

  T.test('availability is "unsupported" when the global is missing', async () => {
    await withLM(null, async () => {
      T.eq(await AI.availability(), 'unsupported');
    });
  });

  T.test('availability forwards the state and declares English io', async () => {
    const { LM, calls } = fakeLM({ state: 'downloadable' });
    await withLM(LM, async () => {
      T.eq(await AI.availability(), 'downloadable');
    });
    const io = calls.availability[0];
    T.deepEq(io.expectedInputs, [{ type: 'text', languages: ['en'] }]);
    T.deepEq(io.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
  });

  T.test('extractJson: plain, fenced, embedded, braces-in-strings, garbage', () => {
    T.deepEq(AI.extractJson('{"a":1}'), { a: 1 });
    T.deepEq(AI.extractJson('here you go:\n```json\n{"a":[1,2]}\n```\nthanks'), { a: [1, 2] });
    T.deepEq(AI.extractJson('prefix ["x","y"] suffix'), ['x', 'y']);
    T.deepEq(AI.extractJson('{"s":"a } brace","n":2}'), { s: 'a } brace', n: 2 });
    T.deepEq(AI.extractJson('{"s":"esc \\" quote"}'), { s: 'esc " quote' });
    T.eq(AI.extractJson('no json here'), null);
    T.eq(AI.extractJson('{"broken": '), null);
    T.eq(AI.extractJson(''), null);
  });

  T.test('askJson declares the language pair, pairs the tuning, passes the schema', async () => {
    const { LM, calls } = fakeLM({ replies: ['```json\n{"ok":true}\n```'] });
    await withLM(LM, async () => {
      const out = await AI.askJson('review this', { type: 'object' });
      T.deepEq(out, { ok: true });
      const c = calls.create[0];
      T.deepEq(c.expectedInputs, [{ type: 'text', languages: ['en'] }]);
      T.deepEq(c.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
      // temperature and topK must travel together, and low
      T.eq(c.temperature, 0.2);
      T.eq(c.topK, 3);
      T.match(c.initialPrompts[0].content, /English/);
      T.eq(calls.prompts[0].popts.responseConstraint.type, 'object');
      AI.release();
      T.eq(calls.destroyed, 1);
    });
  });

  T.test('askJson retries exactly once, then throws instead of guessing', async () => {
    const one = fakeLM({ replies: ['no json here', '{"n":2}'] });
    await withLM(one.LM, async () => {
      const out = await AI.askJson('x', { type: 'object' });
      T.deepEq(out, { n: 2 });
      T.eq(one.calls.prompts.length, 2, 'exactly one retry');
      T.match(one.calls.prompts[1].p, /not valid JSON/);
      AI.release();
    });
    const bad = fakeLM({ replies: ['nope', 'still nope'] });
    await withLM(bad.LM, async () => {
      let threw = false;
      try {
        await AI.askJson('x', { type: 'object' });
      } catch (_) {
        threw = true;
      }
      T.ok(threw, 'two garbled replies must throw, never guess');
      AI.release();
    });
  });

  T.test('create wires the downloadprogress monitor to the caller', async () => {
    const { LM, calls } = fakeLM();
    await withLM(LM, async () => {
      const seen = [];
      const s = await AI.create({ system: 'sys', onProgress: (p) => seen.push(p) });
      T.eq(calls.progressEvent, 'downloadprogress');
      calls.progress({ loaded: 0.25 });
      calls.progress({ loaded: 0.75 });
      calls.progress(); // a malformed event must not explode
      T.deepEq(seen, [0.25, 0.75, 0]);
      s.destroy();
      AI.release();
    });
  });

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
