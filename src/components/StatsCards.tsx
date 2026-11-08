import React from 'react';
import { FileCheck2, AlertCircle, FileBadge, CreditCard, Layers, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { ExtractedPolicyData } from '../types';

interface StatsCardsProps {
  policies: ExtractedPolicyData[];
  /** Filtro de tipo activo ('all', un tipo de documento o 'revision'). */
  activeFilter: string;
  /** Tocar una tarjeta filtra la tabla por ese tipo. */
  onFilterClick: (type: string) => void;
}

interface CardDef {
  type: string;
  label: string;
  count: number;
  Icon: React.ComponentType<{ className?: string }>;
  text: string;
  border: string;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ policies, activeFilter, onFilterClick }) => {
  const count = (type: string) => policies.filter((p) => p.tipoDocumento === type).length;
  const revisionCount = policies.filter((p) => p.status === 'Revisión Requerida' || p.confianza === 'Baja').length;

  const cards: CardDef[] = [
    { type: 'all', label: 'Total', count: policies.length, Icon: FileCheck2, text: 'text-slate-900 dark:text-white', border: 'hover:border-blue-400' },
    { type: 'Póliza', label: 'Pólizas', count: count('Póliza'), Icon: FileSpreadsheet, text: 'text-blue-600 dark:text-blue-400', border: 'hover:border-blue-500' },
    { type: 'Endoso', label: 'Endosos', count: count('Endoso'), Icon: Layers, text: 'text-purple-600 dark:text-purple-400', border: 'hover:border-purple-500' },
    { type: 'Tarjeta de RC', label: 'Tarjeta RC', count: count('Tarjeta de RC'), Icon: FileBadge, text: 'text-amber-600 dark:text-amber-400', border: 'hover:border-amber-500' },
    { type: 'Cuponera', label: 'Cuponeras', count: count('Cuponera'), Icon: CreditCard, text: 'text-emerald-600 dark:text-emerald-400', border: 'hover:border-emerald-500' },
    { type: 'Cobertura', label: 'Coberturas', count: count('Cobertura'), Icon: ShieldCheck, text: 'text-cyan-600 dark:text-cyan-400', border: 'hover:border-cyan-500' },
  ];

  return (
    <div data-help="stats-cards" className="shrink-0 grid grid-cols-4 lg:grid-cols-7 gap-2">
      {cards.map(({ type, label, count: n, Icon, text, border }) => {
        const active = activeFilter === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onFilterClick(type)}
            aria-pressed={active}
            title={type === 'all' ? 'Mostrar todos los documentos' : `Mostrar solo: ${label}`}
            className={`flex items-center justify-between gap-2 px-3 py-1 rounded-xl border bg-white dark:bg-slate-900 text-left cursor-pointer transition-all active:scale-[0.97] ${border} ${
              active ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 min-w-0">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${text}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span>
            </span>
            <span className={`text-lg font-bold leading-tight ${text}`}>{n}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onFilterClick('revision')}
        aria-pressed={activeFilter === 'revision'}
        title="Mostrar solo lo que requiere revisión"
        className={`flex items-center justify-between gap-2 px-3 py-1 rounded-xl border text-left cursor-pointer transition-all active:scale-[0.97] ${
          revisionCount > 0
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 hover:border-rose-500'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-70'
        } ${activeFilter === 'revision' ? 'ring-2 ring-rose-500/30 border-rose-500' : ''}`}
      >
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 min-w-0">
          <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${revisionCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Revisión</span>
        </span>
        <span className={`text-lg font-bold leading-tight ${revisionCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {revisionCount}
        </span>
      </button>
    </div>
  );
};
