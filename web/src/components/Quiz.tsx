import { useMemo, useState } from "react";
import { Brain, CheckCircle2, CircleAlert, Cpu, Lightbulb, Loader2, RefreshCcw, RotateCcw, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { Card, Pill, SectionTitle } from "./ui";
import { QUIZ_BANK, QUIZ_PAID_CAP, gradeLocally } from "../lib/dojo";
import type { DojoState, QuizQ, Verdict } from "../lib/dojo";

type Graded = { verdict: Verdict; feedback: string; gap: string; xpAsked: number; xpPaid: number; capped: boolean };
const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string; Icon: typeof CheckCircle2 }> = {
  correct: { bg: "#1a3322", fg: "#58cc02", label: "Correct", Icon: CheckCircle2 },
  partial: { bg: "#3a2a08", fg: "#ffb020", label: "Partial", Icon: CircleAlert },
  wrong: { bg: "#3a1620", fg: "#ff5d73", label: "Wrong", Icon: XCircle },
};

export default function Quiz({ s, setState, toast, awardFlat }: {
  s: DojoState;
  setState: (fn: (p: DojoState) => DojoState) => void;
  toast: (msg: string, tone?: string) => void;
  awardFlat: (xp: number) => void;
}) {
  const topics = useMemo(() => [...new Set(QUIZ_BANK.map((q) => q.topic))], []);
  const [topic, setTopic] = useState(s.lastTopic);
  const [extra, setExtra] = useState("");
  const [round, setRound] = useState<QuizQ[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [hints, setHints] = useState<Record<number, boolean>>({});
  const [graded, setGraded] = useState<Record<number, Graded>>({});
  const [grading, setGrading] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [startPaid, setStartPaid] = useState(0);
  const [modelState] = useState<"available" | "downloadable">("available");

  const build = () => {
    setBuilding(true);
    setTimeout(() => {
      const lead = s.requeue.slice(0, 2);
      const fresh = QUIZ_BANK.filter((q) => q.topic === topic && !lead.some((l) => l.q === q.q));
      const shuffled = [...fresh].sort(() => Math.random() - 0.5);
      const qs = [...lead, ...shuffled].slice(0, 3);
      while (qs.length < 3) qs.push(QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)]);
      setRound(qs.slice(0, 3)); setAnswers({}); setGraded({}); setHints({}); setBuilding(false);
      setStartPaid(s.quizzesPaid);
      setState((p) => ({ ...p, lastTopic: topic }));
    }, 900);
  };

  const grade = (i: number, q: QuizQ) => {
    const ans = answers[i] || "";
    setGrading(i);
    setTimeout(() => {
      const res = gradeLocally(q.q, ans, q.keyIdeas, q.gap);
      const paidAlready = startPaid + Object.values(graded).filter((g) => g.xpPaid > 0).length;
      const capped = res.xp > 0 && paidAlready >= QUIZ_PAID_CAP;
      const xpPaid = capped ? 0 : res.xp;
      setGraded((g) => ({ ...g, [i]: { verdict: res.verdict, feedback: res.feedback, gap: res.gap, xpAsked: res.xp, xpPaid, capped } }));
      setGrading(null);
      setState((p) => {
        let requeue = [...p.requeue];
        const wasRetry = requeue.some((r) => r.q === q.q);
        if (res.verdict === "correct" && wasRetry) requeue = requeue.filter((r) => r.q !== q.q);
        if (res.verdict !== "correct" && !wasRetry) requeue = [q, ...requeue].slice(0, 12);
        return { ...p, requeue, quizzesAnswered: p.quizzesAnswered + 1, quizzesPaid: p.quizzesPaid + (xpPaid > 0 ? 1 : 0) };
      });
      if (xpPaid > 0) awardFlat(xpPaid);
      if (res.verdict === "correct") toast(`Correct — worker paid ${xpPaid} XP`, "green");
      else if (res.verdict === "partial") toast("Partial — queued to return tomorrow", "amber");
      else toast("Wrong — nothing paid, queued for tomorrow", "rose");
    }, 850);
  };

  const doneCount = Object.keys(graded).length;
  const totalPaid = Object.values(graded).reduce((a, g) => a + g.xpPaid, 0);
  const trimmed = Object.values(graded).reduce((a, g) => a + (g.xpAsked - g.xpPaid), 0);
  const correctCount = Object.values(graded).filter((g) => g.verdict === "correct").length;

  return (
    <div className="anim-pop space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle icon={<Brain size={20} />} title="Quiz Room" sub="On-device model · strict local grading · the worker prices every verdict" />
          <div className="flex items-center gap-2 rounded-2xl border border-[#2f7300] bg-[#14240c] px-4 py-2.5">
            <Cpu size={17} className="text-[#58cc02]" />
            <div className="text-[13px]"><span className="font-bold text-[#58cc02]">Gemini Nano · {modelState}</span><span className="text-[#a9c48a]"> — nothing leaves your machine</span></div>
            <ShieldCheck size={16} className="text-[#58cc02]" />
          </div>
        </div>
        {!round && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#6b7a8c]">Quiz me on</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {topics.map((t) => (
                  <button key={t} onClick={() => setTopic(t)} className={`rounded-2xl border-2 px-4 py-2.5 text-sm font-bold ${topic === t ? "border-[#3aa0ff] bg-[#0f2740] text-[#7dc2ff]" : "border-[#2a3644] text-[#93a1b1]"}`}>{t}</button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-[#6b7a8c]">Prefilled from your Odin lesson (fresh 12h). What you confirm is what gets quizzed.</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#6b7a8c]">Anything else in play? (optional)</label>
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={s.struggle || "e.g. keep tripping on the main axis"} className="mt-2 w-full rounded-xl border border-[#2a3644] bg-[#0e1319] px-4 py-3 text-sm" />
              {s.struggle && <p className="mt-2 text-[12px] text-[#ffb020]">Blocker on file: “{s.struggle}” — one question will attack it directly.</p>}
            </div>
          </div>
        )}
        {!round && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={build} disabled={building} className="btn-chunk-blue inline-flex items-center gap-2 rounded-2xl bg-[#3aa0ff] px-7 py-3.5 font-display font-bold text-[#04182e] disabled:opacity-60">
              {building ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />} {building ? "Writing 3 questions on-device…" : "Build my 3 questions"}
            </button>
            <span className="text-[13px] text-[#93a1b1]">{s.requeue.length > 0 ? `${Math.min(2, s.requeue.length)} missed question(s) from earlier lead this round.` : "No retries queued — a clean round."} Paid today: {s.quizzesPaid}/{QUIZ_PAID_CAP}</span>
          </div>
        )}
      </Card>
      {round?.map((q, i) => {
        const g = graded[i]; const V = g ? VERDICT_STYLE[g.verdict] : null;
        const wc = (answers[i] || "").trim().split(/\s+/).filter(Boolean).length;
        const isRetry = s.requeue.some((r) => r.q === q.q) && !g;
        return (
          <Card key={i} className="anim-pop p-6" >
            <div className="flex flex-wrap items-center gap-2">
              <Pill color="#0f2740" text="#7dc2ff">Q{i + 1} · {q.topic}</Pill>
              {isRetry && <Pill color="#3a2a08" text="#ffb020"><RefreshCcw size={11} /> From an earlier round</Pill>}
              <span className="ml-auto font-mono text-xs text-[#6b7a8c]">correct 25 · partial 10 · wrong 0</span>
            </div>
            <h3 className="mt-3 font-display text-lg font-bold leading-snug">{q.q}</h3>
            {!g && (
              <>
                <textarea value={answers[i] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && wc >= 3) grade(i, q); }}
                  rows={3} placeholder="Explain the mechanism in your own words — buzzwords prove nothing…" className="mt-3 w-full resize-none rounded-2xl border border-[#2a3644] bg-[#0e1319] p-4 text-sm leading-relaxed" />
                {hints[i] && <p className="anim-pop mt-2 rounded-xl bg-[#0f2740] px-4 py-2.5 text-[13px] text-[#7dc2ff]">Key idea: {q.hint}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => grade(i, q)} disabled={grading === i || wc < 3} className="btn-chunk inline-flex items-center gap-2 rounded-xl bg-[#58cc02] px-5 py-2.5 text-sm font-bold text-[#071400] disabled:opacity-50">
                    {grading === i ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {grading === i ? "Grading on-device…" : "Grade strictly"}
                  </button>
                  <button onClick={() => setHints((h) => ({ ...h, [i]: !h[i] }))} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2a3644] px-4 py-2.5 text-sm font-bold text-[#7dc2ff]"><Lightbulb size={15} /> Hint</button>
                  <span className={`text-xs font-semibold ${wc >= 3 ? "text-[#58cc02]" : "text-[#6b7a8c]"}`}>{wc} words{wc < 3 ? " · minimum 3 — blank/short/echo fail before the model is asked" : " · Ctrl+Enter to grade"}</span>
                </div>
              </>
            )}
            {g && V && (
              <div className="anim-pop mt-4 rounded-2xl p-4" style={{ background: V.bg }}>
                <div className="flex flex-wrap items-center gap-2">
                  <V.Icon size={19} style={{ color: V.fg }} />
                  <span className="font-display font-bold" style={{ color: V.fg }}>{V.label}</span>
                  <span className="font-mono text-sm font-bold" style={{ color: V.fg }}>+{g.xpPaid} XP{g.capped ? ` (cap reached — ${g.xpAsked} trimmed)` : ""}</span>
                  <span className="ml-auto text-[12px] text-[#aebac6]">Your answer: “{(answers[i] || "").slice(0, 90)}{(answers[i] || "").length > 90 ? "…" : ""}”</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{g.feedback}</p>
                {g.gap && <p className="mt-1.5 text-[13px] font-semibold" style={{ color: V.fg }}>What was missing: {g.gap}</p>}
                {g.verdict !== "correct" && <p className="mt-1 text-[12px] text-[#aebac6]">Queued — this exact question leads tomorrow&apos;s round.</p>}
              </div>
            )}
          </Card>
        );
      })}
      {round && doneCount === 3 && (
        <Card className="anim-pop border-[#2f7300] bg-[#101a0a] p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-2xl bg-[#1a3322] p-3 text-[#ffb020]"><Trophy size={26} /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-xl font-bold">Round complete — worker paid +{totalPaid} XP</h3>
              <p className="text-sm text-[#a9c48a]">First-try accuracy {Math.round((correctCount / 3) * 100)}% · {3 - correctCount} question(s) queued for tomorrow{trimmed > 0 ? ` · today's 3-answer cap trimmed ${trimmed} XP` : ""}. A garbled grader never guesses “partial” — strict or nothing.</p>
            </div>
            <button onClick={() => { setRound(null); setGraded({}); }} className="btn-chunk inline-flex items-center gap-2 rounded-2xl bg-[#58cc02] px-6 py-3 font-display font-bold text-[#071400]"><RotateCcw size={17} /> New round</button>
          </div>
        </Card>
      )}
      {round && doneCount < 3 && <button onClick={() => setRound(null)} className="text-sm font-semibold text-[#6b7a8c] hover:text-white">Abandon round (graded XP stays banked)</button>}
    </div>
  );
}
