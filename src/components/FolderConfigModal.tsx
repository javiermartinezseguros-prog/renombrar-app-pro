import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderCog, FolderInput, FolderOutput, X, Check, Folder, Info, AlertTriangle } from 'lucide-react';
import { FolderConfig } from '../types';
import { isElectron, selectFolderNative } from '../utils/electronBridge';
import { foldersOverlap, FOLDERS_OVERLAP_MESSAGE } from '../utils/paths';

interface FolderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderConfig: FolderConfig;
  onSave: (config: FolderConfig) => void;
}

// Split out from FolderConfigModal so it only mounts while the modal is open.
// That lets <AnimatePresence> (in the wrapper below) actually see the mount/
// unmount and play the `exit` animation, instead of the modal vanishing
// instantly — and it means these fields are always freshly initialized from
// the latest folderConfig every time the modal reopens.
const FolderConfigModalContent: React.FC<Omit<FolderConfigModalProps, 'isOpen'>> = ({
  onClose,
  folderConfig,
  onSave,
}) => {
  const [origin, setOrigin] = useState(folderConfig.originPath);
  const [destination, setDestination] = useState(folderConfig.destinationPath);
  const [autoProcess, setAutoProcess] = useState(folderConfig.autoProcessOnDrop);
  const [subfolders, setSubfolders] = useState(folderConfig.createSubfoldersByCompany);

  const handlePickDirectory = async (target: 'origin' | 'destination') => {
    try {
      // Desktop app: native OS folder dialog via Electron IPC, returns the
      // real absolute path — required for the app to actually write files
      // there later (see src/utils/electronBridge.ts).
      if (isElectron()) {
        const realPath = await selectFolderNative();
        if (realPath) {
          if (target === 'origin') setOrigin(realPath);
          else setDestination(realPath);
        }
        return;
      }

      // Browser/dev mode fallback: the File System Access API can only ever
      // hand back the folder's *name*, never its real path (browser
      // sandboxing), so there's no way to recover a usable absolute path
      // here — just prompt the user to type it in manually instead of
      // fabricating a fake "C:\Seguros\{name}" that doesn't exist.
      if (target === 'origin') {
        setOrigin((prev) => prev || 'C:\\Seguros\\Entrada_PDFs');
      } else {
        setDestination((prev) => prev || 'C:\\Seguros\\Pólizas_Renombradas');
      }
    } catch (e) {
      console.log('Directory selection cancelled or not supported:', e);
    }
  };

  const effectiveOrigin = origin.trim() || 'C:\\Seguros\\Entrada_PDFs';
  const effectiveDestination = destination.trim() || 'C:\\Seguros\\Renombrados_Organizados';
  // One folder inside the other (or the same one) makes the automatic scan
  // pick up — and delete — its own output; main.cjs refuses it too.
  const foldersConflict = foldersOverlap(effectiveOrigin, effectiveDestination);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (foldersConflict) return;
    onSave({
      // Spread first so settings this form doesn't edit (like the saved
      // "automatic scan on" flag) are kept as they were.
      ...folderConfig,
      originPath: effectiveOrigin,
      destinationPath: effectiveDestination,
      autoProcessOnDrop: autoProcess,
      createSubfoldersByCompany: subfolders,
    });
    onClose();
  };

  return (
    <div
      id="folder-config-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <FolderCog className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Rutas de Carpetas Permanentes
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configuración del flujo de lectura y guardado en tu PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Origin Folder */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              📁 Ruta de Carpeta de Origen (Donde están los PDFs sin procesar)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FolderInput className="w-4 h-4 text-amber-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="C:\Seguros\Entrada_PDFs"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handlePickDirectory('origin')}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                title="Examinar carpeta en tu computadora"
              >
                <Folder className="w-3.5 h-3.5 text-blue-500" />
                <span>Examinar</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Carpeta donde colocas los PDFs descargados de las aseguradoras.
            </p>
          </div>

          {/* Destination Folder */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              📂 Ruta de Carpeta de Destino (Donde se guardarán renombrados)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FolderOutput className="w-4 h-4 text-emerald-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="C:\Seguros\Renombrados_Organizados"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handlePickDirectory('destination')}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                title="Examinar carpeta en tu computadora"
              >
                <Folder className="w-3.5 h-3.5 text-emerald-500" />
                <span>Examinar</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Carpeta donde se guardarán con la nomenclatura estándar <code className="font-mono text-blue-600 dark:text-blue-400">PZA-000000000-00...</code>
            </p>
            {isElectron() ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Cada documento procesado o corregido se guardará automáticamente acá — sin necesidad de descargarlo.
              </p>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠️ El guardado automático solo está disponible en la app de escritorio instalada.
              </p>
            )}
          </div>

          {foldersConflict && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs flex items-start gap-2 text-red-800 dark:text-red-300"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{FOLDERS_OVERLAP_MESSAGE}</span>
            </div>
          )}

          {/* Format Rule Reminder Box */}
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
              <Info className="w-4 h-4 text-blue-500" />
              <span>Regla de Renombrado Configurada</span>
            </div>
            <p className="text-blue-800 dark:text-blue-300 font-mono text-[11px]">
              PZA-{"{N° Póliza 9 dígitos}"}-{"{N° Endoso 2 dígitos}"} [-{"{Tipo: Tarjeta de RC | Cuponera}"}].pdf
            </p>
            <p className="text-blue-700 dark:text-blue-400 text-[11px]">
              * Pólizas y Endosos se renombran directamente como <code className="font-semibold">PZA-000123456-00.pdf</code> sin sufijo de tipo.
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoProcess}
                onChange={(e) => setAutoProcess(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Procesar y extraer datos automáticamente al arrastrar archivos
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={subfolders}
                onChange={(e) => setSubfolders(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Organizar en subcarpetas por Compañía al exportar ZIP
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={foldersConflict}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Configuración</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export const FolderConfigModal: React.FC<FolderConfigModalProps> = ({ isOpen, ...contentProps }) => {
  return (
    <AnimatePresence>
      {isOpen && <FolderConfigModalContent key="folder-config-modal" {...contentProps} />}
    </AnimatePresence>
  );
};
