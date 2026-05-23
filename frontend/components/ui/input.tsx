import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className, error, style, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <input
        {...props}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: error ? "1px solid rgba(255,69,101,0.60)" : "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          ...style,
        }}
        className={cn(
          "w-full rounded-input px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:outline-none transition-all duration-150 disabled:opacity-40",
          "focus:border-primary/50 focus:shadow-[0_0_0_2px_rgba(0,200,150,0.15)]",
          className
        )}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
