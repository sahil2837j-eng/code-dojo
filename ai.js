/* ============================================================
   Code Dojo - ai.js (v1.9): the one voice for the on-device model.
   Chrome's built-in Prompt API (Gemini Nano), used from the popup
   (note review) and from the quiz page. This file owns:
     - the English input/output declaration on every session (no more
       "no output language" console warning)
     - availability checks: available / downloadable / downloading /
       unavailable / unsupported
     - session creation with the device's sampling params, a
       downloadprogress monitor and AbortSignal pass-through
     - one cached session per system prompt, and release()
     - brace-safe JSON extraction and schema-constrained JSON asks
       with exactly one retry, then a throw
   Everything runs on-device; nothing here touches the network.
   Loaded as a plain script by popup.html and quiz.html; exposes
   window.DojoAI (and module.exports for the node tests).
   ============================================================ */

(function (root) {
  'use strict';

  /* the same declaration is used by availability() and create() - if the
     two disagree, availability() lies about the model */
  const TEXT = { type: 'text', languages: ['en'] };
  const IO = { expectedInputs: [TEXT], expectedOutputs: [TEXT] };

  const SYSTEM =
    'You are Code Dojo, a strict but fair coding tutor. ' +
    'Always answer in English. Answer with the requested JSON shape and nothing else.';

  function model() {
    return typeof LanguageModel !== 'undefined' ? LanguageModel : null;
  }

  /* 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' */
  async function availability() {
    const LM = model();
    if (!LM || typeof LM.availability !== 'function') return 'unsupported';
    try {
      return await LM.availability(IO);
    } catch (_) {
      return 'unsupported';
    }
  }

  /* the first complete JSON value in the text, ignoring prose and code
     fences around it. Strings may contain braces, so the scan is
     string- and escape-aware. Returns null when nothing parses. */
  function extractJson(text) {
    let s = String(text == null ? '' : text).trim();
    if (!s) return null;
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const start = s.search(/[{\[]/);
    if (start < 0) return null;
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(s.slice(start, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /* one session per system prompt: a suspended worker cannot keep one,
     but a page can reuse it for a whole review / quiz round */
  const sessions = new Map();

  async function create(opts) {
    opts = opts || {};
    const LM = model();
    if (!LM) throw new Error('on-device model unavailable');
    let params = null;
    try {
      params = await LM.params();
    } catch (_) {
      params = null;
    }
    // temperature + topK travel together or not at all; low temperature
    // keeps grading reproducible, and the device reports its own limits
    const temperature =
      params && typeof params.maxTemperature === 'number'
        ? Math.min(0.2, Math.max(0, params.maxTemperature))
        : 0.2;
    const topK = params && typeof params.defaultTopK === 'number' ? params.defaultTopK : 3;
    return LM.create({
      expectedInputs: IO.expectedInputs,
      expectedOutputs: IO.expectedOutputs,
      initialPrompts: [{ role: 'system', content: String(opts.system || SYSTEM) }],
      temperature,
      topK,
      ...(opts.signal ? { signal: opts.signal } : {}),
      monitor(m) {
        if (opts.onProgress && m && typeof m.addEventListener === 'function') {
          m.addEventListener('downloadprogress', (e) => {
            opts.onProgress(e && typeof e.loaded === 'number' ? e.loaded : 0);
          });
        }
      },
    });
  }

  async function sessionFor(system, opts) {
    const key = String(system || SYSTEM);
    const hit = sessions.get(key);
    if (hit) return hit;
    const s = await create({ system: key, onProgress: opts && opts.onProgress, signal: opts && opts.signal });
    sessions.set(key, s);
    return s;
  }

  const RETRY_NUDGE = '\n\nYour previous reply was not valid JSON. Reply with the JSON value only.';

  /* ask for JSON constrained to the schema; one retry; throws when the
     model still cannot produce a parseable value */
  async function askJson(prompt, schema, opts) {
    opts = opts || {};
    if (!model()) throw new Error('on-device model unavailable');
    let session = await sessionFor(opts.system, opts);
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const ask = attempt === 0 ? String(prompt) : String(prompt) + RETRY_NUDGE;
      let reply = '';
      try {
        reply = await session.prompt(
          ask,
          Object.assign({ responseConstraint: schema }, opts.signal ? { signal: opts.signal } : {})
        );
      } catch (err) {
        if (attempt > 0) throw err;
        // the session may have been evicted mid-flight - rebuild once
        sessions.delete(String(opts.system || SYSTEM));
        session = await sessionFor(opts.system, opts);
        continue;
      }
      parsed = extractJson(reply);
    }
    if (!parsed) throw new Error('the on-device model did not return valid JSON');
    return parsed;
  }

  /* drop every cached session (quiz round over / page closing) */
  function release() {
    for (const s of sessions.values()) {
      try {
        s.destroy();
      } catch (_) {
        /* best effort */
      }
    }
    sessions.clear();
  }

  const api = { IO, SYSTEM, availability, extractJson, create, askJson, release };
  root.DojoAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
