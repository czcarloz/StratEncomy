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
      <div
        className="absolute inset-0 bg-bg/80 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-modal border border-border bg-surface p-6 shadow-2xl",
          className
        )}
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
