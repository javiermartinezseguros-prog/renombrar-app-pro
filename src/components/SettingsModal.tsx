import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderCog, FolderInput, FolderOutput, X, Check, Folder, Info, AlertTriangle, Minus, Plus, FileText, Camera } from 'lucide-react';
import { FolderConfig } from '../types';
import { isElectron, selectFolderNative } from '../utils/electronBridge';
import { foldersOverlap, FOLDERS_OVERLAP_MESSAGE } from '../utils/paths';
import { AppSettings, clampSetting, DEFAULT_SETTINGS, SETTING_SPECS, SettingKey, settingError } from '../utils/settings';
import { angleError, clampAngle, clampMargin, DEFAULT_INSP_CONFIG, InspConfig, marginError, outputFolderFor } from '../utils/inspecciones/config';
import { TipoVehiculo, TomaId } from '../utils/inspecciones/tomas';
import { InspeccionesAjustes } from './InspeccionesAjustes';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderConfig: FolderConfig;
  settings: AppSettings;
  onSave: (config: FolderConfig, settings: AppSettings) => void;
  /** Cuántos registros del historial se borrarían al guardar si el historial pasara a estos días. */
  countExpiring: (days: number) => number;
  /** Ajustes de la sección Inspecciones. */
  inspConfig: InspConfig;
  onSaveInsp: (config: InspConfig) => void;
  /** Pestaña con la que se abre el cuadro. */
  initialTab: 'polizas' | 'inspecciones';
}

const fmt = (n: number) => String(n).replace('.', ',');

/** Un parámetro: nombre, − número +, qué hace con un ejemplo, rango y valor de fábrica. */
const ParamCard: React.FC<{
  id: SettingKey;
  title: string;
  text: string;
  example: string;
  unit: string;
  draft: string;
  onDraft: (value: string) => void;
  extra?: React.ReactNode;
}> = ({ id, title, text, example, unit, draft, onDraft, extra }) => {
  const spec = SETTING_SPECS[id];
  const error = settingError(id, draft);
  const current = clampSetting(id, draft);
  const bump = (dir: 1 | -1) => onDraft(fmt(clampSetting(id, current + dir * spec.step)));
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`param-${id}`} className="text-xs font-bold text-slate-900 dark:text-white">
          {title}
        </label>
        <div className="flex items-center rounded-xl field-soft overflow-hidden" style={{ padding: 0 }}>
          <button
            type="button"
            aria-label={`Bajar ${title}`}
            onClick={() => bump(-1)}
            className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            id={`param-${id}`}
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            aria-invalid={Boolean(error)}
            className="w-14 h-8 text-center text-sm font-bold bg-transparent text-slate-900 dark:text-white outline-none"
          />
          <span className="pr-1 text-xs text-slate-500 dark:text-slate-400">{unit}</span>
          <button
            type="button"
            aria-label={`Subir ${title}`}
            onClick={() => bump(1)}
            className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{text}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{example}</p>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        De {fmt(spec.min)} a {fmt(spec.max)} {unit} · de fábrica {fmt(spec.factory)} {unit}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {extra}
    </div>
  );
};

// Split out so it only mounts while the modal is open: <AnimatePresence> sees the mount/unmount and plays the
// `exit` animation, and the fields start fresh from the latest saved values every time it reopens.
const SettingsModalContent: React.FC<Omit<SettingsModalProps, 'isOpen'>> = ({
  onClose,
  folderConfig,
  settings,
  onSave,
  countExpiring,
  inspConfig,
  onSaveInsp,
  initialTab,
}) => {
  const [tab, setTab] = useState<'polizas' | 'inspecciones'>(initialTab);
  const [inspSalida, setInspSalida] = useState(inspConfig.outputPath);
  const [inspMargen, setInspMargen] = useState(fmt(inspConfig.marginPct));
  const [inspAngulo, setInspAngulo] = useState(fmt(inspConfig.angleRigor));
  const [reqAuto, setReqAuto] = useState<TomaId[]>(inspConfig.requiredAuto);
  const [reqMoto, setReqMoto] = useState<TomaId[]>(inspConfig.requiredMoto);
  const [origin, setOrigin] = useState(folderConfig.originPath);
  const [destination, setDestination] = useState(folderConfig.destinationPath);
  const [autoProcess, setAutoProcess] = useState(folderConfig.autoProcessOnDrop);
  const [subfolders, setSubfolders] = useState(folderConfig.createSubfoldersByCompany);
  const [historyDays, setHistoryDays] = useState(fmt(settings.historyDays));
  const [fileWait, setFileWait] = useState(fmt(settings.fileWaitSeconds));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePickDirectory = async (target: 'origin' | 'destination') => {
    try {
      // Desktop app: native OS folder dialog via Electron IPC, returns the real absolute path.
      if (isElectron()) {
        const realPath = await selectFolderNative();
        if (realPath) {
          if (target === 'origin') setOrigin(realPath);
          else setDestination(realPath);
        }
        return;
      }
      // Browser/dev mode: the File System Access API can only hand back the folder's *name*, so just
      // suggest a path to edit instead of fabricating one.
      if (target === 'origin') setOrigin((prev) => prev || 'C:\\Seguros\\Entrada_PDFs');
      else setDestination((prev) => prev || 'C:\\Seguros\\Pólizas_Renombradas');
    } catch (e) {
      console.log('Directory selection cancelled or not supported:', e);
    }
  };

  const effectiveOrigin = origin.trim() || 'C:\\Seguros\\Entrada_PDFs';
  const effectiveDestination = destination.trim() || 'C:\\Seguros\\Renombrados_Organizados';
  // One folder inside the other (or the same one) makes the automatic scan pick up — and delete — its own output.
  const foldersConflict = foldersOverlap(effectiveOrigin, effectiveDestination);

  const paramsInvalid = settingError('historyDays', historyDays) !== null || settingError('fileWaitSeconds', fileWait) !== null;
  const newHistoryDays = clampSetting('historyDays', historyDays);
  const expiring = settingError('historyDays', historyDays) === null && newHistoryDays < settings.historyDays ? countExpiring(newHistoryDays) : 0;

  const inspSalidaEfectiva = outputFolderFor({ ...inspConfig, outputPath: inspSalida.trim() }, effectiveOrigin);
  const normal = (r: string) => r.replace(/[\\/]+$/, '').toLowerCase();
  const inspConflicto = normal(inspSalidaEfectiva) === normal(effectiveOrigin);
  const inspInvalid = inspConflicto || marginError(inspMargen) !== null || angleError(inspAngulo) !== null;

  const alternarToma = (tipo: TipoVehiculo, id: TomaId) =>
    (tipo === 'auto' ? setReqAuto : setReqMoto)((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const resetInsp = () => {
    setInspMargen(fmt(DEFAULT_INSP_CONFIG.marginPct));
    setInspAngulo(fmt(DEFAULT_INSP_CONFIG.angleRigor));
    setReqAuto(DEFAULT_INSP_CONFIG.requiredAuto);
    setReqMoto(DEFAULT_INSP_CONFIG.requiredMoto);
  };
  const elegirSalida = async () => {
    if (!isElectron()) return;
    const ruta = await selectFolderNative();
    if (ruta) setInspSalida(ruta);
  };

  const resetParams = () => {
    setHistoryDays(fmt(DEFAULT_SETTINGS.historyDays));
    setFileWait(fmt(DEFAULT_SETTINGS.fileWaitSeconds));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (foldersConflict || paramsInvalid || inspInvalid) return;
    onSave(
      {
        // Spread first so settings this form doesn't edit (like the saved "automatic scan on" flag) are kept.
        ...folderConfig,
        originPath: effectiveOrigin,
        destinationPath: effectiveDestination,
        autoProcessOnDrop: autoProcess,
        createSubfoldersByCompany: subfolders,
      },
      { historyDays: newHistoryDays, fileWaitSeconds: clampSetting('fileWaitSeconds', fileWait) }
    );
    onSaveInsp({ outputPath: inspSalida.trim(), marginPct: clampMargin(inspMargen), angleRigor: clampAngle(inspAngulo), requiredAuto: reqAuto, requiredMoto: reqMoto });
    onClose();
  };

  return (
    <div
      id="settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full max-h-[calc(100vh-32px)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <FolderCog className="w-5 h-5" />
            </div>
            <div>
              <h3 id="settings-title" className="text-base font-bold text-slate-900 dark:text-white">
                Configuración
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Carpetas, lectura y parámetros de la app</p>
            </div>
          </div>
          <div
            data-help="settings-tab-insp"
            role="tablist"
            className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            <button type="button" role="tab" aria-selected={tab === 'polizas'} onClick={() => setTab('polizas')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${tab === 'polizas' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'}`}>
              <FileText className="w-3.5 h-3.5" />Pólizas
            </button>
            <button type="button" role="tab" aria-selected={tab === 'inspecciones'} onClick={() => setTab('inspecciones')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${tab === 'inspecciones' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'}`}>
              <Camera className="w-3.5 h-3.5" />Inspecciones
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {tab === 'inspecciones' ? (
              <InspeccionesAjustes
                origen={effectiveOrigin}
                salida={inspSalida}
                salidaEfectiva={inspSalidaEfectiva}
                onSalida={setInspSalida}
                onElegirSalida={() => void elegirSalida()}
                conflicto={inspConflicto}
                margen={inspMargen}
                onMargen={setInspMargen}
                angulo={inspAngulo}
                onAngulo={setInspAngulo}
                requeridasAuto={reqAuto}
                requeridasMoto={reqMoto}
                onAlternar={alternarToma}
                onFabrica={resetInsp}
              />
            ) : (
              <>
            {/* Columna izquierda: carpetas y opciones */}
            <div className="space-y-4 min-w-0" data-help="settings-folders">
              <div className="space-y-1.5">
                <label htmlFor="cfg-origin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  📁 Ruta de Carpeta de Origen (donde están los PDFs sin procesar)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FolderInput className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="cfg-origin"
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="C:\Seguros\Entrada_PDFs"
                      className="field-soft w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl"
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Carpeta donde ponés los PDFs descargados de las aseguradoras.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cfg-destination" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  📂 Ruta de Carpeta de Destino (donde se guardan renombrados)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FolderOutput className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="cfg-destination"
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="C:\Seguros\Renombrados_Organizados"
                      className="field-soft w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl"
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
                  Se guardan con la nomenclatura estándar <code className="font-mono text-blue-600 dark:text-blue-400">PZA-000000000-00…</code>
                </p>
                {isElectron() ? (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    ✓ Cada documento procesado o corregido se guarda acá automáticamente, sin descargarlo.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">⚠️ El guardado automático solo está disponible en la app de escritorio instalada.</p>
                )}
              </div>

              {foldersConflict && (
                <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs flex items-start gap-2 text-red-800 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{FOLDERS_OVERLAP_MESSAGE}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span>Regla de Renombrado Configurada</span>
                </div>
                <p className="text-blue-800 dark:text-blue-300 font-mono text-[11px]">
                  PZA-{'{N° Póliza 9 dígitos}'}-{'{N° Endoso 2 dígitos}'} [-{'{Tipo: Tarjeta de RC | Cuponera}'}].pdf
                </p>
                <p className="text-blue-700 dark:text-blue-400 text-[11px]">
                  * Pólizas y Endosos se renombran directamente como <code className="font-semibold">PZA-000123456-00.pdf</code> sin sufijo de tipo.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2.5 cursor-pointer" data-help="settings-auto-process">
                  <input
                    type="checkbox"
                    checked={autoProcess}
                    onChange={(e) => setAutoProcess(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">Procesar y extraer datos automáticamente al arrastrar archivos</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer" data-help="settings-subfolders">
                  <input
                    type="checkbox"
                    checked={subfolders}
                    onChange={(e) => setSubfolders(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">Organizar en subcarpetas por Compañía al exportar ZIP</span>
                </label>
              </div>
            </div>

            {/* Columna derecha: parámetros */}
            <div className="space-y-3 min-w-0">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Parámetros</h4>

              <ParamCard
                id="historyDays"
                title="Días que se guarda el historial"
                text="Pasado ese plazo se borra el registro y la copia del PDF. Los archivos de la carpeta Destino no se tocan."
                example="Ejemplo: 7 = una semana."
                unit="días"
                draft={historyDays}
                onDraft={setHistoryDays}
                extra={
                  expiring > 0 ? (
                    <p role="status" className="mt-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1">
                      Al guardar se borran {expiring} {expiring === 1 ? 'registro' : 'registros'} más {expiring === 1 ? 'viejo' : 'viejos'} que {newHistoryDays}{' '}
                      {newHistoryDays === 1 ? 'día' : 'días'} (los PDF de Destino no se tocan).
                    </p>
                  ) : null
                }
              />

              <ParamCard
                id="fileWaitSeconds"
                title="Espera antes de leer un archivo nuevo"
                text="Tiempo que la app espera a que termine de copiarse un PDF antes de leerlo (escaneo automático)."
                example="Ejemplo: 1,5 s. Subilo si tu red o tu disco son lentos."
                unit="s"
                draft={fileWait}
                onDraft={setFileWait}
              />

              <div className="flex items-center justify-between gap-3 text-[11px] pt-1">
                <button
                  type="button"
                  data-help="settings-reset"
                  onClick={resetParams}
                  className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
                >
                  Volver a los valores de fábrica
                </button>
                <span className="text-slate-500 dark:text-slate-400">Se aplica al guardar, sin reiniciar.</span>
              </div>
            </div>
              </>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-help="settings-save"
              disabled={foldersConflict || paramsInvalid || inspInvalid}
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

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, ...contentProps }) => (
  <AnimatePresence>{isOpen && <SettingsModalContent key="settings-modal" {...contentProps} />}</AnimatePresence>
);
