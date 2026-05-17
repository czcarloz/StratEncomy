import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <input
        {...props}
        className={cn(
          "w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-40 transition-colors duration-150",
          error && "border-danger focus:ring-danger",
          className
        )}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
