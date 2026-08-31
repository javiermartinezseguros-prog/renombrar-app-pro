import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      id="toast-notifications-container"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`pointer-events-auto p-4 rounded-xl shadow-xl border flex items-start gap-3 text-sm backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-emerald-900/90 dark:bg-emerald-950/90 text-emerald-100 border-emerald-500/30'
                : toast.type === 'error'
                ? 'bg-rose-900/90 dark:bg-rose-950/90 text-rose-100 border-rose-500/30'
                : 'bg-slate-900/90 dark:bg-slate-900/90 text-slate-100 border-slate-700'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm leading-tight">{toast.title}</h4>
              {toast.message && <p className="text-xs opacity-90 mt-1">{toast.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity"
              title="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
