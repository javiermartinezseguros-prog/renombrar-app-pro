import React, { useState } from 'react';
import { FolderInput, FolderOutput, Settings, ArrowRight, Loader2, Radar, Square } from 'lucide-react';
import { FolderConfig } from '../types';
import { isElectron, openFolder } from '../utils/electronBridge';
import { openContextMenu } from '../utils/contextMenu';
import { buildFolderMenu } from '../utils/menuModel';

interface FolderStatusBarProps {
  folderConfig: FolderConfig;
  onOpenConfig: () => void;
  processedCount: number;
  pendingCount: number;
  onScanAndProcessFolder?: () => void;
  isScanning?: boolean;
  /** True while a persistent watch on the origin folder is active (desktop app only). */
  isWatching?: boolean;
  /** Avisos (toasts) para las acciones del menú del clic derecho. */
  onNotify?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const FolderStatusBar: React.FC<FolderStatusBarProps> = ({
  folderConfig,
  onOpenConfig,
  processedCount,
  pendingCount,
  onScanAndProcessFolder,
  isScanning = false,
  isWatching = false,
  onNotify,
}) => {
  // Carpeta a la que apunta el menú del clic derecho mientras está abierto
  const [menuFolder, setMenuFolder] = useState<'origin' | 'destination' | null>(null);

  const openFolderMenu = (kind: 'origin' | 'destination', path: string, x: number, y: number, anchor?: HTMLElement) => {
    const items = buildFolderMenu(
      { canOpen: isElectron() },
      {
        open: async () => {
          const result = await openFolder(path);
          if (!result.success) onNotify?.('error', 'No se pudo abrir la carpeta', result.error);
        },
        copyPath: () => {
          try {
            navigator.clipboard.writeText(path);
          } catch (e) {}
          onNotify?.('success', 'Ruta copiada', path);
        },
        change: onOpenConfig,
      }
    );
    // Primero abre (si había otro menú, su onClose corre acá adentro) y recién después marca la carpeta.
    openContextMenu({
      x,
      y,
      items,
      anchor,
      onClose: () => setMenuFolder((current) => (current === kind ? null : current)),
    });
    setMenuFolder(kind);
  };

  const folderMenuHandlers = (kind: 'origin' | 'destination', path: string) => ({
    tabIndex: 0,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      openFolderMenu(kind, path, e.clientX, e.clientY);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openFolderMenu(kind, path, 0, 0, e.currentTarget);
      }
    },
  });

  const originPath = folderConfig.originPath || 'C:\\Seguros\\Entrada_PDFs';
  const destinationPath = folderConfig.destinationPath || 'C:\\Seguros\\Renombrados_Organizados';

  return (
    <div
      id="permanent-folder-status-bar"
      className="shrink-0 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        {/* Left: Origin & Destination Paths */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-mono text-[11px] sm:text-xs">
          {/* Origin Folder */}
          <div
            id="origin-folder-badge"
            data-help="origin-folder-badge"
            {...folderMenuHandlers('origin', originPath)}
            className={`sm-focusable ${menuFolder === 'origin' ? 'sm-target ' : ''}flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 shadow-2xs`}
            title={`Carpeta de Entrada: ${folderConfig.originPath}`}
          >
            <FolderInput className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Origen:</span>
            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[150px] sm:max-w-[220px] md:max-w-[280px]">
              {originPath}
            </span>
          </div>

          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0 hidden sm:inline" />

          {/* Destination Folder */}
          <div
            id="destination-folder-badge"
            data-help="destination-folder-badge"
            {...folderMenuHandlers('destination', destinationPath)}
            className={`sm-focusable ${menuFolder === 'destination' ? 'sm-target ' : ''}flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 shadow-2xs`}
            title={`Carpeta de Destino: ${folderConfig.destinationPath}`}
          >
            <FolderOutput className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Destino:</span>
            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[150px] sm:max-w-[220px] md:max-w-[280px]">
              {destinationPath}
            </span>
          </div>
        </div>

        {/* Right: Quick actions & Stats */}
        <div className="flex flex-wrap items-center gap-2.5 self-end md:self-auto shrink-0 font-sans">
          {/* Quick Auto Scan Origin -> Destination Button — toggles a live
              folder watch instead of a one-shot scan: once active, any PDF
              dropped into the origin folder gets processed automatically. */}
          {onScanAndProcessFolder && (
            <button
              id="btn-scan-and-process-folder"
              data-help="btn-scan-and-process-folder"
              onClick={onScanAndProcessFolder}
              disabled={isScanning}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 shadow-2xs transition-all active:scale-[0.97] ${
                isWatching
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title={
                isWatching
                  ? 'El escaneo automático está activo — tocá para detenerlo'
                  : 'Deja la carpeta de origen escuchando: cada PDF que aparezca ahí se procesa y guarda solo, sin volver a tocar este botón'
              }
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : isWatching ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span className="relative flex items-center gap-1.5">
                    <span className="relative flex w-2 h-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/80"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                    Escaneo Automático Activo
                  </span>
                </>
              ) : (
                <>
                  <Radar className="w-3.5 h-3.5 text-amber-300" />
                  <span>Auto-Procesar Carpeta Origen</span>
                </>
              )}
            </button>
          )}

          <div data-help="folder-counts" className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
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
            data-help="btn-quick-change-folders"
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
