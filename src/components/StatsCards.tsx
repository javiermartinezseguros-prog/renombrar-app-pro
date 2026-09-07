import React from 'react';
import {
  FileCheck2,
  AlertCircle,
  FileBadge,
  CreditCard,
  Layers,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';
import { ExtractedPolicyData } from '../types';

interface StatsCardsProps {
  policies: ExtractedPolicyData[];
  onFilterClick: (type: string) => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ policies, onFilterClick }) => {
  const total = policies.length;
  const polizasCount = policies.filter((p) => p.tipoDocumento === 'Póliza').length;
  const endososCount = policies.filter((p) => p.tipoDocumento === 'Endoso').length;
  const rcCount = policies.filter((p) => p.tipoDocumento === 'Tarjeta de RC').length;
  const cuponerasCount = policies.filter((p) => p.tipoDocumento === 'Cuponera').length;
  const coberturasCount = policies.filter((p) => p.tipoDocumento === 'Cobertura').length;
  const revisionCount = policies.filter(
    (p) => p.status === 'Revisión Requerida' || p.confianza === 'Baja'
  ).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {/* Total Card */}
      <div
        onClick={() => onFilterClick('all')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-400 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Total</span>
          <FileCheck2 className="w-4 h-4 text-blue-500" />
        </div>
        <div className="text-xl font-bold text-slate-900 dark:text-white">{total}</div>
        <p className="text-[10px] text-slate-400">Documentos</p>
      </div>

      {/* Pólizas */}
      <div
        onClick={() => onFilterClick('Póliza')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-500 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Pólizas</span>
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{polizasCount}</div>
        <p className="text-[10px] text-slate-400">PZA-...-00.pdf</p>
      </div>

      {/* Endosos */}
      <div
        onClick={() => onFilterClick('Endoso')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-purple-500 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Endosos</span>
          <Layers className="w-4 h-4 text-purple-600" />
        </div>
        <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{endososCount}</div>
        <p className="text-[10px] text-slate-400">PZA-...-0X.pdf</p>
      </div>

      {/* Tarjetas RC */}
      <div
        onClick={() => onFilterClick('Tarjeta de RC')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-amber-500 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Tarjeta RC</span>
          <FileBadge className="w-4 h-4 text-amber-500" />
        </div>
        <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{rcCount}</div>
        <p className="text-[10px] text-slate-400">-TARJETA DE RC.pdf</p>
      </div>

      {/* Cuponeras */}
      <div
        onClick={() => onFilterClick('Cuponera')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-emerald-500 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Cuponeras</span>
          <CreditCard className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
          {cuponerasCount}
        </div>
        <p className="text-[10px] text-slate-400">-CUPONERA.pdf</p>
      </div>

      {/* Coberturas */}
      <div
        onClick={() => onFilterClick('Cobertura')}
        className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-cyan-500 cursor-pointer transition-all active:scale-[0.97]"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Coberturas</span>
          <ShieldCheck className="w-4 h-4 text-cyan-500" />
        </div>
        <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
          {coberturasCount}
        </div>
        <p className="text-[10px] text-slate-400">-COBERTURA.pdf</p>
      </div>

      {/* Revisión Manual Requerida */}
      <div
        onClick={() => onFilterClick('revision')}
        className={`p-3.5 rounded-2xl border shadow-2xs cursor-pointer transition-all active:scale-[0.97] ${
          revisionCount > 0
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 hover:border-rose-500'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Revisión</span>
          <AlertCircle className={`w-4 h-4 ${revisionCount > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-400'}`} />
        </div>
        <div className={`text-xl font-bold ${revisionCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {revisionCount}
        </div>
        <p className="text-[10px] text-slate-400">
          {revisionCount > 0 ? 'Requiere atención' : 'Todo verificado'}
        </p>
      </div>
    </div>
  );
};

