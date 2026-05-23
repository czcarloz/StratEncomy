import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export function Select({ options, placeholder, className, style, ...props }: SelectProps) {
  return (
    <select
      {...props}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        ...style,
      }}
      className={cn(
        "w-full rounded-input px-3 py-2 text-sm text-text focus:outline-none transition-all duration-150 disabled:opacity-40 cursor-pointer",
        "focus:border-primary/50 focus:shadow-[0_0_0_2px_rgba(0,200,150,0.15)]",
        className
      )}
    >
      {placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
