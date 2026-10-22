/* ============================================================
   Code Dojo v2 — core engine (ported 1:1 from dojo.js / grade.js /
   notes.js so the redesign keeps the same honest economy, then
   extended with typed helpers the new UI needs).
   ============================================================ */
export const XP_PER_MIN = 2;
export const XP_CORRECT = 25;
export const XP_PARTIAL = 10;
export const XP_PER_CHECK = 5;
export const NOTE_MAX_CHARS = 300;
export const QUIZ_PAID_CAP = 3;
export const NOTES_PAID_CAP = 2;

/* ---------- levels: level n starts at 100·(n−1)² ---------- */
export function levelForXp(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  const start = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  return { level, start, next, into: xp - start, need: next - start, pct: Math.min(100, ((xp - start) / (next - start)) * 100) };
}
export const BELTS = ["White", "Yellow", "Orange", "Green", "Blue", "Purple", "Brown", "Black", "Black · 2nd Dan", "Master"];
export const beltFor = (level: number) => BELTS[Math.min(BELTS.length - 1, level - 1)];

/* ---------- stretch + minute pricing (worker rule) ---------- */
export const stretchFor = (goal: number) => Math.max(45, goal * 2);
/** price `mins` minutes that start when `alreadyMin` are banked today */
export function priceMinutes(mins: number, alreadyMin: number, goal: number) {
  const stretch = stretchFor(goal);
  const full = Math.min(mins, Math.max(0, stretch - alreadyMin));
  const xp = Math.floor(full * XP_PER_MIN + (mins - full) * 1);
  return { xp, discountedMin: +(mins - full).toFixed(1), stretch };
}

/* ---------- leagues: rolling 7-day XP ---------- */
export const LEAGUES = [
  { name: "Bronze", at: 0, color: "#c47b4a" },
  { name: "Silver", at: 150, color: "#aebac6" },
  { name: "Gold", at: 400, color: "#ffc83d" },
  { name: "Platinum", at: 900, color: "#6fd3e7" },
  { name: "Sapphire", at: 1800, color: "#3aa0ff" },
  { name: "Emerald", at: 3200, color: "#2ee6a8" },
  { name: "Ruby", at: 5000, color: "#ff5d73" },
  { name: "Diamond", at: 7500, color: "#b9f1ff" },
  { name: "Legendary", at: 11000, color: "#ff9d2e" },
];
export function leagueFor(weekXp: number) {
  let i = 0;
  LEAGUES.forEach((l, idx) => { if (weekXp >= l.at) i = idx; });
  const next = LEAGUES[i + 1] || null;
  return { ...LEAGUES[i], index: i, next, toNext: next ? next.at - weekXp : 0 };
}

/* ---------- quests: 10-pool, 3 picked deterministically by date ---------- */
export type QuestDef = { id: string; label: string; metric: "minutes" | "xp" | "sessions" | "odin" | "notes" | "quizzes"; target: number; reward: number; icon: string };
export const QUEST_POOL: QuestDef[] = [
  { id: "xp60", label: "Earn 60 XP today", metric: "xp", target: 60, reward: 30, icon: "zap" },
  { id: "xp120", label: "Earn 120 XP today", metric: "xp", target: 120, reward: 50, icon: "zap" },
  { id: "min25", label: "Practice 25 minutes", metric: "minutes", target: 25, reward: 30, icon: "timer" },
  { id: "min45", label: "Practice 45 minutes", metric: "minutes", target: 45, reward: 60, icon: "timer" },
  { id: "sess1", label: "Finish 1 focus session", metric: "sessions", target: 1, reward: 30, icon: "target" },
  { id: "sess2", label: "Finish 2 focus sessions", metric: "sessions", target: 2, reward: 50, icon: "target" },
  { id: "odin15", label: "15 min on Odin Project", metric: "odin", target: 15, reward: 30, icon: "swords" },
  { id: "odin30", label: "30 min on Odin Project", metric: "odin", target: 30, reward: 50, icon: "swords" },
  { id: "note1", label: "Write 1 learning note", metric: "notes", target: 1, reward: 20, icon: "note" },
  { id: "quiz1", label: "Answer 1 quiz question", metric: "quizzes", target: 1, reward: 30, icon: "brain" },
];
export function questsForDate(dateStr: string): QuestDef[] {
  let h = 0;
  for (const c of dateStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const pool = [...QUEST_POOL];
  const out: QuestDef[] = [];
  for (let i = 0; i < 3; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/* ---------- notes.js: word caps (mirrored worker rule) ---------- */
export function noteWordCount(s: string) {
  return String(s || "").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}
export function capForText(text: string) {
  const w = noteWordCount(text);
  if (w >= 15) return 4;
  if (w >= 10) return 3;
  if (w >= 5) return 2;
  return 1;
}
export const CHECK_DEFS = [
  { key: "concept", label: "Names a concept" },
  { key: "ownWords", label: "Your own words" },
  { key: "example", label: "Has an example" },
  { key: "unsure", label: "Says what's unsure" },
] as const;
export type Checks = Record<(typeof CHECK_DEFS)[number]["key"], boolean>;
export function applyNoteCaps(checks: Checks, text: string): Checks {
  let room = capForText(text);
  const out = {} as Checks;
  for (const c of CHECK_DEFS) { out[c.key] = !!(checks[c.key] && room > 0); if (out[c.key]) room -= 1; }
  return out;
}
export const checksPassed = (c: Checks) => CHECK_DEFS.filter((d) => c[d.key]).length;

/* near-duplicate guard: Jaccard >= 0.7 over real words */
export function jaccard(a: string, b: string) {
  const set = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const A = set(a), B = set(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / (A.size + B.size - hit);
}

/* local stand-in for the on-device review (same strictness bar) */
const CONCEPTS = ["flexbox","grid","closure","promise","async","await","recursion","array","object","function","loop","event","dom","css","html","javascript","variable","scope","hoisting","callback","api","fetch","json","class","module","import","export","state","props","component","hook","usestate","useeffect","algorithm","binary","sort","string","number","boolean","null","undefined","prototype","this","map","filter","reduce","selector","margin","padding","responsive","git","branch","commit","terminal","linux","regex","error","debug","stack","queue","tree","linked","hash","condition","operator","template","arrow","spread","destructuring","rest","query","database","sql","node","express","route"];
export function reviewNoteLocally(text: string): { checks: Checks; comment: string; rewrite: string; cappedFrom: number } {
  const t = text.toLowerCase();
  const conceptHit = CONCEPTS.find((c) => t.includes(c));
  const raw: Checks = {
    concept: !!conceptHit,
    ownWords: noteWordCount(text) >= 6 && !/^(today i learned|in this lesson|we will learn)/i.test(text.trim()),
    example: /(e\.g\.|for example|like |such as|`|\(\)|=>|\d+\s*(px|min|times|items|rows|columns)|when i|tried|wrote)/i.test(text),
    unsure: /(\?|unsure|not sure|still|don't|dont|doesn't|confus|unclear|next|need to|struggle|why|how does)/i.test(text),
  };
  const capped = applyNoteCaps(raw, text);
  const passed = checksPassed(capped);
  const rawPassed = checksPassed(raw);
  let comment: string;
  if (!capped.concept) comment = "No concrete concept is named yet — say the exact mechanism (e.g. “flexbox main axis”), not just the topic.";
  else if (!capped.example) comment = `“${conceptHit}” is named, but there is no concrete case — one specific snippet or situation would prove it.`;
  else if (!capped.unsure) comment = "Strong and specific — the only gap is naming what is still unclear, so tomorrow's quiz knows where to attack.";
  else if (passed === 4) comment = `Concept, example and an open question are all here — “${conceptHit}” in your own words is exactly the bar.`;
  else comment = "On the right track — tighten it around one mechanism and one example.";
  const concept = conceptHit || "the concept";
  const rewrite = passed >= 4 ? "" : `${concept[0].toUpperCase() + concept.slice(1)}: [say the mechanism in one line]. Example: [one line you actually wrote/ran]. Still unsure: [the exact part that would break if quizzed].`;
  return { checks: capped, comment, rewrite, cappedFrom: rawPassed };
}

/* ---------- grade.js: deterministic prechecks (ported) ---------- */
const collapse = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
const wordsOf = (s: string) => collapse(s).split(/\s+/).filter(Boolean);
const contentWords = (s: string) => wordsOf(s).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 3);
export function precheck(question: string, answer: string): { verdict: "wrong"; code: string; feedback: string } | null {
  const raw = collapse(answer);
  if (!raw) return { verdict: "wrong", code: "blank", feedback: "A blank answer proves nothing — write what you know." };
  if (wordsOf(raw).length < 3) return { verdict: "wrong", code: "short", feedback: "One or two words cannot show understanding — explain the mechanism." };
  const a = contentWords(raw); const q = new Set(contentWords(question));
  if (q.size > 0 && a.length >= 2 && wordsOf(raw).length < 14) {
    let hit = 0; for (const w of a) if (q.has(w)) hit += 1;
    if (hit / a.length >= 0.7) return { verdict: "wrong", code: "echo", feedback: "That restates the question — answer with the mechanism in your own words." };
  }
  return null;
}

/* local strict grader: evidence-based keyword/mechanism scoring */
export type Verdict = "correct" | "partial" | "wrong";
export function gradeLocally(question: string, answer: string, keyIdeas: string[], gapHint: string): { verdict: Verdict; feedback: string; gap: string; xp: number } {
  const pre = precheck(question, answer);
  if (pre) return { verdict: "wrong", feedback: pre.feedback, gap: gapHint, xp: 0 };
  const t = answer.toLowerCase();
  const hits = keyIdeas.filter((k) => k.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)) || t.includes(k.toLowerCase()));
  const w = wordsOf(answer).length;
  const quoted = contentWords(answer).find((x) => x.length >= 5) || "your answer";
  const ratio = keyIdeas.length ? hits.length / keyIdeas.length : 0;
  if (ratio >= 0.6 && w >= 10) return { verdict: "correct", feedback: `“${quoted}” names the real mechanism — accurate, specific, no key part missing.`, gap: "", xp: XP_CORRECT };
  if (ratio >= 0.25 && w >= 6) return { verdict: "partial", feedback: `“${quoted}” is on the right track, but the answer stays thin where it matters most.`, gap: gapHint, xp: XP_PARTIAL };
  return { verdict: "wrong", feedback: `“${quoted}” gestures at the topic but proves no mechanism — buzzwords are not understanding.`, gap: gapHint, xp: 0 };
}

/* ---------- quiz bank ---------- */
export type QuizQ = { q: string; hint: string; keyIdeas: string[]; gap: string; topic: string };
export const QUIZ_BANK: QuizQ[] = [
  { topic: "Flexbox & Grid", q: "In Flexbox, what decides whether justify-content moves items horizontally or vertically — and why?", hint: "The main axis, set by flex-direction.", keyIdeas: ["main axis", "flex-direction", "row", "column", "axis"], gap: "justify-content follows the main axis; flex-direction chooses it" },
  { topic: "Flexbox & Grid", q: "When would you choose CSS Grid over Flexbox for a page layout? Give the deciding reason.", hint: "Grid is two-dimensional: rows AND columns together.", keyIdeas: ["two-dimensional", "rows and columns", "2d", "both axes", "grid-template"], gap: "Grid controls rows + columns at once; Flexbox is one-dimensional" },
  { topic: "Flexbox & Grid", q: "What does flex: 1 actually make an item do inside its container?", hint: "grow, shrink and basis — it takes free space.", keyIdeas: ["grow", "free space", "flex-grow", "share", "expand", "shrink"], gap: "flex-grow: the item expands to claim leftover space" },
  { topic: "JavaScript Foundations", q: "What is a closure, and what can the inner function still reach after the outer one returns?", hint: "It remembers its lexical scope.", keyIdeas: ["lexical scope", "variables", "remembers", "outer function", "access"], gap: "the inner function keeps access to outer variables (lexical scope)" },
  { topic: "JavaScript Foundations", q: "Why does `const` still let you push into an array, but not reassign the variable?", hint: "The binding is locked, not the contents.", keyIdeas: ["binding", "reference", "reassign", "mutate", "contents", "points"], gap: "const locks the binding/reference, not the object's contents" },
  { topic: "JavaScript Foundations", q: "Explain the difference between == and === with one concrete example.", hint: "Type coercion.", keyIdeas: ["coercion", "type", "strict", "convert", "string", "number"], gap: "== coerces types (e.g. '5' == 5); === compares type + value" },
  { topic: "Async JavaScript", q: "What does `await` actually pause, and what keeps running while it waits?", hint: "Only that async function pauses; the event loop continues.", keyIdeas: ["event loop", "async function", "promise", "non-blocking", "pauses", "rest"], gap: "await pauses only the async function; the event loop keeps running" },
  { topic: "Async JavaScript", q: "A Promise is in which states, and why can it never change once settled?", hint: "pending → fulfilled / rejected.", keyIdeas: ["pending", "fulfilled", "rejected", "settled", "once"], gap: "pending, then fulfilled or rejected exactly once" },
  { topic: "Async JavaScript", q: "Why wrap fetch() in try/catch if HTTP 404 does not reject the promise?", hint: "Network failure vs HTTP status are different failures.", keyIdeas: ["network", "reject", "status", "response.ok", "404", "fail"], gap: "fetch rejects only on network failure; check response.ok for HTTP errors" },
  { topic: "Git & Command Line", q: "What is the difference between git add and git commit — what exists after each one?", hint: "Staging area vs history snapshot.", keyIdeas: ["staging", "snapshot", "history", "index", "tracked"], gap: "add stages changes; commit writes a permanent snapshot to history" },
  { topic: "Git & Command Line", q: "Why branch before a risky change instead of committing straight to main?", hint: "Isolated line of history you can abandon or merge.", keyIdeas: ["isolate", "merge", "main stays", "abandon", "separate", "pointer"], gap: "a branch isolates the work; main stays working until you merge" },
  { topic: "Git & Command Line", q: "What does `ls -la` show that plain `ls` hides — name both flags.", hint: "-l long format, -a all including dotfiles.", keyIdeas: ["hidden", "dotfiles", "long format", "permissions", "all files"], gap: "-l = long format (permissions/size), -a = hidden dotfiles too" },
];

/* ---------- shared state ---------- */
export type Note = { id: number; text: string; firstText?: string; topic: string; at: string; checks?: Checks; comment?: string; rewrite?: string; xp: number; duplicate?: boolean; revised?: boolean; dismissed?: boolean };
export type DojoState = {
  xp: number; streak: number; bestStreak: number; freezes: number;
  todayMin: number; todayXp: number; sessions: number; odinMin: number;
  quizzesPaid: number; notesPaid: number; notesCount: number; quizzesAnswered: number;
  goalBonusPaid: boolean; questsDone: string[]; questXpPaid: number;
  goal: number; sound: boolean; nudge: boolean; away: boolean; odinSim: boolean;
  notes: Note[]; requeue: QuizQ[]; struggle: string;
  weekDays: { d: string; min: number; xp: number }[];
  pastWeeks: number[]; joinStreakDays: boolean[];
  lastTopic: string;
};
export const todayStr = () => new Date().toISOString().slice(0, 10);
export function seedState(): DojoState {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dow = (new Date().getDay() + 6) % 7;
  const week = days.map((d, i) => ({ d, min: i < dow ? [32, 18, 47, 25, 60, 15, 38][i] : 0, xp: i < dow ? [74, 36, 110, 58, 132, 30, 84][i] : 0 }));
  return {
    xp: 1240, streak: 12, bestStreak: 21, freezes: 2,
    todayMin: 18, todayXp: 46, sessions: 1, odinMin: 12,
    quizzesPaid: 0, notesPaid: 1, notesCount: 1, quizzesAnswered: 0,
    goalBonusPaid: true, questsDone: [], questXpPaid: 0,
    goal: 15, sound: true, nudge: true, away: false, odinSim: false,
    notes: [{ id: 1, text: "Flexbox justify-content follows the main axis, so with flex-direction: column it moves things vertically. Tried it on my nav with 4 items. Still unsure when align-items vs align-content matters.", topic: "Flexbox & Grid", at: "Today · 09:41", xp: 20,
      checks: { concept: true, ownWords: true, example: true, unsure: true }, comment: "Concept, example and an open question are all here — “main axis” in your own words is exactly the bar.", rewrite: "" }],
    requeue: [QUIZ_BANK[1]],
    struggle: "align-items vs align-content in flexbox",
    weekDays: week, pastWeeks: [210, 340, 285, 460, 390, 520, 310, 475],
    joinStreakDays: Array.from({ length: 28 }, (_, i) => i % 9 !== 4),
    lastTopic: "Flexbox & Grid",
  };
}
const KEY = "code-dojo-v2-state";
export function loadState(): DojoState {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...seedState(), ...JSON.parse(raw) }; } catch { /* fresh */ }
  return seedState();
}
export function saveState(s: DojoState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

/* tiny WebAudio chime (respects the sound setting at call site) */
export function chime(kind: "win" | "level" | "tick" = "win") {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = kind === "level" ? [523, 659, 784, 1047] : kind === "tick" ? [880] : [659, 784, 1047];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.09); o.stop(ctx.currentTime + i * 0.09 + 0.4);
    });
  } catch { /* audio unavailable */ }
}
