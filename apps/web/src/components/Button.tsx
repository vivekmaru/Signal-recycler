import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border-amber-700 bg-amber-600 text-white hover:bg-amber-700",
  secondary: "border-stone-300 bg-white text-stone-900 hover:bg-stone-50",
  ghost: "border-transparent bg-transparent text-stone-700 hover:bg-stone-100",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50"
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
