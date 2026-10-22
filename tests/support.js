/* Code Dojo - tests/support.js
   A tiny dependency-free test harness that runs in both worlds:
     - Node: `node tests/ai.test.js` (each file requires this module)
     - headless Chromium: tests/run.sh -> tests/run.html calls
       DojoSuite.runAll() after every file registered its suite.
   No framework, no install: the closed-source plan wanted Vitest, but
   this project is zero-build by design and the machine has no Node. */

(function (root) {
  'use strict';

  const suites = [];
  let current = null;

  function suite(name) {
    current = { name, tests: [] };
    suites.push(current);
  }

  function test(name, fn) {
    if (!current) throw new Error('test() called before suite()');
    current.tests.push({ name, fn });
  }

  function fmt(v) {
    try {
      return JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }

  function eq(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(`${msg || 'eq'}: expected ${fmt(expected)}, got ${fmt(actual)}`);
    }
  }

  function deepEq(actual, expected, msg) {
    if (fmt(actual) !== fmt(expected)) {
      throw new Error(`${msg || 'deepEq'}: expected ${fmt(expected)}, got ${fmt(actual)}`);
    }
  }

  function ok(value, msg) {
    if (!value) throw new Error(msg || `expected a truthy value, got ${fmt(value)}`);
  }

  function match(text, re, msg) {
    if (!re.test(String(text))) {
      throw new Error(`${msg || 'match'}: ${fmt(text)} does not match ${re}`);
    }
  }

  async function runAll() {
    const lines = [];
    let passed = 0;
    let failed = 0;
    for (const s of suites) {
      lines.push(`- ${s.name}`);
      for (const t of s.tests) {
        try {
          await t.fn();
          passed += 1;
          lines.push(`  PASS ${t.name}`);
        } catch (err) {
          failed += 1;
          lines.push(`  FAIL ${t.name}`);
          lines.push(`       ${err && err.message ? err.message : String(err)}`);
        }
      }
    }
    lines.push(`${passed} passed, ${failed} failed`);
    lines.push(failed === 0 ? 'ALL PASS' : 'FAIL');
    return { passed, failed, lines };
  }

  /* Swap in a fake clock (affects new Date() and Date.now() in the whole
     realm); returns restore(). Call restore.advance(delta) to move time
     forward inside a test (notes are identified by their millisecond `at`).
     The worker derives every day key from `new Date()`, so streak /
     rollover tests need this. */
  function clock(ms) {
    const Real = root.Date;
    let now = ms;
    class FakeDate extends Real {
      constructor(...args) {
        if (args.length === 0) super(now);
        else super(...args);
      }
      static now() {
        return now;
      }
    }
    FakeDate.UTC = Real.UTC;
    FakeDate.parse = Real.parse;
    root.Date = FakeDate;
    const restore = () => {
      root.Date = Real;
    };
    restore.advance = (delta) => {
      now += delta;
    };
    return restore;
  }

  const api = { suite, test, eq, deepEq, ok, match, runAll, clock };

  /* Node convenience: run this file's suites, print, set the exit code */
  api.finish = function finish() {
    api.runAll().then((r) => {
      console.log(r.lines.join('\n'));
      if (typeof process !== 'undefined' && process.exitCode !== undefined) {
        process.exitCode = r.failed ? 1 : 0;
      }
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSuite = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
