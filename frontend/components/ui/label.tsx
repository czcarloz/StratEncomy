import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={cn("text-xs font-medium text-muted uppercase tracking-wide", className)}
    />
  );
}
