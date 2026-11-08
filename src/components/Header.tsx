import React from 'react';
import { FileText, Sun, Moon, Monitor, Eye, DownloadCloud } from 'lucide-react';
import { ThemeMode, TextZoom } from '../types';
import { BarMenu } from '../utils/menuModel';
import { MenuBar } from './MenuBar';

interface HeaderProps {
  menus: BarMenu[];
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  textZoom: TextZoom;
  onTextZoomChange: (zoom: TextZoom) => void;
  onExportAllZip: () => void;
  totalPolicies: number;
}

const segment = (active: boolean, accent = 'text-blue-600 dark:text-blue-300') =>
  `flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
    active ? `bg-white dark:bg-slate-700 ${accent} shadow-xs font-semibold` : 'hover:text-slate-900 dark:hover:text-white'
  }`;

export const Header: React.FC<HeaderProps> = ({
  menus,
  theme,
  onThemeChange,
  textZoom,
  onTextZoomChange,
  onExportAllZip,
  totalPolicies,
}) => {
  return (
    <header
      id="app-main-header"
      className="shrink-0 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 z-30 backdrop-blur-md transition-colors"
    >
      <div className="px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Marca y barra de menús */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
            <FileText className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-base text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            RenombrarAPP
            <span className="hidden 2xl:inline text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Desktop Pro
            </span>
          </h1>
        </div>

        <MenuBar menus={menus} />

        {/* Comodidad de la vista: tema, tamaño de letra y exportar */}
        <div className="flex items-center flex-wrap gap-2 ml-auto">
          <div
            id="theme-selector-group"
            data-help="theme-buttons"
            className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
            title="Tema de colores para descanso de la vista"
          >
            <button id="theme-btn-system" onClick={() => onThemeChange('system')} className={segment(theme === 'system')} title="Tema del Sistema (sigue el modo de tu PC)">
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sistema</span>
            </button>
            <button id="theme-btn-dark" onClick={() => onThemeChange('dark')} className={segment(theme === 'dark')} title="Modo Oscuro">
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Oscuro</span>
            </button>
            <button id="theme-btn-light" onClick={() => onThemeChange('light')} className={segment(theme === 'light')} title="Modo Claro">
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Claro</span>
            </button>
            <button
              id="theme-btn-contrast"
              onClick={() => onThemeChange('high-contrast')}
              className={segment(theme === 'high-contrast', 'text-amber-600 dark:text-amber-300')}
              title="Alto Contraste (máxima legibilidad)"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alto Contraste</span>
            </button>
          </div>

          <div
            id="text-zoom-group"
            data-help="zoom-buttons"
            className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
            title="Tamaño de la letra (Normal / Grande / Muy grande)"
          >
            <button id="zoom-btn-normal" onClick={() => onTextZoomChange('normal')} className={`px-2 py-1 rounded-md transition-all ${textZoom === 'normal' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`} title="Tamaño de letra normal (100%)">
              A
            </button>
            <button id="zoom-btn-large" onClick={() => onTextZoomChange('large')} className={`px-2 py-1 rounded-md text-sm transition-all ${textZoom === 'large' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`} title="Tamaño de letra grande (+12,5%)">
              A+
            </button>
            <button id="zoom-btn-xlarge" onClick={() => onTextZoomChange('xlarge')} className={`px-2 py-1 rounded-md text-base transition-all ${textZoom === 'xlarge' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`} title="Tamaño de letra muy grande (+25%)">
              A++
            </button>
          </div>

          {totalPolicies > 0 && (
            <button
              id="btn-export-all-zip"
              data-help="btn-export-all-zip"
              onClick={onExportAllZip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.97]"
              title="Descargar todos los archivos renombrados organizados en ZIP"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>Exportar Renombrados</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
