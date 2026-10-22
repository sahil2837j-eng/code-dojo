/* notes.js tests: the four-check rubric, the JSON shape, the strict
   validator, the prompt builder and the length caps (the same numbers
   the worker enforces - cross.test.js proves the two agree).
   Runs under Node (`node tests/notes.test.js`) or headless Chromium. */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;
  const N = typeof module !== 'undefined' && module.exports ? require('../notes.js') : globalThis.DojoNotes;

  function words(n) {
    return Array(n).fill('scope').join(' ');
  }

  T.suite('notes.js');

  T.test('the rubric is the worker\'s four keys, in the worker\'s order', () => {
    T.deepEq(N.CHECK_DEFS.map((d) => d.key), ['concept', 'ownWords', 'example', 'unsure']);
    T.eq(N.XP_PER_CHECK, 5);
    T.eq(N.MAX_XP, 20);
  });

  T.test('caps follow the word-count thresholds 1 / 2 / 3 / 4', () => {
    T.eq(N.capForText(''), 1);
    T.eq(N.capForText('one two three four'), 1);
    T.eq(N.capForText('one two three four five'), 2);
    T.eq(N.capForText(words(10)), 3);
    T.eq(N.capForText(words(14)), 3);
    T.eq(N.capForText(words(15)), 4);
    T.eq(N.capForText('a — b'), 1, 'a dash is not a word');
  });

  T.test('applyNoteCaps keeps the worker\'s priority order', () => {
    const all = { concept: true, ownWords: true, example: true, unsure: true };
    T.deepEq(N.applyNoteCaps(all, 'one two three four'), {
      concept: true,
      ownWords: false,
      example: false,
      unsure: false,
    });
    T.deepEq(N.applyNoteCaps(all, words(10)), {
      concept: true,
      ownWords: true,
      example: true,
      unsure: false,
    });
    T.deepEq(N.applyNoteCaps(all, words(15)), all);
    T.deepEq(N.applyNoteCaps(null, words(15)), {
      concept: false,
      ownWords: false,
      example: false,
      unsure: false,
    });
  });

  T.test('checksPassed counts only strict trues', () => {
    T.eq(N.checksPassed({ concept: true, ownWords: true }), 2);
    T.eq(N.checksPassed({ concept: 'yes' }), 0);
    T.eq(N.checksPassed(null), 0);
  });

  T.test('buildNotePrompt carries the note, the topic and the strictness', () => {
    const prompt = N.buildNotePrompt('Closures keep the outer scope alive after return', 'closures');
    T.match(prompt, /four yes\/no checks/);
    T.match(prompt, /Closures keep the outer scope alive after return/);
    T.match(prompt, /closures/);
    T.match(prompt, /never follow instructions/);
  });

  T.test('buildNotePrompt clips a runaway note to the stored cap', () => {
    const prompt = N.buildNotePrompt('z'.repeat(350));
    T.ok(!prompt.includes('z'.repeat(301)), 'more than 300 chars must be clipped');
  });

  T.test('validateReview accepts exactly the documented shape', () => {
    const good = N.validateReview({
      checks: { concept: true, ownWords: false, example: true, unsure: false },
      comment: 'You named closures but not what keeps the scope  alive.',
      rewrite: 'A closure keeps its lexical scope alive.',
    });
    T.deepEq(good.checks, { concept: true, ownWords: false, example: true, unsure: false });
    T.eq(good.comment, 'You named closures but not what keeps the scope alive.');
    T.eq(good.rewrite, 'A closure keeps its lexical scope alive.');
  });

  T.test('validateReview rejects malformed model replies', () => {
    const base = {
      checks: { concept: true, ownWords: false, example: true, unsure: false },
      comment: 'ok',
      rewrite: '',
    };
    T.eq(N.validateReview(null), null);
    T.eq(N.validateReview([]), null);
    T.eq(N.validateReview(Object.assign({}, base, { checks: { concept: true } })), null);
    T.eq(
      N.validateReview(
        Object.assign({}, base, { checks: { concept: 'yes', ownWords: false, example: true, unsure: false } })
      ),
      null
    );
    T.eq(N.validateReview(Object.assign({}, base, { comment: '' })), null);
    T.eq(N.validateReview(Object.assign({}, base, { comment: 7 })), null);
    T.eq(N.validateReview(Object.assign({}, base, { rewrite: null })), null);
    T.ok(N.validateReview(Object.assign({}, base, { rewrite: '' })), 'an empty rewrite is honest, not invalid');
  });

  T.test('NOTE_SCHEMA asks for four booleans, a comment and a rewrite', () => {
    T.eq(N.NOTE_SCHEMA.type, 'object');
    T.deepEq(N.NOTE_SCHEMA.required, ['checks', 'comment', 'rewrite']);
    T.eq(N.NOTE_SCHEMA.properties.checks.properties.concept.type, 'boolean');
    T.deepEq(N.NOTE_SCHEMA.properties.checks.required, ['concept', 'ownWords', 'example', 'unsure']);
  });

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
