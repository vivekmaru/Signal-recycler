import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue" | "purple";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700",
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700"
};

export function Badge({
  children,
  tone = "neutral",
  title
}: {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 font-mono text-xs leading-none ${toneClass[tone]}`}
      title={title}
    >
      {children}
    </span>
  );
}
