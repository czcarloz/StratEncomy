"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(2,8,24,0.70)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-modal p-6",
          className
        )}
        style={{
          background: "rgba(10,22,54,0.82)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1.5 -mr-1">
            <X size={15} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
