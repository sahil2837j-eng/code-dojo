/* cross-check: the page's mirror of the rules vs the worker's referee.
   notes.js duplicates noteWordCount / noteCapFor / applyNoteCaps by
   design (the popup shows the caps for display; the worker decides the
   payment), and grade.js duplicates the XP table for display. This suite
   proves every mirrored number and rule agrees, so the two homes can
   never silently drift apart.
   Runs under Node (`node tests/cross.test.js`) or headless Chromium. */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;
  const N = typeof module !== 'undefined' && module.exports ? require('../notes.js') : globalThis.DojoNotes;
  const G = typeof module !== 'undefined' && module.exports ? require('../grade.js') : globalThis.DojoGrade;

  if (typeof module !== 'undefined' && module.exports) {
    globalThis.chrome = require('./mock-chrome.js').chrome;
    globalThis.__DOJO_TEST__ = true;
    require('../dojo.js');
  }
  const W = globalThis.__dojoTest;

  T.suite('cross-check: page rules vs the worker');

  T.test('the rubric keys match the worker, in the worker\'s order', () => {
    T.deepEq(N.CHECK_DEFS.map((d) => d.key), W.NOTE_CHECK_KEYS);
  });

  T.test('word counts and caps agree across the threshold grid', () => {
    for (const n of [0, 1, 4, 5, 9, 10, 14, 15, 16, 40]) {
      const text = n ? Array(n).fill('scope').join(' ') : '';
      T.eq(N.noteWordCount(text), W.noteWordCount(text), `count @ ${n} words`);
      T.eq(N.capForText(text), W.noteCapFor(text), `cap @ ${n} words`);
    }
  });

  T.test('applyNoteCaps and checksPassed agree on every text x checks combo', () => {
    const texts = ['', 'one two', Array(6).fill('x').join(' '), Array(11).fill('x').join(' '), Array(20).fill('x').join(' ')];
    const combos = [
      {},
      { concept: true },
      { example: true, concept: true },
      { unsure: true },
      { concept: true, ownWords: true, example: true, unsure: true },
    ];
    for (const text of texts) {
      for (const checks of combos) {
        T.deepEq(N.applyNoteCaps(checks, text), W.applyNoteCaps(checks, text), `caps @ ${text.length} chars`);
        T.eq(N.checksPassed(checks), W.checksPassed(checks), `passed @ ${text.length} chars`);
      }
    }
  });

  T.test('every XP constant the quiz page shows matches the worker', () => {
    T.eq(N.XP_PER_CHECK, W.NOTE_XP_PER_CHECK, 'note XP per check');
    T.eq(N.MAX_XP, W.NOTE_MAX_XP, 'note maximum');
    T.eq(G.XP_CORRECT, W.QUIZ_XP_CORRECT, 'quiz correct');
    T.eq(G.XP_PARTIAL, W.QUIZ_XP_PARTIAL, 'quiz partial');
  });

  T.test('pre-v1.8 notes still convert to points honestly', () => {
    T.eq(W.notePoints({ points: 7 }), 7);
    T.eq(W.notePoints({ paid: true }), W.NOTE_MAX_XP);
    T.eq(W.notePoints({}), 0);
  });

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
