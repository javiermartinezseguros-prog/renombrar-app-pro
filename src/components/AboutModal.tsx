import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Sparkles, X } from 'lucide-react';
import { ABOUT } from '../utils/help';

interface AboutModalProps {
  isOpen: boolean;
  version: string;
  onClose: () => void;
  onShowWhatsNew: () => void;
}

/** «Acerca de / Firma» (norma 15 de la guía de estilo de Soter). */
const AboutContent: React.FC<Omit<AboutModalProps, 'isOpen'>> = ({ version, onClose, onShowWhatsNew }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[6rem_1fr] gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );

  return (
    <div
      id="about-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden"
      >
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 id="about-title" className="text-lg font-extrabold tracking-tight">
                {ABOUT.name}
              </h2>
              <p className="text-xs text-indigo-200 font-semibold">Versión {version}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <dl className="space-y-2">
            {row('Hace', ABOUT.does)}
            {row('Desarrolla', ABOUT.developer)}
            {row('Datos', ABOUT.data)}
          </dl>

          <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-3 font-medium text-slate-800 dark:text-slate-100">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{ABOUT.claude}</span>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onShowWhatsNew}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Ver novedades
            </button>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.98]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, ...rest }) => (
  <AnimatePresence>{isOpen && <AboutContent key="about-modal" {...rest} />}</AnimatePresence>
);
