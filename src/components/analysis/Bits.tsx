/** Petits blocs partagés des pages d'analyse : carte, stat, légende. */

export function Card({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="section-title">{label}</div>
      <div className={`display text-d3 mt-2.5 ${tone ?? ""}`}>{value}</div>
      {note && <p className="mt-2 text-micro leading-relaxed text-ink3">{note}</p>}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums">{value}</div>
      {note && <div className="mt-1 text-micro leading-relaxed text-ink3">{note}</div>}
    </div>
  );
}

export function Legend({ color, label, note }: { color: string; label: string; note: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="mt-1.5 h-[3px] w-3.5 shrink-0" style={{ background: color }} />
      <span>
        <span className="text-[0.8125rem] text-ink2">{label}</span>
        <span className="ml-2 text-micro text-ink3">{note}</span>
      </span>
    </div>
  );
}
