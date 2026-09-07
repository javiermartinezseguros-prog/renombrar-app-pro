import React from 'react';
import {
  FileText,
  Sun,
  Moon,
  Monitor,
  Eye,
  FolderCog,
  DownloadCloud,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { ThemeMode, TextZoom } from '../types';

interface HeaderProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  textZoom: TextZoom;
  onTextZoomChange: (zoom: TextZoom) => void;
  onOpenFolderConfig: () => void;
  onExportAllZip: () => void;
  onLoadSamples: () => void;
  totalPolicies: number;
  hasApiKey?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onThemeChange,
  textZoom,
  onTextZoomChange,
  onOpenFolderConfig,
  onExportAllZip,
  onLoadSamples,
  totalPolicies,
  hasApiKey = true,
}) => {
  return (
    <header
      id="app-main-header"
      className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 backdrop-blur-md transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                RenombrarAPP
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Desktop Pro
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Extractor & Renombrador Inteligente de Pólizas de Seguros
            </p>
          </div>
        </div>

        {/* Vision Comfort Controls (Theme & Zoom) */}
        <div className="flex items-center flex-wrap gap-2">
          {/* AI Status Badge */}
          <div
            id="ai-engine-status"
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
              hasApiKey
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}
            title={
              hasApiKey
                ? 'Motor de Inteligencia Artificial Gemini 3.7 Flash conectado para lectura precisa de PDFs'
                : 'Extractor heurístico activo'
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{hasApiKey ? 'IA Gemini 3.7 Activa' : 'Extractor Local'}</span>
          </div>

          {/* Theme Selector (Descanso visual) */}
          <div
            id="theme-selector-group"
            className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
            title="Seleccionar tema visual para descanso de la vista"
          >
            <button
              id="theme-btn-system"
              onClick={() => onThemeChange('system')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'system'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tema del Sistema (Detecta automáticamente el modo de tu PC)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sistema</span>
            </button>
            <button
              id="theme-btn-dark"
              onClick={() => onThemeChange('dark')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'dark'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Modo Oscuro (Descanso visual / Atenuado)"
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Oscuro</span>
            </button>
            <button
              id="theme-btn-light"
              onClick={() => onThemeChange('light')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'light'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Modo Claro"
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Claro</span>
            </button>
            <button
              id="theme-btn-contrast"
              onClick={() => onThemeChange('high-contrast')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'high-contrast'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-xs font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Alto Contraste (Máxima legibilidad visual)"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alto Contraste</span>
            </button>
          </div>

          {/* Text Zoom / Accessibility */}
          <div
            id="text-zoom-group"
            className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
            title="Ajustar tamaño de fuente para lectura cómoda (Normal / Grande / Extra Grande)"
          >
            <button
              id="zoom-btn-normal"
              onClick={() => onTextZoomChange('normal')}
              className={`px-2 py-1 rounded-md transition-all ${
                textZoom === 'normal'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tamaño de letra normal (100%)"
            >
              A
            </button>
            <button
              id="zoom-btn-large"
              onClick={() => onTextZoomChange('large')}
              className={`px-2 py-1 rounded-md text-xs sm:text-sm transition-all ${
                textZoom === 'large'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs font-bold'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tamaño de letra grande (+12.5%)"
            >
              A+
            </button>
            <button
              id="zoom-btn-xlarge"
              onClick={() => onTextZoomChange('xlarge')}
              className={`px-2 py-1 rounded-md text-sm sm:text-base transition-all ${
                textZoom === 'xlarge'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs font-bold'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tamaño de letra extra grande (+25%)"
            >
              A++
            </button>
          </div>

          {/* Folder Config Button */}
          <button
            id="btn-open-folder-config"
            onClick={onOpenFolderConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all active:scale-[0.97]"
            title="Configurar carpetas permanentes de entrada y salida"
          >
            <FolderCog className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden md:inline">Rutas Carpetas</span>
          </button>

          {/* Export ZIP Button */}
          {totalPolicies > 0 && (
            <button
              id="btn-export-all-zip"
              onClick={onExportAllZip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.97]"
              title="Descargar todos los archivos renombrados organizados en ZIP"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>Exportar Renombrados</span>
            </button>
          )}

          {/* Load Sample Data Button */}
          <button
            id="btn-load-sample-policies"
            onClick={onLoadSamples}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Cargar pólizas de prueba (Federación Patronal, San Cristóbal, La Segunda, Allianz, etc.)"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden xl:inline">Ejemplos</span>
          </button>
        </div>
      </div>
    </header>
  );
};
