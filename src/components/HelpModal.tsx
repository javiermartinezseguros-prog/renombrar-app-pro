import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X } from 'lucide-react';
import {
  HELP_COLORS,
  HELP_CONTROLS,
  HELP_INSP_PARAMS,
  HELP_PARAMS,
  HELP_RIGHT_CLICK,
  HELP_SHORTCUTS,
  HELP_STEPS,
  HELP_STEPS_INSPECCIONES,
  HELP_TROUBLE,
} from '../utils/help';
import { foldText } from '../utils/personSearch';

interface HelpModalProps {
  isOpen: boolean;
  version: string;
  onClose: () => void;
}

const toneClass = {
  ok: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  warn: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  blue: 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  bad: 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
} as const;

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{children}</h4>
);

const HelpContent: React.FC<Omit<HelpModalProps, 'isOpen'>> = ({ version, onClose }) => {
  const [filter, setFilter] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = foldText(filter).trim();
  const has = (...texts: string[]) => !q || texts.some((t) => foldText(t).includes(q));

  const steps = useMemo(() => HELP_STEPS.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => has(s.title, s.text)), [q]);
  const stepsInsp = useMemo(() => HELP_STEPS_INSPECCIONES.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => has(s.title, s.text)), [q]);
  const paramsInsp = useMemo(() => HELP_INSP_PARAMS.filter((p) => has(p.name, p.text, p.example)), [q]);
  const controls = useMemo(() => HELP_CONTROLS.filter((c) => has(c.name, c.text)), [q]);
  const params = useMemo(() => HELP_PARAMS.filter((p) => has(p.name, p.text, p.example)), [q]);
  const colors = useMemo(() => HELP_COLORS.filter((c) => has(c.label, c.text)), [q]);
  const shortcuts = useMemo(() => HELP_SHORTCUTS.filter(([k, t]) => has(k, t)), [q]);
  const trouble = useMemo(() => HELP_TROUBLE.filter((t) => has(t)), [q]);
  const showRightClick = has(HELP_RIGHT_CLICK, 'clic derecho');
  const nothing =
    steps.length + stepsInsp.length + controls.length + params.length + paramsInsp.length + colors.length + shortcuts.length + trouble.length === 0 && !showRightClick;

  return (
    <div
      id="help-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-5xl w-full max-h-[calc(100vh-32px)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-3.5 text-white flex items-center justify-between gap-3">
          <h2 id="help-title" className="text-lg font-extrabold tracking-tight">
            Cómo se usa RenombrarAPP
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/30 focus-within:border-white px-2.5 py-1.5 text-sm">
              <Search className="w-4 h-4 text-sky-300" />
              <input
                ref={searchRef}
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar en la ayuda…"
                className="bg-transparent outline-none w-48 text-white placeholder-slate-300"
              />
            </label>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 grid gap-x-8 gap-y-5 md:grid-cols-[1.25fr_1fr] text-sm">
          <div className="space-y-5 min-w-0">
            {steps.length > 0 && (
              <section>
                <Heading>Paso a paso</Heading>
                <ol className="space-y-2.5">
                  {steps.map((s) => (
                    <li key={s.n} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{s.title}</div>
                        <div className="text-slate-600 dark:text-slate-300">{s.text}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {stepsInsp.length > 0 && (
              <section>
                <Heading>Inspecciones (fotos de vehículos): paso a paso</Heading>
                <ol className="space-y-2.5">
                  {stepsInsp.map((s) => (
                    <li key={s.n} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{s.title}</div>
                        <div className="text-slate-600 dark:text-slate-300">{s.text}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {controls.length > 0 && (
              <section>
                <Heading>Cada menú y cada botón</Heading>
                <dl className="space-y-2">
                  {controls.map((c) => (
                    <div key={c.id}>
                      <dt className="font-semibold text-slate-900 dark:text-white">{c.name}</dt>
                      <dd className="text-slate-600 dark:text-slate-300">{c.text}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {paramsInsp.length > 0 && (
              <section>
                <Heading>Parámetros de Inspecciones</Heading>
                <dl className="space-y-2.5">
                  {paramsInsp.map((p) => (
                    <div key={p.key}>
                      <dt className="font-semibold text-slate-900 dark:text-white">{p.name}</dt>
                      <dd className="text-slate-600 dark:text-slate-300">{p.text}</dd>
                      <dd className="text-slate-500 dark:text-slate-400">{p.example}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {params.length > 0 && (
              <section>
                <Heading>Parámetros de Configuración</Heading>
                <dl className="space-y-2.5">
                  {params.map((p) => (
                    <div key={p.key}>
                      <dt className="font-semibold text-slate-900 dark:text-white">{p.name}</dt>
                      <dd className="text-slate-600 dark:text-slate-300">{p.text}</dd>
                      <dd className="text-slate-500 dark:text-slate-400">{p.example}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          <div className="space-y-5 min-w-0">
            {colors.length > 0 && (
              <section>
                <Heading>Qué significa cada color</Heading>
                <ul className="space-y-2">
                  {colors.map((c) => (
                    <li key={c.label} className="flex items-start gap-3">
                      <span className={`shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${toneClass[c.tone]}`}>{c.label}</span>
                      <span className="text-slate-600 dark:text-slate-300">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(shortcuts.length > 0 || showRightClick) && (
              <section>
                <Heading>Atajos y clic derecho</Heading>
                <ul className="space-y-1.5">
                  {shortcuts.map(([key, text]) => (
                    <li key={key} className="flex items-center gap-3">
                      <kbd className="min-w-[7.5rem] text-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold">{key}</kbd>
                      <span className="text-slate-600 dark:text-slate-300">{text}</span>
                    </li>
                  ))}
                </ul>
                {showRightClick && <p className="mt-2 text-slate-500 dark:text-slate-400">{HELP_RIGHT_CLICK}</p>}
              </section>
            )}

            {trouble.length > 0 && (
              <section>
                <Heading>Si algo falla</Heading>
                <ul className="space-y-1.5 list-disc pl-5 text-slate-600 dark:text-slate-300">
                  {trouble.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {nothing && <p className="md:col-span-2 text-slate-500 dark:text-slate-400">No encontré nada con “{filter.trim()}” en la ayuda.</p>}
        </div>

        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">Versión {version}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.98]"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, ...rest }) => (
  <AnimatePresence>{isOpen && <HelpContent key="help-modal" {...rest} />}</AnimatePresence>
);
