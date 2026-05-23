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

const TOAST_STYLE: Record<ToastType, React.CSSProperties> = {
  success: {
    background: "rgba(0,200,150,0.12)",
    border: "1px solid rgba(0,200,150,0.28)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.40), 0 0 20px rgba(0,200,150,0.10)",
  },
  error: {
    background: "rgba(255,69,101,0.12)",
    border: "1px solid rgba(255,69,101,0.28)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.40), 0 0 20px rgba(255,69,101,0.10)",
  },
  info: {
    background: "rgba(74,158,255,0.12)",
    border: "1px solid rgba(74,158,255,0.28)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.40), 0 0 20px rgba(74,158,255,0.10)",
  },
};

const ICON_COLOR: Record<ToastType, string> = {
  success: "#00C896",
  error:   "#FF4565",
  info:    "#4A9EFF",
};

export function Toast({ message, type = "error", duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[type];

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10);
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card px-4 py-3 text-sm max-w-sm transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
      style={{
        ...TOAST_STYLE[type],
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: ICON_COLOR[type] }} />
      <span className="flex-1 text-text">{message}</span>
      <button
        onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-muted"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Toast container ───────────────────────────────────────────────────────────

interface ToastItem { id: number; message: string; type: ToastType; }

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
