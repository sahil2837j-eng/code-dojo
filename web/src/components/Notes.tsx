import { useState } from "react";
import { Check, Copy, Cpu, Loader2, NotebookPen, PenLine, ShieldAlert, Sparkles, X } from "lucide-react";
import { Card, Pill, SectionTitle } from "./ui";
import { CHECK_DEFS, NOTE_MAX_CHARS, NOTES_PAID_CAP, XP_PER_CHECK, capForText, checksPassed, jaccard, noteWordCount, reviewNoteLocally } from "../lib/dojo";
import type { DojoState, Note } from "../lib/dojo";

export default function Notes({ s, setState, toast, awardFlat }: {
  s: DojoState;
  setState: (fn: (p: DojoState) => DojoState) => void;
  toast: (msg: string, tone?: string) => void;
  awardFlat: (xp: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviseId, setReviseId] = useState<number | null>(null);
  const [reviseText, setReviseText] = useState("");
  const wc = noteWordCount(draft);
  const cap = capForText(draft);
  const nextAt = cap === 1 ? 5 : cap === 2 ? 10 : cap === 3 ? 15 : null;

  const save = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (text.length < 15) { toast("Notes need at least 15 characters — say one real thing", "rose"); return; }
    const dup = s.notes.some((n) => jaccard(text, n.text) >= 0.7);
    const note: Note = { id: Date.now(), text, topic: s.lastTopic, at: "Just now", xp: 0, duplicate: dup };
    setState((p) => ({ ...p, notes: [note, ...p.notes].slice(0, 60), notesCount: p.notesCount + 1 }));
    setDraft("");
    toast(dup ? "Saved — but this is a near-duplicate, so it can never pay XP" : "Note saved. Review it to earn up to 20 XP", dup ? "amber" : "green");
  };

  const review = (note: Note, isRevision = false, newText?: string) => {
    setReviewing(note.id);
    setTimeout(() => {
      const text = newText ?? note.text;
      const res = reviewNoteLocally(text);
      const earnedRaw = checksPassed(res.checks) * XP_PER_CHECK;
      let pay = 0;
      if (!note.duplicate) {
        if (isRevision) pay = Math.max(0, earnedRaw - note.xp);
        else pay = s.notesPaid >= NOTES_PAID_CAP ? 0 : earnedRaw;
      }
      setState((p) => ({
        ...p,
        notesPaid: !isRevision && pay >= 0 && p.notesPaid < NOTES_PAID_CAP ? p.notesPaid + 1 : p.notesPaid,
        notes: p.notes.map((n) => n.id === note.id ? { ...n, text, firstText: isRevision ? (n.firstText ?? n.text) : n.firstText, checks: res.checks, comment: res.comment, rewrite: res.rewrite, xp: n.xp + pay, revised: isRevision || n.revised } : n),
      }));
      if (pay > 0) awardFlat(pay);
      setReviewing(null); setReviseId(null);
      toast(note.duplicate ? "Reviewed — duplicates never pay" : pay > 0 ? `Review paid +${pay} XP (${checksPassed(res.checks)}/4 checks)` : `Reviewed: ${checksPassed(res.checks)}/4 checks — ${isRevision ? "no improvement to pay for" : "daily note cap reached, pays nothing"}`, pay > 0 ? "green" : "amber");
    }, 1000);
  };

  return (
    <div className="anim-pop grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card className="p-6">
          <SectionTitle icon={<NotebookPen size={20} />} title="Learning Notes" sub="One honest note per session beats ten copied ones. The review is strict — and pays only for proof." />
          <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_CHARS))}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save(); }}
            rows={4} placeholder="What actually clicked? Name the concept, give one example you ran, say what's still unsure…"
            className="mt-4 w-full resize-none rounded-2xl border border-[#2a3644] bg-[#0e1319] p-4 text-sm leading-relaxed" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold ${i <= cap && wc > 0 ? "bg-[#58cc02] text-[#071400]" : "bg-[#232d38] text-[#6b7a8c]"}`}>{i}</span>)}
            </div>
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#93a1b1]">
              <span className="font-mono font-bold text-white">{wc} words</span> → at most <span className="font-bold text-[#58cc02]">{cap} of 4 checks</span> can count{nextAt ? ` · ${nextAt - wc} more word(s) unlock check ${cap + 1}` : " · full rubric unlocked"} · {draft.length}/{NOTE_MAX_CHARS}
            </p>
            <button onClick={save} className="btn-chunk inline-flex items-center gap-2 rounded-xl bg-[#58cc02] px-5 py-2.5 text-sm font-bold text-[#071400]"><PenLine size={15} /> Save note</button>
          </div>
          <p className="mt-2 text-[11px] text-[#6b7a8c]">Ctrl+Enter to save · min 15 chars · near-duplicates (Jaccard ≥ 0.7 vs last 14 days) save but never pay · {s.notesPaid}/{NOTES_PAID_CAP} paying notes used today</p>
        </Card>
        {s.notes.map((n) => (
          <Card key={n.id} className="anim-pop p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill color="#0f2740" text="#7dc2ff">{n.topic}</Pill>
              <span className="text-xs text-[#6b7a8c]">{n.at} · {noteWordCount(n.text)} words</span>
              {n.duplicate && <Pill color="#3a2a08" text="#ffb020"><Copy size={11} /> Near-duplicate · pays 0</Pill>}
              {n.xp > 0 && <Pill color="#1a3322" text="#58cc02">+{n.xp} XP paid</Pill>}
              {n.revised && <Pill>Revised once</Pill>}
            </div>
            <p className="mt-3 text-sm leading-relaxed">{n.text}</p>
            {n.firstText && <p className="mt-2 text-[12px] text-[#6b7a8c]">Original: “{n.firstText}”</p>}
            {!n.checks && !n.dismissed && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#2a3644] bg-[#171e26] p-3.5">
                <Cpu size={17} className="text-[#7dc2ff]" />
                <p className="min-w-0 flex-1 text-[13px]">On-device review ready — 4 yes/no checks, points by plain code. Model unavailable? Flat 5 XP floor.</p>
                <button onClick={() => review(n)} disabled={reviewing === n.id} className="btn-chunk-blue inline-flex items-center gap-1.5 rounded-xl bg-[#3aa0ff] px-4 py-2 text-sm font-bold text-[#04182e] disabled:opacity-60">
                  {reviewing === n.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {reviewing === n.id ? "Reviewing…" : "Review it now"}
                </button>
                <button onClick={() => setState((p) => ({ ...p, notes: p.notes.map((x) => x.id === n.id ? { ...x, dismissed: true } : x) }))} className="text-sm font-semibold text-[#6b7a8c]">Not now</button>
              </div>
            )}
            {!n.checks && n.dismissed && <button onClick={() => review(n)} className="mt-3 text-sm font-bold text-[#7dc2ff]">Review for up to 20 XP →</button>}
            {n.checks && (
              <div className="anim-pop mt-4 rounded-2xl bg-[#171e26] p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CHECK_DEFS.map((c) => {
                    const ok = n.checks![c.key];
                    return <div key={c.key} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-bold ${ok ? "bg-[#1a3322] text-[#58cc02]" : "bg-[#2a1a22] text-[#ff8fa0]"}`}>{ok ? <Check size={13} /> : <X size={13} />} {c.label}</div>;
                  })}
                </div>
                <p className="mt-3 text-sm leading-relaxed"><ShieldAlert size={14} className="mr-1 inline text-[#ffb020]" />{n.comment}</p>
                {capForText(n.text) < 4 && <p className="mt-1 text-[12px] text-[#ffb020]">Length cap applied: {noteWordCount(n.text)} words can claim at most {capForText(n.text)} checks — a fragment can&apos;t fake a full note.</p>}
                {n.rewrite && <div className="mt-3 rounded-xl border border-dashed border-[#3d4d61] p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-[#7dc2ff]">Try it stronger (compare, don&apos;t copy)</p><p className="mt-1 text-[13px] text-[#c7d0db]">{n.rewrite}</p></div>}
                {!n.revised && checksPassed(n.checks) < 4 && reviseId !== n.id && (
                  <button onClick={() => { setReviseId(n.id); setReviseText(n.text); }} className="mt-3 text-sm font-bold text-[#58cc02]">Revise once — improvement pays the difference →</button>
                )}
                {reviseId === n.id && (
                  <div className="anim-pop mt-3">
                    <textarea value={reviseText} onChange={(e) => setReviseText(e.target.value.slice(0, NOTE_MAX_CHARS))} rows={3} className="w-full resize-none rounded-xl border border-[#2a3644] bg-[#0e1319] p-3 text-sm" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => review(n, true, reviseText)} disabled={reviewing === n.id} className="btn-chunk rounded-xl bg-[#58cc02] px-4 py-2 text-sm font-bold text-[#071400] disabled:opacity-60">{reviewing === n.id ? "Re-reviewing…" : "Submit revision"}</button>
                      <button onClick={() => setReviseId(null)} className="rounded-xl border border-[#2a3644] px-4 py-2 text-sm font-bold">Cancel</button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#6b7a8c]">Pays only the delta, never above 20 total. Original is kept.</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="font-display font-bold">The 4-check rubric</h3>
          <p className="mt-1 text-[13px] text-[#93a1b1]">5 XP per check · max 20 — deliberately below a 15-min session, so notes never out-earn practice.</p>
          <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-[#aebac6]">
            <li><b className="text-white">1 · Concept</b> — a concrete mechanism, not vibes.</li>
            <li><b className="text-white">2 · Own words</b> — your finding, not copied boilerplate.</li>
            <li><b className="text-white">3 · Example</b> — a snippet, number or specific case.</li>
            <li><b className="text-white">4 · Unsure</b> — what&apos;s unclear → feeds tomorrow&apos;s quiz.</li>
          </ol>
          <div className="mt-4 space-y-1.5 font-mono text-[12px]">
            {[["≥15 words", 4], ["10–14 words", 3], ["5–9 words", 2], ["<5 words", 1]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-[#171e26] px-3 py-2"><span className="text-[#93a1b1]">{k}</span><span className="font-bold text-[#58cc02]">max {v} checks</span></div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-display font-bold">Try to game it (you can&apos;t)</h3>
          <div className="mt-3 space-y-2">
            {["learned stuff today good", "Flexbox flexbox flexbox is flexbox", "Grid uses grid-template-columns to place items in rows and columns, e.g. my 3-column gallery. Still unsure how auto-fit picks column count?"].map((t) => (
              <button key={t} onClick={() => setDraft(t)} className="block w-full rounded-xl border border-[#2a3644] p-3 text-left text-[12.5px] leading-snug text-[#aebac6] hover:border-[#58cc02]">“{t}”</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#6b7a8c]">Tap one into the composer, save, review — watch the caps and checks refuse the first two.</p>
        </Card>
      </div>
    </div>
  );
}
