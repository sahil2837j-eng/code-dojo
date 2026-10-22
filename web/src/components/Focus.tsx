import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, FastForward, Keyboard, Pause, Play, RotateCcw, Send, SkipForward, Timer, Trophy, X } from "lucide-react";
import { Card, Pill, SectionTitle } from "./ui";
import { chime, priceMinutes } from "../lib/dojo";
import type { DojoState } from "../lib/dojo";

const DURATIONS = [15, 25, 50];
const CONFETTI = ["#58cc02", "#3aa0ff", "#ffb020", "#ff6b35", "#ff5d73", "#6fd3e7"];

export default function Focus({ s, awardMinutes, toast, setState }: {
  s: DojoState;
  awardMinutes: (mins: number, source: string) => { xp: number; discounted: number; leveled: boolean; level: number };
  toast: (msg: string, tone?: string) => void;
  setState: (fn: (p: DojoState) => DojoState) => void;
}) {
  const [dur, setDur] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<1 | 60>(1);
  const [phase, setPhase] = useState<"idle" | "focus" | "done" | "break">("idle");
  const [breakLeft, setBreakLeft] = useState(5 * 60);
  const [breakRun, setBreakRun] = useState(false);
  const [lastPay, setLastPay] = useState<{ xp: number; discounted: number } | null>(null);
  const [struggle, setStruggle] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const bankedRef = useRef(0);
  const bankedXpRef = useRef(0);
  const elapsedRef = useRef(0);
  const leftRef = useRef(25 * 60);
  const startMinRef = useRef(0);
  const total = dur * 60;
  const pct = phase === "break" ? breakLeft / (5 * 60) : left / total;
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  const finish = useCallback(() => {
    setRunning(false); setPhase("done");
    /* only ELAPSED minutes are ever banked — finishing early pays for honesty, not intention */
    const elapsedMin = elapsedRef.current / 60;
    const remaining = +(elapsedMin - bankedRef.current).toFixed(2);
    let totalXp = bankedXpRef.current;
    let discounted = 0;
    if (remaining > 0) {
      const priced = priceMinutes(remaining, startMinRef.current + bankedRef.current, s.goal);
      const res = awardMinutes(remaining, "focus-complete");
      totalXp += res.xp; discounted = priced.discountedMin;
    }
    setLastPay({ xp: totalXp, discounted });
    if (elapsedMin >= dur - 0.05) setState((p) => ({ ...p, sessions: p.sessions + 1 }));
    bankedRef.current = 0; bankedXpRef.current = 0; elapsedRef.current = 0;
    setShowConfetti(true);
    if (s.sound) chime("win");
    toast(`Session banked — ${Math.floor(elapsedMin)} min of real practice, priced by the worker`, "green");
    setTimeout(() => setShowConfetti(false), 1800);
    document.title = "Code Dojo v2 — Daily Coding Practice, Redesigned";
  }, [dur, s.goal, s.sound, awardMinutes, setState, toast]);

  /* focus ticker + 30s heartbeat (0.5 min quiet award, like practice.js) */
  useEffect(() => { leftRef.current = left; }, [left]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const next = Math.max(0, leftRef.current - speed);
      leftRef.current = next;
      setLeft(next);
      elapsedRef.current = total - next;
      const shouldBank = Math.floor(elapsedRef.current / 30) * 0.5;
      if (shouldBank > bankedRef.current && next > 0) {
        const res = awardMinutes(shouldBank - bankedRef.current, "heartbeat");
        bankedXpRef.current += res.xp;
        bankedRef.current = shouldBank;
      }
      if (next <= 0) { clearInterval(id); elapsedRef.current = total; setTimeout(finish, 50); return; }
      document.title = `${mmss(next)} · focus — Code Dojo`;
    }, 1000);
    return () => clearInterval(id);
  }, [running, speed, total, awardMinutes, finish]);

  useEffect(() => {
    if (!breakRun) return;
    const id = setInterval(() => setBreakLeft((p) => {
      if (p - speed <= 0) { clearInterval(id); setBreakRun(false); if (s.sound) chime("level"); toast("Break over — round two?", "amber"); return 0; }
      return p - speed;
    }), 1000);
    return () => clearInterval(id);
  }, [breakRun, speed, s.sound, toast]);

  const startPause = useCallback(() => {
    if (phase === "done" || phase === "break") { setPhase("focus"); setLeft(dur * 60); leftRef.current = dur * 60; bankedRef.current = 0; bankedXpRef.current = 0; elapsedRef.current = 0; startMinRef.current = s.todayMin; setRunning(true); return; }
    if (!running && phase === "idle") { setPhase("focus"); startMinRef.current = s.todayMin; }
    setRunning((r) => !r);
  }, [phase, running, dur, s.todayMin]);

  const reset = useCallback(() => {
    setRunning(false); setPhase("idle"); setLeft(dur * 60); leftRef.current = dur * 60; bankedRef.current = 0; bankedXpRef.current = 0; elapsedRef.current = 0; setLastPay(null);
    document.title = "Code Dojo v2 — Daily Coding Practice, Redesigned";
  }, [dur]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); startPause(); }
      if (e.key.toLowerCase() === "r") reset();
      if (["1", "2", "3"].includes(e.key)) { const d = DURATIONS[+e.key - 1]; setDur(d); if (!running) setLeft(d * 60); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startPause, reset, running]);

  const r = 96; const c = 2 * Math.PI * r;
  const ringColor = phase === "break" ? "#ffb020" : "#58cc02";

  return (
    <div className="anim-pop grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        {showConfetti && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 26 }).map((_, i) => (
              <span key={i} className="confetti-piece absolute top-0 h-3 w-2 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.09}s` }} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<Timer size={20} />} title="Focus Room" sub="Premium session · countdown in the tab title · heartbeat banks XP every 30s" />
          <button onClick={() => setSpeed(speed === 1 ? 60 : 1)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${speed === 60 ? "border-[#ffb020] bg-[#3a2a08] text-[#ffb020]" : "border-[#2a3644] text-[#93a1b1]"}`}>
            <FastForward size={14} /> {speed === 60 ? "Demo speed 60× ON" : "Demo speed 60×"}
          </button>
        </div>
        <div className="mt-6 flex flex-col items-center">
          <div className="relative">
            <svg viewBox="0 0 230 230" width={240} height={240} className="-rotate-90">
              <circle cx="115" cy="115" r={r} fill="none" strokeWidth="14" className="ring-track" />
              <circle cx="115" cy="115" r={r} fill="none" stroke={ringColor} strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, pct))} className="ring-anim" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-5xl font-bold tracking-tight">{phase === "break" ? mmss(breakLeft) : mmss(left)}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#93a1b1]">
                {phase === "break" ? "Break · breathe" : phase === "done" ? "Session banked" : running ? "Focusing · stay here" : "Ready when you are"}
              </div>
              {running && <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#58cc02]"><span className="pulse-dot h-2 w-2 rounded-full bg-[#58cc02]" /> +2 XP / min banking</div>}
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            {DURATIONS.map((d, i) => (
              <button key={d} onClick={() => { setDur(d); if (!running) { setLeft(d * 60); setPhase("idle"); } }}
                className={`rounded-2xl border-2 px-5 py-2.5 font-display text-sm font-bold ${dur === d ? "border-[#58cc02] bg-[#1a3322] text-[#58cc02]" : "border-[#2a3644] text-[#93a1b1] hover:border-[#3d4d61]"}`}>
                {d} min <span className="ml-1 font-mono text-[10px] opacity-60">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button onClick={startPause} className="btn-chunk inline-flex items-center gap-2 rounded-2xl bg-[#58cc02] px-8 py-3.5 font-display text-base font-bold text-[#071400]">
              {running ? <Pause size={19} /> : <Play size={19} />} {phase === "done" ? "Start round two" : running ? "Pause" : phase === "focus" ? "Resume" : "Start focus"}
            </button>
            <button onClick={reset} className="btn-chunk-dark inline-flex items-center gap-2 rounded-2xl bg-[#1e2833] px-6 py-3.5 font-display text-base font-bold text-[#c7d0db]">
              <RotateCcw size={18} /> Reset
            </button>
            {phase === "focus" && !running && left < total && (
              <button onClick={finish} className="inline-flex items-center gap-2 rounded-2xl border border-[#2a3644] px-5 py-3.5 text-sm font-bold text-[#ffb020]">Bank &amp; finish early</button>
            )}
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-[#6b7a8c]"><Keyboard size={14} /> Space start/pause · R reset · 1–3 duration</p>
        </div>
        {phase === "done" && (
          <div className="anim-pop mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#2f7300] bg-[#14240c] p-4">
              <Trophy className="text-[#ffb020]" size={24} />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">Round complete — the worker paid {lastPay?.xp ?? 0} XP</p>
                <p className="text-[13px] text-[#a9c48a]">{lastPay && lastPay.discounted > 0 ? `${lastPay.discounted} min were past your stretch, so they paid half — honest to the minute.` : "Every minute at full rate. That is where it sticks."}</p>
              </div>
              <button onClick={() => { setPhase("break"); setBreakLeft(5 * 60); setBreakRun(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#ffb020] px-4 py-2.5 text-sm font-bold text-[#2a1a00]"><Coffee size={16} /> 5-min break</button>
            </div>
            <div className="rounded-2xl border border-[#232d38] bg-[#171e26] p-4">
              <p className="font-display font-bold">What couldn&apos;t you do today?</p>
              <p className="mt-0.5 text-[13px] text-[#93a1b1]">One honest line. Tomorrow&apos;s quiz attacks exactly this — this loop is the whole point.</p>
              <div className="mt-3 flex gap-2">
                <input value={struggle} onChange={(e) => setStruggle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && struggle.trim()) { setState((p) => ({ ...p, struggle: struggle.trim() })); toast("Saved — tomorrow's quiz will attack this first", "blue"); setStruggle(""); } }}
                  placeholder="e.g. align-items vs align-content" className="min-w-0 flex-1 rounded-xl border border-[#2a3644] bg-[#0e1319] px-4 py-3 text-sm" />
                <button onClick={() => { if (struggle.trim()) { setState((p) => ({ ...p, struggle: struggle.trim() })); toast("Saved — tomorrow's quiz will attack this first", "blue"); setStruggle(""); } }} className="btn-chunk inline-flex items-center gap-1.5 rounded-xl bg-[#58cc02] px-4 py-3 text-sm font-bold text-[#071400]"><Send size={15} /> Save</button>
              </div>
            </div>
          </div>
        )}
        {phase === "break" && (
          <div className="anim-pop mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setBreakRun((b) => !b)} className="rounded-xl bg-[#ffb020] px-5 py-2.5 text-sm font-bold text-[#2a1a00]">{breakRun ? "Pause break" : "Resume break"}</button>
            <button onClick={() => { setPhase("idle"); setBreakRun(false); setLeft(dur * 60); }} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2a3644] px-5 py-2.5 text-sm font-bold"><SkipForward size={15} /> Skip — round two</button>
          </div>
        )}
      </Card>
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="font-display font-bold">How this session pays</h3>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-[#aebac6]">
            <li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#58cc02]" />Heartbeat every 30s banks 0.5 min quietly — close the tab, keep the XP.</li>
            <li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ffb020]" />Past your {Math.max(45, s.goal * 2)}-min stretch, minutes pay half (1 XP). The ring shows it before the worker does.</li>
            <li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3aa0ff]" />20-min continuity rule: reloads resume, long gaps void. Focus must be continuous — that&apos;s the XP&apos;s honesty.</li>
            <li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ff5d73]" />The page never names its price. The worker prices every minute.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-display font-bold">Today so far</h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[["Minutes", Math.floor(s.todayMin)], ["Sessions", s.sessions], ["XP today", s.todayXp]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-[#171e26] p-3"><div className="font-mono text-xl font-bold">{v}</div><div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a8c]">{k}</div></div>
            ))}
          </div>
          {s.struggle && <div className="mt-4 flex items-start justify-between gap-2 rounded-2xl border border-[#3a2a08] bg-[#241b05] p-3"><p className="text-[13px]"><span className="font-bold text-[#ffb020]">Queued blocker:</span> {s.struggle}</p><button onClick={() => setState((p) => ({ ...p, struggle: "" }))} aria-label="Clear blocker"><X size={15} className="text-[#93a1b1]" /></button></div>}
          <div className="mt-4"><Pill color="#1a3322" text="#58cc02">Wake lock ready</Pill> <Pill>Title countdown on</Pill></div>
        </Card>
      </div>
    </div>
  );
}
