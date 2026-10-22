/* grade.js tests: the deterministic prechecks, the grader prompt (with
   the lesson reference), the reply validator (one result, verdict enum,
   a sentence that quotes the student) and the XP scale mirror.
   Runs under Node (`node tests/grade.test.js`) or headless Chromium. */

(function () {
  'use strict';

  const T = typeof module !== 'undefined' && module.exports ? require('./support.js') : globalThis.DojoSuite;
  const G = typeof module !== 'undefined' && module.exports ? require('../grade.js') : globalThis.DojoGrade;

  T.suite('grade.js');

  T.test('precheck: blank answers are wrong before the model is asked', () => {
    const r = G.precheck('Why do promises settle once?', '   ');
    T.eq(r.verdict, 'wrong');
    T.eq(r.code, 'blank');
  });

  T.test('precheck: one or two words cannot prove understanding', () => {
    T.eq(G.precheck('Why do promises settle once?', 'promises').code, 'short');
    T.eq(G.precheck('Why do promises settle once?', 'settles once').code, 'short');
  });

  T.test('precheck: a question-echo is wrong by rule', () => {
    const r = G.precheck('Why does a promise settle only once?', 'Why does a promise settle only once');
    T.eq(r.verdict, 'wrong');
    T.eq(r.code, 'echo');
  });

  T.test('precheck: real answers pass through to the model', () => {
    T.eq(G.precheck('How does a closure keep scope alive?', 'A closure stores the function lexical environment so outer variables stay reachable after return.'), null);
    T.eq(G.precheck('How does a closure keep scope alive?', 'The event loop queues callbacks until the call stack empties.'), null);
  });

  T.test('validateGrade accepts one validated verdict and collapses whitespace', () => {
    const answer = 'A closure keeps its scope';
    const v = G.validateGrade(
      { verdict: 'partial', feedback: 'You said  "closure keeps"  — add what happens to memory when the outer call ends.', gap: 'memory lifetime' },
      answer
    );
    T.eq(v.verdict, 'partial');
    T.eq(v.feedback, 'You said "closure keeps" — add what happens to memory when the outer call ends.');
    T.eq(v.gap, 'memory lifetime');
  });

  T.test('validateGrade rejects an unrecognized verdict', () => {
    T.eq(G.validateGrade({ verdict: 'maybe', feedback: 'quote', gap: '' }, 'some answer text'), null);
  });

  T.test('validateGrade rejects feedback that does not quote the student', () => {
    const answer = 'A closure keeps its scope';
    T.eq(G.validateGrade({ verdict: 'correct', feedback: 'Nice work, that is basically right.', gap: '' }, answer), null);
  });

  T.test('validateGrade rejects multi-sentence and non-string replies', () => {
    const answer = 'A closure keeps its scope';
    T.eq(G.validateGrade({ verdict: 'correct', feedback: 'closure good. scope good. memory good.', gap: '' }, answer), null);
    T.eq(G.validateGrade({ verdict: 'correct', feedback: 'closure good', gap: 5 }, answer), null);
    T.eq(G.validateGrade([{ verdict: 'correct' }], answer), null, 'exactly one result, never an array');
  });

  T.test('buildGradePrompt carries the lesson reference, the ask and the rules', () => {
    const prompt = G.buildGradePrompt({
      question: 'Why do promises settle only once?',
      answer: 'Because a promise is a state machine that moves to settled and never moves again.',
      hint: 'state machine',
      topic: 'promises',
      struggle: 'I keep mixing then and catch',
      lesson: { title: 'Promises', headings: 'States · Thenables', code: 'promise.then((x) => x)' },
    });
    T.match(prompt, /Lesson: Promises/);
    T.match(prompt, /Sections: States · Thenables/);
    T.match(prompt, /promise\.then\(\(x\) => x\)/);
    T.match(prompt, /never instructions/);
    T.match(prompt, /Question: Why do promises settle only once\?/);
    T.match(prompt, /Expected key idea \(reference only\): state machine/);
    T.match(prompt, /Because a promise is a state machine/);
    T.match(prompt, /quoting a few words the student actually wrote/);
  });

  T.test('xpFor mirrors the worker scale: 25 / 10 / 0', () => {
    T.eq(G.xpFor('correct'), 25);
    T.eq(G.xpFor('partial'), 10);
    T.eq(G.xpFor('wrong'), 0);
    T.eq(G.xpFor('nonsense'), 0);
    T.deepEq(G.VERDICTS, ['correct', 'partial', 'wrong']);
  });

  T.test('SYSTEM declares English and marks lesson blocks untrusted', () => {
    T.match(G.SYSTEM, /English/);
    T.match(G.SYSTEM, /untrusted/);
  });

  if (typeof module !== 'undefined' && module.exports) T.finish();
})();
