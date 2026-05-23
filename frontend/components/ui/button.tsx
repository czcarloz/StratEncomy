import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClass: Record<string, string> = {
  primary:   "text-white font-semibold",
  secondary: "bg-transparent text-text font-medium",
  ghost:     "bg-transparent text-muted hover:text-text",
  danger:    "bg-transparent text-danger font-medium",
};

const variantStyle: Record<string, React.CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, #00C896 0%, #00A87A 100%)",
    boxShadow: "0 0 18px rgba(0,200,150,0.28), inset 0 1px 0 rgba(255,255,255,0.15)",
    border: "1px solid rgba(0,200,150,0.40)",
  },
  secondary: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(8px)",
  },
  ghost: {
    background: "transparent",
    border: "1px solid transparent",
  },
  danger: {
    background: "rgba(255,69,101,0.08)",
    border: "1px solid rgba(255,69,101,0.25)",
    backdropFilter: "blur(8px)",
  },
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
  style,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{ ...variantStyle[variant], ...style }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-input font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 focus:ring-offset-transparent disabled:opacity-40 disabled:pointer-events-none hover:brightness-110 active:scale-[0.98]",
        variantClass[variant],
        sizeClass[size],
        className
      )}
    >
      {children}
    </button>
  );
}
