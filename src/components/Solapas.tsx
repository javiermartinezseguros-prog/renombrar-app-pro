import React from 'react';
import { FileText, Camera } from 'lucide-react';

export type Seccion = 'polizas' | 'inspecciones';

interface SolapasProps {
  seccion: Seccion;
  onChange: (seccion: Seccion) => void;
}

const base = 'inline-flex items-center gap-2 px-4 py-1 rounded-lg text-sm font-semibold border transition-all active:scale-[0.97]';
const activa = 'bg-blue-600 border-blue-700 text-white shadow-xs shadow-blue-500/20';
const inactiva =
  'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200';

/** Dos botones fijos debajo de la barra de menús: Pólizas | Inspecciones. */
export const Solapas: React.FC<SolapasProps> = ({ seccion, onChange }) => (
  <nav
    role="tablist"
    aria-label="Sección"
    data-help="section-buttons"
    className="shrink-0 flex items-center gap-2 px-4 py-1 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800"
  >
    <button
      id="section-polizas"
      role="tab"
      aria-selected={seccion === 'polizas'}
      onClick={() => onChange('polizas')}
      className={`${base} ${seccion === 'polizas' ? activa : inactiva}`}
    >
      <FileText className="w-4 h-4" />
      Pólizas
    </button>
    <button
      id="section-inspecciones"
      role="tab"
      aria-selected={seccion === 'inspecciones'}
      onClick={() => onChange('inspecciones')}
      className={`${base} ${seccion === 'inspecciones' ? activa : inactiva}`}
    >
      <Camera className="w-4 h-4" />
      Inspecciones
    </button>
  </nav>
);
