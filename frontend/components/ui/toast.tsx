"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "error" | "success" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const ICONS = {
  error:   AlertCircle,
  success: CheckCircle,
  info:    Info,
};

const STYLES = {
  error:   "border-danger/40 bg-danger-bg text-danger",
  success: "border-primary/40 bg-primary-bg text-success",
  info:    "border-info/40 bg-info-bg text-info",
};

export function Toast({ message, type = "error", duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[type];

  useEffect(() => {
    // animate in
    const show = setTimeout(() => setVisible(true), 10);
    // auto-dismiss
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border px-4 py-3 shadow-xl text-sm max-w-sm transition-all duration-300",
        STYLES[type],
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={() => { setVisible(false); setTimeout(onClose, 300); }} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Toast container (fixed bottom-right) ─────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _counter = 0;
type Listener = (toasts: ToastItem[]) => void;
let _toasts: ToastItem[] = [];
const _listeners = new Set<Listener>();

function notify(toasts: ToastItem[]) {
  _toasts = toasts;
  _listeners.forEach((l) => l(toasts));
}

export const toast = {
  error:   (message: string) => notify([..._toasts, { id: ++_counter, message, type: "error" }]),
  success: (message: string) => notify([..._toasts, { id: ++_counter, message, type: "success" }]),
  info:    (message: string) => notify([..._toasts, { id: ++_counter, message, type: "info" }]),
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _listeners.add(setToasts);
    return () => { _listeners.delete(setToasts); };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          onClose={() => notify(_toasts.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  );
}
