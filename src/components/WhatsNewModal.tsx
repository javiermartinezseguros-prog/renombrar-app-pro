import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

interface WhatsNewModalProps {
  isOpen: boolean;
  version: string;
  notes: string[];
  onClose: () => void;
}

/**
 * One-shot "what's new" notice shown right after the app relaunches into a
 * version it hasn't seen before — see main.cjs's checkAndNotifyVersionUpdate
 * and release-notes.json. Deliberately simple/read-only (no actions besides
 * dismissing) since this is informational, not something the user needs to
 * act on.
 */
export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, version, notes, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="whats-new-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden"
          >
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/10">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight">Novedades</h2>
                  <p className="text-xs text-indigo-200 font-medium">Versión {version}</p>
                </div>
              </div>
              <button
                id="btn-close-whats-new"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Se actualizó la app automáticamente. Esto es lo que cambió:
              </p>
              <ul className="space-y-2.5">
                {notes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>

              <button
                id="btn-dismiss-whats-new"
                onClick={onClose}
                className="mt-5 w-full py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.98]"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
