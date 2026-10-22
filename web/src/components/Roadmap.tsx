import { useState } from "react";
import { Accessibility, Bug, CheckCircle2, Code2, Gauge, Lock, Palette, Rocket, Square, TestTube2 } from "lucide-react";
import { Card, Pill, SectionTitle } from "./ui";

type Item = { title: string; why: string; files: string; impact: "High" | "Med" | "Low"; effort: "S" | "M" | "L"; tag: string };
const GROUPS: { id: string; title: string; icon: typeof Bug; color: string; blurb: string; items: Item[] }[] = [
  {
    id: "harden", title: "Harden the engine (v1.12)", icon: Bug, color: "#ff5d73",
    blurb: "Your v1.11 fixed the freeze promise. These close the remaining races and silent-failure paths.",
    items: [
      { title: "Single-flight boot() in dojo.js", why: "Same double-boot class you killed in Focus Suite: top-level boot + queued onInstalled/onStartup can run rollover twice. Wrap boot in a cached promise, exactly like enqueue() already does for mutations.", files: "dojo.js", impact: "High", effort: "S", tag: "Race" },
      { title: "Alarm drift guard + missed-midnight test", why: "MV3 alarms can fire late after sleep. rollover() already re-anchors — add a test that wakes the worker 3 days late with 1 freeze and asserts exactly one burn + one reset notice.", files: "dojo.js · tests/worker.test.js", impact: "High", effort: "S", tag: "Streak" },
      { title: "Storage quota pre-flight", why: "120-day pruning is good, but a failed chrome.storage.set is silent. Check getBytesInUse weekly; if >80% quota, prune notes to 30 days and surface it in More.", files: "dojo.js", impact: "Med", effort: "M", tag: "Data" },
      { title: "Import: schema version + migration", why: "Import validates numeric xp only. Add schemaVersion to exports and a migrate() chain so v1.11 backups survive v2 shape changes instead of half-restoring.", files: "dojo.js · popup.js", impact: "Med", effort: "M", tag: "Data" },
    ],
  },
  {
    id: "ai", title: "Make the AI stricter & cheaper", icon: Lock, color: "#3aa0ff",
    blurb: "Prompt-injection and cost are your two real AI risks. Both shrink with less trust in the model.",
    items: [
      { title: "Canary token in <lesson> blocks", why: "You already delimit untrusted lesson text. Add a random per-ask canary (e.g. ‹ref-7f3a›) and reject any reply that echoes instructions outside it — cheap injection tripwire.", files: "grade.js · ai.js", impact: "High", effort: "M", tag: "Security" },
      { title: "Two-temperature grading split", why: "Keep grading at temp 0.2, but generate questions at 0.7 in a separate session cache key — questions get variety without making verdicts wobbly.", files: "ai.js · quiz.js", impact: "Med", effort: "S", tag: "Quality" },
      { title: "Cache model availability for 10 min", why: "availability() runs on every popup open and quiz build. Cache it (session storage) — fewer Nano wake-ups, faster popup paint.", files: "ai.js", impact: "Med", effort: "S", tag: "Perf" },
      { title: "Echo-check v2: stemmed overlap", why: "Your 0.7 content-word echo test misses paraphrase echoes ('flex direction decides axis' → 'axis decided by direction'). Light stemming + bigram overlap catches them pre-model.", files: "grade.js · tests/grade.test.js", impact: "Med", effort: "M", tag: "Strictness" },
    ],
  },
  {
    id: "ui", title: "UI upgrades (applied in this redesign)", icon: Palette, color: "#58cc02",
    blurb: "Everything here is implemented live in this v2 concept — port the CSS tokens back to popup.css.",
    items: [
      { title: "Icons replace emoji chrome", why: "Emoji render differently per OS and break your dark panels' rhythm. One inline SVG set (Lucide-style paths) at 16–20px keeps the dojo playful but product-grade.", files: "popup.html · practice.html · quiz.html", impact: "High", effort: "M", tag: "Polish" },
      { title: "Live cap preview in the note composer", why: "Your word caps are invisible until review. Show '12 words → max 3 checks' while typing (done here) — users write better notes before grading, not after rejection.", files: "popup.js · notes.js", impact: "High", effort: "S", tag: "UX" },
      { title: "Skeleton + optimistic ring paint", why: "Popup waits on getState before first paint. Paint last-known state from a tiny session cache, then reconcile — popup feels instant, numbers never lie after reconcile.", files: "popup.js", impact: "Med", effort: "M", tag: "Perf" },
      { title: "prefers-reduced-motion + focus rings", why: "Confetti/ring animations should respect reduced-motion; every interactive element needs a visible 2px focus ring (your tabs are ARIA-good already — finish the job).", files: "*.css", impact: "Med", effort: "S", tag: "A11y" },
    ],
  },
  {
    id: "features", title: "New features worth building (v2.0)", icon: Rocket, color: "#ffb020",
    blurb: "Ordered by habit impact per hour of work. The first two reuse systems you already have.",
    items: [
      { title: "Weekly Boss Fight = 5-question mixed quiz", why: "Fridays: pull 5 requeued/struggle questions across topics, 150 XP pot, freeze on a perfect clear. Reuses requeue + grade — no new economy to balance.", files: "quiz.js · dojo.js", impact: "High", effort: "M", tag: "Retention" },
      { title: "Spaced-repetition intervals on requeue", why: "Today everything returns 'tomorrow'. Add 1d → 3d → 7d steps on consecutive corrects (Leitner). One extra field per item; big learning-science win.", files: "dojo.js (requeue)", impact: "High", effort: "M", tag: "Learning" },
      { title: "VS Code bridge via native messaging (opt-in)", why: "Away mode guesses with idle checks. A 30-line VS Code extension + native host can report real editor minutes — your #1 honesty upgrade. Keep it optional; no server.", files: "new: host/ · dojo.js", impact: "High", effort: "L", tag: "Tracking" },
      { title: "Streak repair quest (1×/month)", why: "When a streak dies without freezes, offer a same-day 45-min + quiz-clear repair. Duolingo sells this; you can make users earn it — fits your honesty brand.", files: "dojo.js · popup.js", impact: "Med", effort: "M", tag: "Retention" },
      { title: "Export study journal (Markdown)", why: "Notes + gaps + struggles already form a journal. One button → dated .md for Obsidian/GitHub. Zero new data, high perceived ownership.", files: "popup.js", impact: "Med", effort: "S", tag: "Delight" },
    ],
  },
  {
    id: "quality", title: "Tests & shipping", icon: TestTube2, color: "#6fd3e7",
    blurb: "70 green checks is a great base. Protect the parts that break silently in real Chrome.",
    items: [
      { title: "Golden-file prompt snapshots", why: "Prompt wording IS grading policy. Snapshot buildGradePrompt/buildNotePrompt outputs so a 'small copy edit' can't silently loosen strictness.", files: "tests/", impact: "Med", effort: "S", tag: "Tests" },
      { title: "One real-Chrome smoke test in run.sh", why: "Your harness mocks chrome.* well, but MV3 worker suspension killed bigger extensions. Add a headless --load-extension boot that asserts the SW registers and answers getState.", files: "tests/run.sh", impact: "High", effort: "M", tag: "Tests" },
      { title: "Bundle check: fail if any file is 0 bytes", why: "Your 1.10 backup shipped empty ai.js/notes.js placeholders. A 3-line guard in run.sh (find -size 0) makes that class of accident impossible.", files: "tests/run.sh", impact: "Med", effort: "S", tag: "CI" },
    ],
  },
];

export default function Roadmap() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const total = GROUPS.reduce((a, g) => a + g.items.length, 0);
  const toggle = (id: string) => setChecked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="anim-pop space-y-5">
      <Card className="p-6">
        <SectionTitle icon={<Rocket size={20} />} title="Improvement Plan — v1.11 → v2.0" sub="Written against your actual files. Tick items to build your sprint; High-impact + S-effort first is the fastest honest win." />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["all", ...GROUPS.map((g) => g.id)].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-2 text-[13px] font-bold ${filter === f ? "bg-[#58cc02] text-[#071400]" : "bg-[#1e2833] text-[#aebac6]"}`}>
              {f === "all" ? "All improvements" : GROUPS.find((g) => g.id === f)?.title}
            </button>
          ))}
          <span className="ml-auto font-mono text-sm text-[#93a1b1]">{checked.size}/{total} picked</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Gauge, t: "Keep — it's genuinely good", d: "Worker-priced XP, enqueue() serialization, deterministic quests, untrusted <lesson> delimiting, zero-network privacy. Don't redesign these; they're your moat." },
            { icon: Code2, t: "Biggest structural risk", d: "Rule mirrors (notes.js ↔ worker, grade.js ↔ worker) guarded only by cross.test.js. Generate both from one rules.json at build time and drift becomes impossible." },
            { icon: Accessibility, t: "Fastest visible win", d: "Note-composer cap preview + SVG icons + reduced-motion. Half a day of work, and the extension instantly reads 'product' instead of 'project'." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl bg-[#171e26] p-4"><Icon size={19} className="text-[#58cc02]" /><p className="mt-2 font-display text-sm font-bold">{t}</p><p className="mt-1 text-[13px] leading-relaxed text-[#aebac6]">{d}</p></div>
          ))}
        </div>
      </Card>
      {GROUPS.filter((g) => filter === "all" || filter === g.id).map((g) => (
        <Card key={g.id} className="p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl p-2.5" style={{ background: `${g.color}22`, color: g.color }}><g.icon size={20} /></div>
            <div><h3 className="font-display text-lg font-bold">{g.title}</h3><p className="text-[13px] text-[#93a1b1]">{g.blurb}</p></div>
          </div>
          <div className="mt-4 space-y-3">
            {g.items.map((it) => {
              const id = `${g.id}:${it.title}`; const on = checked.has(id);
              return (
                <button key={id} onClick={() => toggle(id)} className={`block w-full rounded-2xl border-2 p-4 text-left transition-colors ${on ? "border-[#58cc02] bg-[#14240c]" : "border-[#232d38] bg-[#171e26] hover:border-[#3d4d61]"}`}>
                  <div className="flex items-start gap-3">
                    {on ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#58cc02]" /> : <Square size={20} className="mt-0.5 shrink-0 text-[#3d4d61]" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold">{it.title}</span>
                        <Pill color={it.impact === "High" ? "#3a1620" : "#2a3644"} text={it.impact === "High" ? "#ff8fa0" : "#aebac6"}>Impact {it.impact}</Pill>
                        <Pill>Effort {it.effort}</Pill>
                        <Pill color="#0f2740" text="#7dc2ff">{it.tag}</Pill>
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#aebac6]">{it.why}</p>
                      <p className="mt-1.5 font-mono text-[11.5px] text-[#6b7a8c]">{it.files}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      {checked.size > 0 && (
        <Card className="anim-pop border-[#2f7300] bg-[#101a0a] p-5">
          <p className="font-display font-bold text-[#58cc02]">Your sprint ({checked.size} item{checked.size > 1 ? "s" : ""})</p>
          <ul className="mt-2 space-y-1 text-sm text-[#cfe6b8]">{[...checked].map((id) => <li key={id}>· {id.split(":")[1]}</li>)}</ul>
          <p className="mt-2 text-[12px] text-[#a9c48a]">Ship order inside a sprint: races first, strictness second, UI last — the streak must keep its promises before it gets prettier.</p>
        </Card>
      )}
    </div>
  );
}
