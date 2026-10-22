import type { ReactNode } from "react";

/** Two-lap goal ring: lap 1 = daily goal, lap 2 = stretch (lighter, same radius) */
export function GoalRing({ minutes, goal, stretch, size = 190, children }: { minutes: number; goal: number; stretch: number; size?: number; children?: ReactNode }) {
  const r = 80; const c = 2 * Math.PI * r;
  const lap1 = Math.min(1, minutes / goal);
  const lap2 = minutes > goal ? Math.min(1, (minutes - goal) / Math.max(1, stretch - goal)) : 0;
  const done = minutes >= stretch;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 190 190" width={size} height={size} className="-rotate-90">
        <circle cx="95" cy="95" r={r} fill="none" strokeWidth="15" className="ring-track" />
        <circle cx="95" cy="95" r={r} fill="none" stroke="#58cc02" strokeWidth="15" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - lap1)} className="ring-anim" />
        {lap2 > 0 && <circle cx="95" cy="95" r={r} fill="none" stroke={done ? "#ffb020" : "#a5e85c"} strokeWidth="15" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - lap2)} className="ring-anim" opacity={0.9} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">{children}</div>
    </div>
  );
}

export function MiniRing({ pct, color = "#58cc02", size = 64, label }: { pct: number; color?: string; size?: number; label: string }) {
  const r = 26; const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="ring-track" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} className="ring-anim" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold">{label}</div>
    </div>
  );
}

export function Bar({ pct, color = "#58cc02", h = "h-2.5" }: { pct: number; color?: string; h?: string }) {
  return (
    <div className={`${h} w-full overflow-hidden rounded-full bg-[#232d38]`}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-[#232d38] bg-[#12171d] ${className}`}>{children}</div>;
}

export function Pill({ children, color = "#2a3644", text = "#c7d0db" }: { children: ReactNode; color?: string; text?: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: color, color: text }}>{children}</span>;
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={label} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-[#58cc02]" : "bg-[#2a3644]"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-[#1a3322] p-2.5 text-[#58cc02]">{icon}</div>
      <div>
        <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-snug text-[#93a1b1]">{sub}</p>}
      </div>
    </div>
  );
}
