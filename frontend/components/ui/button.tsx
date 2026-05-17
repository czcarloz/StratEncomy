import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClass: Record<string, string> = {
  primary:   "bg-primary hover:bg-primary-hover text-white",
  secondary: "bg-transparent border border-border text-text hover:bg-surface-2",
  ghost:     "bg-transparent hover:bg-surface-2 text-muted hover:text-text",
  danger:    "bg-transparent text-danger border border-border hover:bg-danger/10 hover:border-danger",
};

const sizeClass: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-input font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg disabled:opacity-40 disabled:pointer-events-none",
        variantClass[variant],
        sizeClass[size],
        className
      )}
    >
      {children}
    </button>
  );
}
