/* Code Dojo - Odin Project practice detector (content script).
   Watches for real activity on theodinproject.com, starts a practice
   session by itself, banks XP per focused minute, and shows brief
   (~3.5 second) toasts so nothing interrupts the actual work. */

'use strict';

(() => {
  const ACTIVITY_WINDOW = 60000; // no input for 60s -> you walked away
  const START_AFTER = 45; // seconds of activity before a session counts
  const TICK = 15; // bank accrued seconds every 15s
  const XP_PER_MIN = 2;
  const MILESTONE = 25; // minutes between celebration toasts

  let lastActivity = 0; // set on the first REAL input event (a plain page load is not activity)
  let active = 0; // active seconds this visit
  let sent = 0; // seconds already banked with the worker
  let started = false;
  let startTs = 0;
  let rateBase = null; // { stretch, todayMin } at session start — for an honest badge

  const send = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch (_) {
      return null;
    }
  };

  for (const ev of ['mousemove', 'mousedown', 'keydown', 'keyup', 'scroll', 'wheel', 'touchstart', 'click', 'input']) {
    window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true });
  }

  // assignment links: leaving theodinproject.com mid-session keeps the clock
  // running for the 20-minute continuity window (worker does the accounting)
  document.addEventListener(
    'click',
    async (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin && (url.protocol === 'http:' || url.protocol === 'https:')) {
          await flush(); // bank the seconds first, so the worker sees a live session
          send({ type: 'odinNav' });
        }
      } catch (_) {
        /* ignore */
      }
    },
    true
  );

  /* ---------------- tiny badge + toasts (bottom-right, self-fading) ------- */
  const style = document.createElement('style');
  style.textContent = `
    .dojo-badge { position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
      background: rgba(14,17,22,.92); color: #e8eaef; border: 1px solid rgba(88,204,2,.5);
      font: 12px/1 system-ui, -apple-system, sans-serif; padding: 7px 12px; border-radius: 20px;
      opacity: 0; transition: opacity .4s; pointer-events: none;
      box-shadow: 0 2px 10px rgba(0,0,0,.35); }
    .dojo-badge.on { opacity: .75; }
    .dojo-badge b { color: #58cc02; }
    .dojo-toasts { position: fixed; right: 14px; bottom: 92px; z-index: 2147483001;
      display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
    .dojo-quizbtn { position: fixed; right: 14px; bottom: 52px; z-index: 2147483000;
      pointer-events: auto; background: rgba(14,17,22,.92); color: #e8eaef;
      border: 1px solid rgba(58,160,255,.55); font: 12px/1 system-ui, -apple-system, sans-serif;
      padding: 7px 12px; border-radius: 20px; cursor: pointer; opacity: .85;
      box-shadow: 0 2px 10px rgba(0,0,0,.35); transition: opacity .2s, border-color .2s; }
    .dojo-quizbtn:hover { opacity: 1; border-color: rgba(58,160,255,.9); }
    .dojo-toast { background: rgba(14,17,22,.95); color: #e8eaef; border-left: 3px solid #58cc02;
      font: 12.5px/1.4 system-ui, -apple-system, sans-serif; padding: 9px 14px; border-radius: 10px;
      max-width: 290px; opacity: 0; transform: translateY(6px);
      transition: opacity .25s, transform .25s; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
    .dojo-toast.show { opacity: 1; transform: none; }
  `;
  document.documentElement.append(style);

  const badge = document.createElement('div');
  badge.className = 'dojo-badge';
  badge.innerHTML = '🥋 <span class="dojo-t">0:00</span> <b class="dojo-xp">+0 XP</b>';
  document.body.append(badge);

  const toasts = document.createElement('div');
  toasts.className = 'dojo-toasts';
  document.body.append(toasts);

  /* v1.5 quiz: one click opens the on-device quiz for THIS lesson */
  const quizBtn = document.createElement('button');
  quizBtn.className = 'dojo-quizbtn';
  quizBtn.textContent = '🧠 Quiz me on this lesson';
  quizBtn.title = 'Build a short quiz from this page (on-device AI, nothing leaves your machine)';
  quizBtn.addEventListener('click', () => send({ type: 'openQuiz' }));
  document.body.append(quizBtn);

  /* the 2-5 second alert: appears, sits for ~3.5s, fades, gone */
  function toast(text) {
    const el = document.createElement('div');
    el.className = 'dojo-toast';
    el.textContent = text;
    toasts.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3500);
  }

  /* v1.10: minutes pay 2 XP up to the stretch threshold, then half — the
     badge estimate follows the same rule once the session start is known */
  function estimateXp(mins) {
    if (!rateBase) return Math.floor(mins * XP_PER_MIN);
    const full = Math.min(mins, Math.max(0, rateBase.stretch - rateBase.todayMin));
    return Math.floor(full * XP_PER_MIN + (mins - full));
  }

  function updateBadge() {
    const m = Math.floor(active / 60);
    const s = active % 60;
    badge.querySelector('.dojo-t').textContent = `${m}:${String(s).padStart(2, '0')}`;
    badge.querySelector('.dojo-xp').textContent = `+${estimateXp(active / 60)} XP`;
  }

  function startSession() {
    started = true;
    startTs = Date.now();
    badge.classList.add('on');
    send({ type: 'odinStart', start: startTs });
    const p = send({ type: 'getState' });
    if (p && p.then) {
      p.then((r) => {
        if (started && r && r.ok) {
          rateBase = { stretch: r.stretch, todayMin: (r.today && r.today.minutes) || 0 };
        }
      });
    }
    toast(`🥋 Practice detected — +${XP_PER_MIN} XP/min, half past your stretch`);
  }

  let lastMilestone = 0;
  function checkMilestone() {
    const mins = Math.floor(active / 60);
    if (mins >= lastMilestone + MILESTONE) {
      lastMilestone = mins;
      toast(`🏆 ${mins} min of real practice banked`);
    }
  }

  async function flush() {
    if (!started || active - sent < 1) return;
    const res = await send({ type: 'odinTick', seconds: active - sent });
    sent = active;
    if (!res || !res.ok) return;
    if (res.goalHit) toast('🎯 Daily goal complete — your streak is safe');
    if (res.stretchHit) toast(`💪 Stretch goal hit — ${res.stretch} min today. That is where it sticks.`);
    if (res.leveledUp) toast(`⚡ Level ${res.level} unlocked — that is real progress`);
    if (res.questsDone && res.questsDone.length) {
      toast(`✅ Quest complete: ${res.questsDone.join(', ')} — bonus XP banked`);
    }
  }

  async function endSession() {
    await flush();
    if (started && active >= 60) send({ type: 'odinEnd', minutes: +(active / 60).toFixed(1) });
  }

  /* ---------------- v1.5: lesson context for the on-device quiz ----------
     Captures a compact snapshot of the lesson that is on screen so the quiz
     page can write questions about THIS page (title, sections, one code
     block). Re-captures when the URL changes (Turbo navigations included). */
  let ctxFor = '';
  function sendLessonContext() {
    try {
      if (ctxFor === location.href) return;
      const textOf = (node, limit) => {
        const t = node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
        return t.slice(0, limit);
      };
      const title =
        textOf(document.querySelector('h1'), 160) ||
        document.title.replace(/\s*\|.*$/, '').trim().slice(0, 160);
      if (!title) return;
      const headings = Array.from(document.querySelectorAll('h2, h3'))
        .slice(0, 6)
        .map((h) => h.textContent.replace(/\s+/g, ' ').trim())
        .join(' · ')
        .slice(0, 400);
      let code = '';
      for (const block of document.querySelectorAll('pre')) {
        const t = block.textContent.replace(/\s+$/g, '');
        if (t.trim().length >= 20) {
          code = t.slice(0, 800);
          break;
        }
      }
      ctxFor = location.href;
      send({ type: 'setQuizContext', context: { title, headings, code, url: location.href } });
    } catch (_) {
      /* ignore */
    }
  }
  setTimeout(sendLessonContext, 1500);
  setInterval(() => {
    if (location.href !== ctxFor) setTimeout(sendLessonContext, 1200);
  }, 4000);

  /* ---------------- main loop ---------------- */
  setInterval(() => {
    if (!document.hidden && document.hasFocus() && lastActivity > 0 && Date.now() - lastActivity < ACTIVITY_WINDOW) {
      active += 1;
      if (!started && active >= START_AFTER) startSession();
      if (started) {
        updateBadge();
        checkMilestone();
      }
    }
  }, 1000);

  setInterval(flush, TICK * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endSession();
  });
  window.addEventListener('pagehide', endSession);

  /* welcome back: if the last session was decent and recent, say so */
  try {
    chrome.storage.local
      .get('odin')
      .then((data) => {
        const o = data && data.odin;
        if (o && o.last && o.last.minutes >= 10 && Date.now() - o.last.ts < 12 * 3600000) {
          const agoMin = Math.max(1, Math.round((Date.now() - o.last.ts) / 60000));
          const ago = agoMin < 90 ? `${agoMin} min ago` : `${Math.round(agoMin / 60)} h ago`;
          setTimeout(() => toast(`👋 Welcome back — last session: ${Math.round(o.last.minutes)} min (${ago})`), 1500);
        }
      })
      .catch(() => {});
  } catch (_) {
    /* ignore */
  }
})();
