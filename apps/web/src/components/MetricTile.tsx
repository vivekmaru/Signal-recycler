import type { ReactNode } from "react";

export function MetricTile({
  label,
  value,
  detail,
  children
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-stone-950">{value}</div>
      {detail ? <div className="mt-2 text-xs text-stone-500">{detail}</div> : null}
      {children}
    </section>
  );
}
