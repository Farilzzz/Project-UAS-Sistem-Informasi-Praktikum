import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastInput {
  variant: ToastVariant;
  title: string;
  message?: string;
  /** Durasi tampil dalam milidetik. Default 5000 (error 8000). */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  notify: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-navy-200 bg-white text-navy-900',
};

const VARIANT_ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  info: 'text-navy-700',
};

const VARIANT_ICONS: Record<ToastVariant, LucideIcon> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const duration = input.duration ?? (input.variant === 'error' ? 8000 : 5000);
      setToasts((prev) => [...prev, { ...input, id }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      dismiss,
      success: (title, message) => notify({ variant: 'success', title, message }),
      error: (title, message) => notify({ variant: 'error', title, message }),
      info: (title, message) => notify({ variant: 'info', title, message }),
    }),
    [notify, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const Icon = VARIANT_ICONS[toast.variant];
          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-3 rounded-lg border p-4 shadow-lg ${VARIANT_STYLES[toast.variant]}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${VARIANT_ICON_STYLES[toast.variant]}`} aria-hidden={true} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded p-1 opacity-70 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-navy-700"
                aria-label="Tutup notifikasi"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast harus digunakan di dalam ToastProvider.');
  }
  return ctx;
}
