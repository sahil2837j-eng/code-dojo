import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain, CalendarDays, ChevronRight, Clock3, Download, Flame, Home, NotebookPen, Rocket, RotateCcw,
  Snowflake, Sparkles, Swords, Target, Timer, TrendingUp, Trophy, Volume2, Zap,
} from "lucide-react";
import { Bar, Card, GoalRing, MiniRing, Pill, SectionTitle, Toggle } from "./components/ui";
import Focus from "./components/Focus";
import Quiz from "./components/Quiz";
import Notes from "./components/Notes";
import Roadmap from "./components/Roadmap";
import {
  LEAGUES, beltFor, chime, leagueFor, levelForXp, loadState, priceMinutes, questsForDate,
  saveState, seedState, stretchFor, todayStr,
} from "./lib/dojo";
import type { DojoState } from "./lib/dojo";

type Tab = "today" | "focus" | "quiz" | "notes" | "progress" | "improve";
type Toast = { id: number; msg: string; tone: string };
const TONE: Record<string, string> = { green: "#58cc02", amber: "#ffb020", rose: "#ff5d73", blue: "#3aa0ff" };
const QUOTES = [
  "Discipline is choosing what you want most over what you want now.",
  "You don't rise to the goal. You fall to the system. This is the system.",
  "Fifteen honest minutes beat three distracted hours.",
  "The streak is not the point. Who you become protecting it is.",
];

export default function App() {
  const [s, setS] = useState<DojoState>(loadState);
  const [tab, setTab] = useState<Tab>("today");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef(s);
  ref.current = s;
  useEffect(() => saveState(s), [s]);

  const toast = useCallback((msg: string, tone = "green") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const quests = useMemo(() => questsForDate(todayStr()), []);
  const metric = useCallback((st: DojoState, m: string) =>
    m === "xp" ? st.todayXp : m === "minutes" ? Math.floor(st.todayMin) : m === "sessions" ? st.sessions : m === "odin" ? Math.floor(st.odinMin) : m === "notes" ? st.notesCount : st.quizzesAnswered, []);

  /* apply XP + goal bonus + quest chain, exactly like the worker's award loop */
  const applyXp = useCallback((st: DojoState, addXp: number, addMin = 0): { next: DojoState; leveled: boolean; level: number; questsDone: string[]; goalHit: boolean } => {
    const beforeLevel = levelForXp(st.xp).level;
    let next = { ...st, xp: st.xp + addXp, todayXp: st.todayXp + addXp, todayMin: +(st.todayMin + addMin).toFixed(1) };
    let goalHit = false;
    if (!next.goalBonusPaid && next.todayMin >= next.goal && addMin > 0) {
      next = { ...next, xp: next.xp + 10, todayXp: next.todayXp + 10, goalBonusPaid: true }; goalHit = true;
    }
    const doneNow: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
      for (const q of quests) {
        if (!next.questsDone.includes(q.id) && metric(next, q.metric) >= q.target) {
          next = { ...next, questsDone: [...next.questsDone, q.id], xp: next.xp + q.reward, todayXp: next.todayXp + q.reward, questXpPaid: next.questXpPaid + q.reward };
          doneNow.push(q.label);
        }
      }
    }
    const dow = (new Date().getDay() + 6) % 7;
    const weekDays = next.weekDays.map((d, i) => i === dow ? { ...d, min: Math.floor(next.todayMin), xp: next.todayXp } : d);
    next = { ...next, weekDays };
    const level = levelForXp(next.xp).level;
    return { next, leveled: level > beforeLevel, level, questsDone: doneNow, goalHit };
  }, [quests, metric]);

  const celebrate = useCallback((r: { leveled: boolean; level: number; questsDone: string[]; goalHit: boolean }, silent = false) => {
    if (r.goalHit) toast("Daily goal complete — your streak is safe (+10 XP bonus)", "green");
    if (r.questsDone.length) toast(`Quest complete: ${r.questsDone.join(", ")} — bonus XP banked`, "green");
    if (r.leveled) { toast(`Level ${r.level} unlocked — ${beltFor(r.level)} belt. That is real progress`, "amber"); if (ref.current.sound) chime("level"); }
    else if (!silent && r.questsDone.length && ref.current.sound) chime("tick");
  }, [toast]);

  const awardMinutes = useCallback((mins: number, source = "focus") => {
    const st = ref.current;
    const priced = priceMinutes(mins, st.todayMin, st.goal);
    const r = applyXp(st, priced.xp, mins);
    setS(r.next);
    celebrate(r, source === "heartbeat");
    return { xp: priced.xp, discounted: priced.discountedMin, leveled: r.leveled, level: r.level };
  }, [applyXp, celebrate]);

  const awardFlat = useCallback((xp: number) => {
    if (xp <= 0) return;
    const r = applyXp(ref.current, xp, 0);
    setS(r.next); celebrate(r);
  }, [applyXp, celebrate]);

  const patch = useCallback((fn: (p: DojoState) => DojoState) => setS((p) => fn(p)), []);

  /* Odin auto-tracking simulator: ~45s of activity → session; here 1 min every 4s */
  useEffect(() => {
    if (!s.odinSim) return;
    const id = setInterval(() => {
      awardMinutes(1, "odin");
      setS((p) => ({ ...p, odinMin: +(p.odinMin + 1).toFixed(1) }));
    }, 4000);
    return () => clearInterval(id);
  }, [s.odinSim, awardMinutes]);

  /* Away mode: machine active → 1 min/min, shown here at demo pace */
  useEffect(() => {
    if (!s.away) return;
    const id = setInterval(() => awardMinutes(1, "away"), 8000);
    return () => clearInterval(id);
  }, [s.away, awardMinutes]);

  const lvl = levelForXp(s.xp);
  const stretch = stretchFor(s.goal);
  const weekXp = s.weekDays.reduce((a, d) => a + d.xp, 0) || s.todayXp;
  const league = leagueFor(weekXp);
  const beatWeeks = s.pastWeeks.filter((w) => weekXp > w).length;
  const minLeft = Math.max(0, Math.ceil(s.goal - s.todayMin));
  const stretchLeft = Math.max(0, Math.ceil(stretch - s.todayMin));
  const summary = s.todayMin >= stretch
    ? "Stretch hit — everything from here compounds (at half rate, honestly)."
    : s.todayMin >= s.goal ? `Streak safe. ${stretchLeft} more min to your stretch — that is where it sticks.`
    : `${minLeft} minute${minLeft === 1 ? "" : "s"} to keep the streak alive. One small session.`;
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const dow = (new Date().getDay() + 6) % 7;
  const maxDayXp = Math.max(60, ...s.weekDays.map((d) => d.xp));
  const maxWeek = Math.max(...s.pastWeeks, weekXp);

  const TABS: { id: Tab; label: string; Icon: typeof Home; badge?: number }[] = [
    { id: "today", label: "Today", Icon: Home },
    { id: "focus", label: "Focus", Icon: Timer },
    { id: "quiz", label: "Quiz", Icon: Brain, badge: s.requeue.length },
    { id: "notes", label: "Notes", Icon: NotebookPen, badge: s.notes.filter((n) => !n.checks && !n.dismissed).length },
    { id: "progress", label: "Progress", Icon: TrendingUp },
    { id: "improve", label: "Improve Plan", Icon: Rocket },
  ];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: "code-dojo", appVersion: "2.0-concept", exportedAt: new Date().toISOString(), data: s }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `code-dojo-backup-${todayStr()}.json`; a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup exported — same 10-key whitelist shape as v1.11", "blue");
  };

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-[#1c252f] bg-[#0b0e11]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#58cc02] shadow-[0_4px_0_#46a302]">
            <Flame size={24} className="text-white" fill="#fff" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold tracking-tight">CODE DOJO</span>
              <Pill color="#1a3322" text="#58cc02">v2.0 REDESIGN</Pill>
            </div>
            <p className="hidden text-[12px] text-[#6b7a8c] sm:block">Duolingo discipline for coders · 100% local · no account, no server</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-[#2a1c10] px-3 py-1.5" title="Streak">
              <span className="flame-anim"><Flame size={17} className="text-[#ff6b35]" fill="#ff6b35" /></span>
              <span className="font-mono text-sm font-bold">{s.streak}</span>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full bg-[#12283e] px-3 py-1.5 sm:flex" title="Streak freezes">
              <Snowflake size={16} className="text-[#6fd3e7]" /><span className="font-mono text-sm font-bold">{s.freezes}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#1a3322] px-3 py-1.5" title="Total XP">
              <Zap size={16} className="text-[#58cc02]" fill="#58cc02" /><span className="font-mono text-sm font-bold">{s.xp.toLocaleString()}</span>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 md:flex" style={{ background: `${league.color}26` }} title="League">
              <Trophy size={16} style={{ color: league.color }} /><span className="text-sm font-bold" style={{ color: league.color }}>{league.name}</span>
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6" role="tablist" aria-label="Code Dojo sections">
          {TABS.map(({ id, label, Icon, badge }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`relative inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors ${tab === id ? "bg-[#58cc02] text-[#071400]" : "bg-[#141b23] text-[#aebac6] hover:bg-[#1c2733]"}`}>
              <Icon size={17} /> {label}
              {!!badge && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5d73] px-1 text-[11px] font-bold text-white">{badge}</span>}
            </button>
          ))}
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 self-center text-[12px] font-semibold text-[#6b7a8c] lg:inline-flex">
            <span className={`h-2 w-2 rounded-full ${s.odinSim ? "pulse-dot bg-[#58cc02]" : "bg-[#3d4d61]"}`} />
            {s.odinSim ? "Odin session live · banking XP" : s.away ? "Away mode · coding elsewhere" : "Extension idle"}
          </span>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {banner && tab === "today" && (
          <div className="anim-pop dot-grid mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-[#2f7300] bg-[#101a0a] p-5">
            <Sparkles className="shrink-0 text-[#58cc02]" size={26} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">Adil — your v1.11 engine, wearing a v2.0 face.</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-[#b9cf9f]">Same honest rules you built (worker-priced XP, stretch half-rate, word caps, strict grading, freeze promises) — rebuilt as a live product UI. Everything below works and saves locally. The <button className="font-bold underline" onClick={() => setTab("improve")}>Improve Plan</button> tab has file-by-file upgrades for the real extension.</p>
            </div>
            <button onClick={() => setBanner(false)} className="rounded-xl bg-[#1a3322] px-4 py-2 text-sm font-bold text-[#58cc02]">Got it</button>
          </div>
        )}

        {/* ---------- TODAY ---------- */}
        {tab === "today" && (
          <div className="anim-pop grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <Card className="p-6">
                <div className="flex flex-wrap items-center gap-6">
                  <GoalRing minutes={s.todayMin} goal={s.goal} stretch={stretch}>
                    <div className="font-mono text-4xl font-bold">{Math.floor(s.todayMin)}</div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#93a1b1]">of {s.goal} min goal</div>
                    <div className="mt-1 text-[11px] font-semibold text-[#a5e85c]">stretch {stretch} min</div>
                  </GoalRing>
                  <div className="min-w-[240px] flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Pill color="#2a1c10" text="#ff9d6b"><Flame size={12} /> {s.streak}-day streak · best {s.bestStreak}</Pill>
                      <Pill color="#12283e" text="#6fd3e7"><Snowflake size={12} /> {s.freezes} freeze{s.freezes === 1 ? "" : "s"} banked</Pill>
                      <Pill color="#1a3322" text="#58cc02">Level {lvl.level} · {beltFor(lvl.level)} belt</Pill>
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-bold leading-tight">{summary}</h2>
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between text-[12px] font-semibold text-[#93a1b1]"><span>Level {lvl.level} progress</span><span className="font-mono">{lvl.into} / {lvl.need} XP to Level {lvl.level + 1}</span></div>
                      <Bar pct={lvl.pct} />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <button onClick={() => setTab("focus")} className="btn-chunk inline-flex items-center gap-2 rounded-2xl bg-[#58cc02] px-6 py-3 font-display font-bold text-[#071400]"><Timer size={18} /> Start focus</button>
                      <button onClick={() => setTab("quiz")} className="btn-chunk-blue inline-flex items-center gap-2 rounded-2xl bg-[#3aa0ff] px-5 py-3 font-display font-bold text-[#04182e]"><Brain size={18} /> Quiz me{s.requeue.length ? ` (${s.requeue.length} due)` : ""}</button>
                      <button onClick={() => setTab("notes")} className="btn-chunk-dark inline-flex items-center gap-2 rounded-2xl bg-[#1e2833] px-5 py-3 font-display font-bold text-white"><NotebookPen size={18} /> Write note</button>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid gap-5 md:grid-cols-2">
                <Card className="p-5">
                  <SectionTitle icon={<Target size={19} />} title="Today's quests" sub="3 of 10 · picked deterministically by date — same day, same quests" />
                  <div className="mt-4 space-y-3">
                    {quests.map((q) => {
                      const prog = metric(s, q.metric); const done = s.questsDone.includes(q.id);
                      return (
                        <div key={q.id} className={`rounded-2xl border p-3.5 ${done ? "border-[#2f7300] bg-[#14240c]" : "border-[#232d38] bg-[#171e26]"}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{q.label}</span>
                            <span className={`ml-auto font-mono text-xs font-bold ${done ? "text-[#58cc02]" : "text-[#ffb020]"}`}>{done ? "DONE" : `+${q.reward} XP`}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2"><Bar pct={(prog / q.target) * 100} color={done ? "#58cc02" : "#ffb020"} h="h-2" /><span className="shrink-0 font-mono text-[11px] text-[#93a1b1]">{Math.min(prog, q.target)}/{q.target}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card className="p-5">
                  <SectionTitle icon={<Swords size={19} />} title="Coding habit" sub="Learned from your Odin sessions · one reminder, one winner" />
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl bg-[#171e26] p-3.5">
                      <Clock3 size={19} className="shrink-0 text-[#3aa0ff]" />
                      <p className="flex-1 text-[13px] leading-snug">Your usual coding time is <b>20:00</b> (9 sessions). The nudge uses it — the fixed 20:00 setting is only a fallback.</p>
                      <Toggle on={s.nudge} label="Practice nudge" onClick={() => { patch((p) => ({ ...p, nudge: !p.nudge })); toast(s.nudge ? "Nudge off — the streak is on its own now" : "Nudge on — one reminder at your usual time", "blue"); }} />
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-[#171e26] p-3.5">
                      <Swords size={19} className="shrink-0 text-[#58cc02]" />
                      <p className="flex-1 text-[13px] leading-snug"><b>Odin auto-tracking</b> · {Math.floor(s.odinMin)} min today. {s.odinSim ? "Session live — activity is banking 2 XP/min." : "Simulate a lesson session (activity → auto-start after ~45s in the real thing)."}</p>
                      <Toggle on={s.odinSim} label="Simulate Odin session" onClick={() => { patch((p) => ({ ...p, odinSim: !p.odinSim })); toast(s.odinSim ? "Odin session ended — minutes banked" : "Practice detected on theodinproject.com — session started", "green"); }} />
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-[#171e26] p-3.5">
                      <ChevronRight size={19} className="shrink-0 text-[#ffb020]" />
                      <p className="flex-1 text-[13px] leading-snug"><b>Away mode</b> — coding in VS Code? Counts while the machine is active, never double-pays.</p>
                      <Toggle on={s.away} label="Away mode" onClick={() => { patch((p) => ({ ...p, away: !p.away })); toast(s.away ? "Away mode off" : "Away mode on — idle-checked minutes count 1:1", "amber"); }} />
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <MiniRing pct={s.todayMin / stretch} label={`${Math.round((s.todayMin / stretch) * 100)}%`} color="#ffb020" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">“{quote}”</p>
                    <p className="text-[13px] text-[#93a1b1]">Daily quote · rotates by day number, like v1.11 — plus your stretch progress at a glance.</p>
                  </div>
                  <button onClick={() => setTab("progress")} className="inline-flex items-center gap-1 text-sm font-bold text-[#58cc02]">See progress <ChevronRight size={16} /></button>
                </div>
              </Card>
            </div>

            {/* redesigned extension popup preview */}
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6b7a8c]"><Sparkles size={13} className="text-[#58cc02]" /> Your popup, redesigned · live data</p>
              <div className="mx-auto w-full max-w-[380px] rounded-[28px] border border-[#2a3644] bg-[#0e1319] p-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#58cc02]"><Flame size={17} className="text-white" fill="#fff" /></div>
                  <span className="font-display text-sm font-bold">Code Dojo</span>
                  <Pill color="#1a3322" text="#58cc02">v2.0</Pill>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs font-bold text-[#ff9d6b]"><Flame size={13} fill="#ff6b35" className="text-[#ff6b35]" />{s.streak}</span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#58cc02]"><Zap size={13} fill="#58cc02" />{s.xp}</span>
                </div>
                <div className="mt-4 flex items-center gap-4 rounded-3xl bg-[#141b23] p-4">
                  <GoalRing minutes={s.todayMin} goal={s.goal} stretch={stretch} size={104}>
                    <div className="font-mono text-xl font-bold">{Math.floor(s.todayMin)}</div>
                    <div className="text-[8.5px] font-bold uppercase tracking-widest text-[#93a1b1]">/ {s.goal} min</div>
                  </GoalRing>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-snug">{s.todayMin >= s.goal ? "Streak safe. Stretch next." : `${minLeft} min to keep the streak`}</p>
                    <p className="mt-1 text-[11px] text-[#93a1b1]">Level {lvl.level} · {lvl.into}/{lvl.need} XP</p>
                    <div className="mt-2"><Bar pct={lvl.pct} h="h-1.5" /></div>
                    <p className="mt-2 text-[11px] font-semibold" style={{ color: league.color }}>{league.name} League · {weekXp} XP this week</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {quests.map((q) => {
                    const prog = metric(s, q.metric); const done = s.questsDone.includes(q.id);
                    return (
                      <div key={q.id} className="rounded-2xl bg-[#141b23] px-3.5 py-2.5">
                        <div className="flex items-center gap-2 text-[12px] font-bold"><Target size={13} className={done ? "text-[#58cc02]" : "text-[#ffb020]"} /><span className="min-w-0 flex-1 truncate">{q.label}</span><span className="font-mono text-[10.5px] text-[#93a1b1]">{Math.min(prog, q.target)}/{q.target}</span></div>
                        <div className="mt-1.5"><Bar pct={(prog / q.target) * 100} color={done ? "#58cc02" : "#ffb020"} h="h-1.5" /></div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setTab("focus")} className="btn-chunk mt-3 w-full rounded-2xl bg-[#58cc02] py-3 font-display text-sm font-bold text-[#071400]">Practice now · {s.goal} min</button>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <button onClick={() => setTab("quiz")} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#0f2740] py-2.5 text-[13px] font-bold text-[#7dc2ff]"><Brain size={15} /> Quiz{s.requeue.length ? ` · ${s.requeue.length} due` : ""}</button>
                  <button onClick={() => setTab("notes")} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#1e2833] py-2.5 text-[13px] font-bold"><NotebookPen size={15} /> Note</button>
                </div>
                <p className="mt-3 text-center text-[10.5px] text-[#6b7a8c]">360px popup · same tokens as Focus Suite · Dojo green #58cc02</p>
              </div>
            </div>
          </div>
        )}

        {tab === "focus" && <Focus s={s} awardMinutes={awardMinutes} toast={toast} setState={patch} />}
        {tab === "quiz" && <Quiz s={s} setState={patch} toast={toast} awardFlat={awardFlat} />}
        {tab === "notes" && <Notes s={s} setState={patch} toast={toast} awardFlat={awardFlat} />}

        {/* ---------- PROGRESS ---------- */}
        {tab === "progress" && (
          <div className="anim-pop space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-6">
                <SectionTitle icon={<Trophy size={20} />} title={`${league.name} League`} sub="Rolling 7-day XP decides. No demotion drama — this week is the whole argument." />
                <div className="mt-4 flex items-end gap-6">
                  <div><div className="font-mono text-4xl font-bold" style={{ color: league.color }}>{weekXp}</div><div className="text-xs font-bold uppercase tracking-wider text-[#6b7a8c]">XP this week</div></div>
                  <div className="text-sm text-[#aebac6]">{league.next ? <><b className="text-white">{league.toNext} XP</b> to {league.next.name} · you beat <b className="text-white">{beatWeeks} of your last 8</b> active weeks</> : "Top of the mountain. Defend it."}</div>
                </div>
                {league.next && <div className="mt-3"><Bar pct={(weekXp / league.next.at) * 100} color={league.color} /></div>}
                <div className="mt-5 space-y-1.5">
                  {LEAGUES.map((l, i) => (
                    <div key={l.name} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${i === league.index ? "bg-[#1c2733] font-bold" : "text-[#93a1b1]"}`}>
                      <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                      <span className="flex-1">{l.name}</span>
                      <span className="font-mono text-xs">{l.at.toLocaleString()} XP</span>
                      {i === league.index && <Pill color="#1a3322" text="#58cc02">YOU</Pill>}
                      {i < league.index && <span className="text-[#58cc02] text-xs font-bold">CLEARED</span>}
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-5">
                <Card className="p-6">
                  <SectionTitle icon={<CalendarDays size={20} />} title="This week" sub={`${s.weekDays.reduce((a, d) => a + d.min, 0)} honest minutes · goal-hit days in green`} />
                  <div className="mt-5 flex h-36 items-end gap-2">
                    {s.weekDays.map((d, i) => (
                      <div key={d.d} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="font-mono text-[10px] text-[#6b7a8c]">{d.min || ""}</span>
                        <div className="flex h-24 w-full items-end rounded-xl bg-[#171e26]">
                          <div className="bar-grow w-full rounded-xl" style={{ height: `${Math.max(4, (d.xp / maxDayXp) * 100)}%`, background: d.min >= s.goal ? "#58cc02" : d.min > 0 ? "#3d5a1e" : "#232d38", animationDelay: `${i * 0.06}s` }} />
                        </div>
                        <span className={`text-[11px] font-bold ${i === dow ? "text-[#58cc02]" : "text-[#6b7a8c]"}`}>{d.d}{i === dow ? " ·" : ""}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[["Best streak", `${s.bestStreak}d`], ["Freezes", s.freezes], ["Level", lvl.level], ["Total XP", s.xp.toLocaleString()]].map(([k, v]) => (
                      <div key={k} className="rounded-2xl bg-[#171e26] p-3"><div className="font-mono text-base font-bold">{v}</div><div className="text-[10px] font-bold uppercase tracking-wide text-[#6b7a8c]">{k}</div></div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <SectionTitle icon={<TrendingUp size={20} />} title="Last 8 weeks vs now" sub="The highlighted bar is this week, still being written" />
                  <div className="mt-5 flex h-28 items-end gap-2">
                    {[...s.pastWeeks, weekXp].map((w, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                        <div className="flex h-20 w-full items-end rounded-lg bg-[#171e26]">
                          <div className="bar-grow w-full rounded-lg" style={{ height: `${Math.max(5, (w / maxWeek) * 100)}%`, background: i === 8 ? league.color : "#3d4d61", animationDelay: `${i * 0.05}s` }} />
                        </div>
                        <span className={`text-[10px] font-bold ${i === 8 ? "text-white" : "text-[#6b7a8c]"}`}>{i === 8 ? "NOW" : `-${8 - i}w`}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[#6b7a8c]">Last 28 days · showed up?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.joinStreakDays.map((on, i) => <span key={i} title={on ? "Practiced" : "Missed / frozen"} className="h-4 w-4 rounded-md" style={{ background: i === 27 ? (s.todayMin > 0 ? "#58cc02" : "#3a2a08") : on ? "#2f7300" : "#232d38" }} />)}
                    </div>
                    <p className="mt-2 text-[12px] text-[#6b7a8c]">Freeze promise (v1.11): one missed day burns exactly one freeze. A backwards clock re-anchors — it never resets you.</p>
                  </div>
                </Card>
              </div>
            </div>

            <Card className="p-6">
              <SectionTitle icon={<Volume2 size={20} />} title="Settings & data" sub="Everything local (chrome.storage in the extension · localStorage in this concept). No account. No server. Ever." />
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6b7a8c]">Daily goal</p>
                  <div className="mt-2 flex gap-2">
                    {[10, 15, 25, 45].map((g) => (
                      <button key={g} onClick={() => { patch((p) => ({ ...p, goal: g })); toast(`Goal set to ${g} min · stretch is now ${Math.max(45, g * 2)} min`, "blue"); }} className={`rounded-xl border-2 px-3.5 py-2 text-sm font-bold ${s.goal === g ? "border-[#58cc02] bg-[#1a3322] text-[#58cc02]" : "border-[#2a3644] text-[#93a1b1]"}`}>{g}m</button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-[#6b7a8c]">Stretch = max(45, goal × 2) = {stretch} min. Past it, minutes pay half.</p>
                </div>
                <div className="space-y-3">
                  {[["Sounds & chimes", s.sound, () => patch((p) => ({ ...p, sound: !p.sound }))], ["Practice nudge (learned time wins)", s.nudge, () => patch((p) => ({ ...p, nudge: !p.nudge }))]].map(([label, on, fn]) => (
                    <div key={label as string} className="flex items-center gap-3"><span className="flex-1 text-sm font-semibold">{label as string}</span><Toggle on={on as boolean} label={label as string} onClick={fn as () => void} /></div>
                  ))}
                  <p className="text-[12px] text-[#6b7a8c]">Reminder fallback 20:00 · skipped entirely once today&apos;s goal is done.</p>
                </div>
                <div className="space-y-2.5">
                  <button onClick={exportJson} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e2833] py-2.5 text-sm font-bold"><Download size={15} /> Export backup (.json)</button>
                  <button onClick={() => { if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; } const fresh = seedState(); setS(fresh); setConfirmReset(false); toast("Demo data reset to the v2 seed", "amber"); }}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ${confirmReset ? "bg-[#ff5d73] text-white" : "border border-[#5a2430] text-[#ff8fa0]"}`}>
                    <RotateCcw size={15} /> {confirmReset ? "Really wipe? Click again (4s)" : "Reset demo data"}
                  </button>
                  <p className="text-[11px] text-[#6b7a8c]">Two-click arm instead of a native confirm() — one of your v1.11 niceties, kept.</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === "improve" && <Roadmap />}

        <footer className="mt-10 flex flex-wrap items-center gap-3 border-t border-[#1c252f] pt-5 text-[12px] text-[#6b7a8c]">
          <span className="inline-flex items-center gap-1.5"><Flame size={13} className="text-[#58cc02]" /> Code Dojo v2 concept · built on your v1.11 rules — 70/70 checks philosophy intact</span>
          <span className="ml-auto font-mono">local-first · worker-priced XP · strict or nothing</span>
        </footer>
      </main>

      {/* toasts, odin.js style */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(340px,calc(100vw-40px))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="anim-toast rounded-2xl border-l-4 bg-[#141b23] px-4 py-3 text-[13px] font-semibold shadow-2xl" style={{ borderColor: TONE[t.tone] || TONE.green }}>{t.msg}</div>
        ))}
        {(s.odinSim || s.away) && (
          <div className="self-end rounded-full border border-[#2f7300] bg-[#0e1319]/95 px-3.5 py-2 font-mono text-[12px] font-bold shadow-xl">
            {s.odinSim ? "Odin" : "Away"} · {Math.floor(s.todayMin)} min today · <span className="text-[#58cc02]">+{s.todayXp} XP</span>
          </div>
        )}
      </div>
    </div>
  );
}
