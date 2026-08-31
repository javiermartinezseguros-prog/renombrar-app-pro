import React from 'react';
import { FolderInput, FolderOutput, Settings, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { FolderConfig } from '../types';

interface FolderStatusBarProps {
  folderConfig: FolderConfig;
  onOpenConfig: () => void;
  processedCount: number;
  pendingCount: number;
  onScanAndProcessFolder?: () => void;
  isScanning?: boolean;
}

export const FolderStatusBar: React.FC<FolderStatusBarProps> = ({
  folderConfig,
  onOpenConfig,
  processedCount,
  pendingCount,
  onScanAndProcessFolder,
  isScanning = false,
}) => {
  return (
    <div
      id="permanent-folder-status-bar"
      className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 lg:px-8 py-2 text-xs text-slate-600 dark:text-slate-300"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        {/* Left: Origin & Destination Paths */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-mono text-[11px] sm:text-xs">
          {/* Origin Folder */}
          <div
            id="origin-folder-badge"
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 shadow-2xs"
            title={`Carpeta de Entrada: ${folderConfig.originPath}`}
          >
            <FolderInput className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Origen:</span>
            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[150px] sm:max-w-[220px] md:max-w-[280px]">
              {folderConfig.originPath || 'C:\\Seguros\\Entrada_PDFs'}
            </span>
          </div>

          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0 hidden sm:inline" />

          {/* Destination Folder */}
          <div
            id="destination-folder-badge"
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 shadow-2xs"
            title={`Carpeta de Destino: ${folderConfig.destinationPath}`}
          >
            <FolderOutput className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Destino:</span>
            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[150px] sm:max-w-[220px] md:max-w-[280px]">
              {folderConfig.destinationPath || 'C:\\Seguros\\Renombrados_Organizados'}
            </span>
          </div>
        </div>

        {/* Right: Quick actions & Stats */}
        <div className="flex flex-wrap items-center gap-2.5 self-end md:self-auto shrink-0 font-sans">
          {/* Quick Auto Scan Origin -> Destination Button */}
          {onScanAndProcessFolder && (
            <button
              id="btn-scan-and-process-folder"
              onClick={onScanAndProcessFolder}
              disabled={isScanning}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-2xs transition-colors"
              title="Seleccionar la carpeta de origen para leer todos los PDFs y guardarlos renombrados automáticamente en la carpeta de destino"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Auto-Procesar Carpeta Origen</span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {processedCount} listos
            </span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                {pendingCount} revisión
              </span>
            )}
          </div>

          <button
            id="btn-quick-change-folders"
            onClick={onOpenConfig}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
          >
            <Settings className="w-3 h-3" />
            <span>Configurar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
