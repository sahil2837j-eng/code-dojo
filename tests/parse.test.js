/* shipped-files guard: the audit that started this rebuild found six
   0-byte files and five 0-byte suites that nothing had noticed. This
   suite notices. Every shipped script must be non-empty, strict-mode and
   parseable as a classic script; the manifest must be valid JSON; and
   every id a page script reaches for must exist in its HTML exactly once
   (the fastest way to catch a typo between a page and its script is a
   dead getElementById at runtime - this catches it at test time).
   Runs under Node (`node tests/parse.test.js`) or headless Chromium. */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;

  const JS_FILES = ['ai.js', 'dojo.js', 'grade.js', 'notes.js', 'odin.js', 'popup.js', 'quiz.js'];
  const ASSET_FILES = ['popup.html', 'quiz.html', 'popup.css', 'quiz.css'];

  async function read(path) {
    if (typeof module !== 'undefined' && module.exports) {
      return require('fs').readFileSync(require('path').join(__dirname, '..', path), 'utf8');
    }
    const res = await fetch('../' + path);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.text();
  }

  const htmlIds = (html) => [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const jsIds = (js) => new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));

  T.suite('shipped files');

  for (const file of JS_FILES) {
    T.test(`${file} is non-empty, strict and parseable as a classic script`, async () => {
      const src = await read(file);
      T.ok(src.trim().length > 50, `${file} is empty or a stub`);
      T.match(src, /'use strict'/, 'every file declares strict mode');
      T.ok(!/^\s*(import|export)\s/m.test(src), 'classic scripts only - the pages have no module type');
      new Function(src); // a SyntaxError here fails the test
    });
  }

  T.test('manifest.json is valid MV3 with the shipped identity', async () => {
    const m = JSON.parse(await read('manifest.json'));
    T.eq(m.manifest_version, 3);
    T.eq(m.background.service_worker, 'dojo.js');
    T.eq(m.action.default_popup, 'popup.html');
    T.match(m.version, /^\d+\.\d+\.\d+$/);
    T.ok(m.name.indexOf('Code Dojo') === 0);
  });

  for (const file of ASSET_FILES) {
    T.test(`${file} is non-empty`, async () => {
      const src = await read(file);
      T.ok(src.trim().length > 0, `${file} is empty`);
    });
  }

  const pageChecks = [
    ['popup.js', 'popup.html'],
    ['quiz.js', 'quiz.html'],
  ];
  for (const [js, html] of pageChecks) {
    T.test(`every id ${js} uses exists exactly once in ${html}`, async () => {
      const ids = htmlIds(await read(html));
      const used = jsIds(await read(js));
      const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      T.deepEq(dupes, [], 'duplicate ids would make getElementById ambiguous');
      for (const id of used) {
        T.ok(ids.includes(id), `${html} is missing #${id}`);
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
