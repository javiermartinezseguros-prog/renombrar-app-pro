import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FolderStatusBar } from './components/FolderStatusBar';
import { DropzoneUploader, DropzoneHandle, ProcessingProgress } from './components/DropzoneUploader';
import { StatsCards } from './components/StatsCards';
import { HistoryTable, HistoryFilters } from './components/HistoryTable';
import { ManualReviewModal } from './components/ManualReviewModal';
import { PolicyInfoSheetModal } from './components/PolicyInfoSheetModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { SettingsModal } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';
import { AboutModal } from './components/AboutModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { WhatsNewModal } from './components/WhatsNewModal';
import { Solapas, Seccion } from './components/Solapas';
import { InspeccionesView, InspeccionesHandle, InspStatus } from './components/InspeccionesView';
import { InspConfig, loadInspConfig, saveInspConfig } from './utils/inspecciones/config';
import {
  ExtractedPolicyData,
  FolderConfig,
  ThemeMode,
  TextZoom,
  DocumentType,
} from './types';
import { generateStandardFileName, formatPolicyNumber, formatEndorsementNumber } from './utils/naming';
import { extractPolicyData } from './utils/policyExtractor';
import {
  isElectron,
  saveFileToDestination,
  showInFolder,
  openFolder,
  startFolderWatch,
  stopFolderWatch,
  onFolderWatchNewFile,
  onFolderWatchError,
  deleteOriginFile,
  onAppUpdated,
  FolderPdfFile,
  AppUpdatedInfo,
  getSystemAccent,
  onSystemAccentChanged,
} from './utils/electronBridge';
import { openContextMenu, setMenuAccent } from './utils/contextMenu';
import { buildEmptySpaceMenu, buildInspEmptyMenu, buildMenuBar } from './utils/menuModel';
import { AppSettings, loadSettings, saveSettings } from './utils/settings';
import { APP_NOTES, APP_VERSION } from './utils/version';
import { installTextFieldMenu } from './utils/textFieldMenu';
import {
  HISTORY_STORAGE_KEY,
  LoadedHistory,
  loadHistory,
  splitByRetention,
} from './utils/history';
import {
  deletePolicyFiles,
  getPolicyFileDataUrl,
  storePolicyFile,
  sweepPolicyFiles,
} from './utils/policyFiles';
import { buildPoliciesZip } from './utils/export';
import { findMissingPolicies } from './utils/pairing';

const STORAGE_KEY_FOLDERS = 'polizamaster_folder_config_v1';
const STORAGE_KEY_THEME = 'polizamaster_theme_mode_v1';
const STORAGE_KEY_ZOOM = 'polizamaster_text_zoom_v1';
const STORAGE_KEY_SECTION = 'polizamaster_section_v1';
// Older versions kept an API key here; nothing reads it any more, so it is
// removed on launch instead of staying behind in plain text.
const LEGACY_STORAGE_KEY_API_KEY = 'polizamaster_gemini_api_key_v1';

// How often a long-running session re-checks which records have passed the
// limit set in Configuración (the check also runs on every launch).
const HISTORY_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function App() {
  // 1. Persistence & Settings State
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(localStorage));
  // Always the latest settings, for code that runs outside a render (timers).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const initialHistory = useRef<LoadedHistory | null>(null);
  if (initialHistory.current === null) initialHistory.current = loadHistory(localStorage, Date.now(), settings.historyDays);

  const [policies, setPolicies] = useState<ExtractedPolicyData[]>(() => initialHistory.current!.policies);
  // Always the latest list, for code that runs outside a render (timers).
  const policiesRef = useRef(policies);
  policiesRef.current = policies;

  const [folderConfig, setFolderConfig] = useState<FolderConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FOLDERS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error loading folderConfig:', e);
    }
    return {
      originPath: 'C:\\Seguros\\Entrada_PDFs',
      destinationPath: 'C:\\Seguros\\Renombrados_Organizados',
      autoProcessOnDrop: true,
      createSubfoldersByCompany: false,
    };
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      if (saved) return saved as ThemeMode;
    } catch (e) {}
    return 'system';
  });

  const [textZoom, setTextZoom] = useState<TextZoom>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ZOOM);
      if (saved) return saved as TextZoom;
    } catch (e) {}
    return 'normal';
  });

  // Sección a la vista: Pólizas o Inspecciones (se recuerda al cerrar, como una comodidad).
  const [section, setSection] = useState<Seccion>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SECTION) === 'inspecciones' ? 'inspecciones' : 'polizas';
    } catch (e) {}
    return 'polizas';
  });
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const [inspConfig, setInspConfig] = useState<InspConfig>(() => loadInspConfig(localStorage));
  const [inspStatus, setInspStatus] = useState<InspStatus>({ pie: 'Sin vehículo en pantalla', hayFotos: false, puedeRenombrar: false, ocupado: false });
  const inspRef = useRef<InspeccionesHandle>(null);
  const [settingsTab, setSettingsTab] = useState<Seccion>('polizas');

  // UI Modals State
  const [isFolderConfigOpen, setIsFolderConfigOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [filters, setFilters] = useState<HistoryFilters>({ query: '', type: 'all', company: 'all' });
  const dropzoneRef = useRef<DropzoneHandle>(null);
  const [reviewPolicy, setReviewPolicy] = useState<ExtractedPolicyData | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<ExtractedPolicyData | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<ExtractedPolicyData | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({ done: 0, total: 0 });
  // «Detener»: los que ya están leyéndose terminan, los demás no empiezan.
  const cancelRef = useRef(false);
  const [isStopping, setIsStopping] = useState(false);
  // Otra tarea larga a la vista (armar el ZIP) y los archivos que el escaneo automático está leyendo.
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [watchReading, setWatchReading] = useState<string[]>([]);

  // Whether the origin folder is currently being watched live (desktop app
  // only) — "Auto-Procesar Carpeta Origen" toggles this instead of doing a
  // one-shot scan, so new PDFs dropped in later get picked up automatically
  // without the user clicking anything again.
  const [isWatchingFolder, setIsWatchingFolder] = useState(false);

  // Set once, right after the app relaunches into a version it hasn't seen
  // before (see main.cjs's checkAndNotifyVersionUpdate) — null the rest of
  // the time, which the modal below renders as closed.
  const [appUpdateNotice, setAppUpdateNotice] = useState<AppUpdatedInfo | null>(null);

  useEffect(() => {
    if (!isElectron()) return;
    return onAppUpdated((info) => setAppUpdateNotice(info));
  }, []);

  // Menús del clic derecho: la fila bajo el mouse lleva el color de acento de
  // Windows (y lo sigue si el usuario lo cambia), y los campos de texto tienen
  // su menú de Cortar / Copiar / Pegar.
  useEffect(() => {
    void getSystemAccent().then(setMenuAccent);
    const stopAccent = onSystemAccentChanged(setMenuAccent);
    const stopTextMenu = installTextFieldMenu();
    return () => {
      stopAccent();
      stopTextMenu();
    };
  }, []);

  // Save to localStorage. The history holds only text fields (the PDFs live in
  // their own files), so it stays far below the browser's storage quota; if a
  // write fails anyway, say so instead of silently freezing the saved history.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(policies));
    } catch (e) {
      console.warn('No se pudo guardar el historial en localStorage:', e);
    }
  }, [policies]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folderConfig));
    } catch (e) {}
  }, [folderConfig]);

  // History retention: nothing older than the days set in Configuración (7 by default) is kept —
  // neither the record nor the copy of its PDF. On launch: first move any
  // PDF an older version embedded in a record into its own file, delete the
  // copies of the records that expired while the app was closed, and sweep
  // any stray copy no record claims. While the app stays open: re-check
  // every hour.
  const purgeExpiredHistory = () => {
    const days = settingsRef.current.historyDays;
    const { expired } = splitByRetention(policiesRef.current, Date.now(), days);
    if (expired.length === 0) return;
    setPolicies((prev) => splitByRetention(prev, Date.now(), days).kept);
    void deletePolicyFiles(expired.map((policy) => policy.id));
  };

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY_API_KEY);
    } catch (e) {}
    const { legacyFiles, expiredIds, policies: loaded } = initialHistory.current!;
    void (async () => {
      for (const [id, dataUrl] of legacyFiles) await storePolicyFile(id, dataUrl);
      await deletePolicyFiles(expiredIds);
      await sweepPolicyFiles(loaded.map((policy) => policy.id));
    })();
    const timer = setInterval(purgeExpiredHistory, HISTORY_PURGE_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resumes the origin-folder watch on launch if it was left on before the
  // app was last closed — without this, the watch always started OFF on
  // every launch, so any PDF that showed up while the app was closed (or
  // before the user got around to re-clicking the button) just sat there.
  // Confirmed real complaint that looked like specific companies' files
  // "don't get picked up automatically", when it was really a restart/
  // timing gap that could affect any company depending on when its files
  // happen to arrive relative to the app being open. Runs once on mount.
  useEffect(() => {
    if (!isElectron() || !folderConfig.autoScanEnabled) return;
    if (!folderConfig.originPath || !folderConfig.destinationPath) return;
    startFolderWatch(folderConfig.originPath, folderConfig.destinationPath, settingsRef.current.fileWaitSeconds).then((result) => {
      if (result.success) {
        setIsWatchingFolder(true);
        addToast(
          'info',
          'Escaneo Automático Reanudado',
          `Sigue activo sobre "${folderConfig.originPath}" desde que abriste la app.`
        );
      } else {
        addToast(
          'error',
          'No se pudo reanudar el escaneo automático',
          result.error || `Verificá que "${folderConfig.originPath}" sea una ruta válida.`
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SECTION, section);
    } catch (e) {}
  }, [section]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ZOOM, textZoom);
    } catch (e) {}

    // Apply font size directly to root html element for full rem-based scaling
    const root = document.documentElement;
    if (textZoom === 'large') {
      root.style.fontSize = '112.5%'; // ~18px
    } else if (textZoom === 'xlarge') {
      root.style.fontSize = '125%'; // ~20px
    } else {
      root.style.fontSize = '100%'; // 16px default
    }
  }, [textZoom]);

  // System theme listener & Theme applier
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      root.classList.remove('dark', 'high-contrast');

      if (theme === 'high-contrast') {
        root.classList.add('dark', 'high-contrast');
      } else if (theme === 'dark') {
        root.classList.add('dark');
      } else if (theme === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        if (mediaQuery.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  // Toast Helper
  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Parallel Concurrency Helper for ultra fast extraction
  const processFilesConcurrent = async (
    files: File[],
    concurrency = 4,
    destDirHandle?: any,
    reportProgress = true
  ): Promise<ExtractedPolicyData[]> => {
    const results: ExtractedPolicyData[] = [];
    let completedCount = 0;
    let index = 0;
    const startedAt = Date.now();
    const publish = (name?: string) => {
      if (reportProgress) setProcessingProgress({ done: completedCount, total: files.length, currentFileName: name, startedAt });
    };

    const worker = async () => {
      // «Detener»: no se empieza ningún archivo nuevo; los que ya están en marcha terminan.
      while (index < files.length && !(reportProgress && cancelRef.current)) {
        const currentIndex = index++;
        const file = files[currentIndex];

        publish(file.name);

        let base64: string | undefined;
        try {
          base64 = await fileToBase64(file);
          const result = await extractPolicyData(file);
          const extracted = result.data || {};

          const docType = (extracted.tipoDocumento || 'Póliza') as DocumentType;
          // Confirmed real bug: falling back to `file.name` here (instead of
          // just letting formatPolicyNumber's own '000000000' placeholder
          // apply) baked the original filename's digits/letters into the
          // saved/renamed file whenever extraction found no policy number —
          // a fabricated-looking policy number that didn't match what the
          // UI showed for the same record (numeroPoliza below correctly
          // fell back to the literal placeholder). Passing through
          // undefined lets formatPolicyNumber apply its own real fallback
          // consistently in both places.
          const paddedPolicy = formatPolicyNumber(extracted.numeroPoliza);
          const paddedEndorsement = formatEndorsementNumber(extracted.numeroEndoso || '00');
          const standardName = generateStandardFileName(paddedPolicy, paddedEndorsement, docType);

          const isLowConfidence =
            extracted.confianza === 'Baja' ||
            !extracted.asegurado ||
            extracted.asegurado === 'Asegurado por Identificar' ||
            !extracted.numeroPoliza;

          const processedAtMs = Date.now();
          const newRecord: ExtractedPolicyData = {
            id: `file-${processedAtMs}-${currentIndex}-${Math.random().toString(36).substring(2, 7)}`,
            originalFileName: file.name,
            fileSize: file.size,
            compania: extracted.compania || 'Compañía de Seguros',
            asegurado: (extracted.asegurado || 'ASEGURADO NO IDENTIFICADO').toUpperCase(),
            numeroPoliza: extracted.numeroPoliza || '000000000',
            numeroPolizaPadded: paddedPolicy,
            numeroEndoso: paddedEndorsement,
            rubro: extracted.rubro || 'Automotor',
            tipoDocumento: docType,
            vigenciaDesde: extracted.vigenciaDesde || '',
            vigenciaHasta: extracted.vigenciaHasta || '',
            vehiculo: extracted.vehiculo,
            premioTotal: extracted.premioTotal,
            moneda: extracted.moneda || 'ARS',
            observaciones: extracted.observaciones || `Procesado mediante ${result.source}`,
            confianza: isLowConfidence ? 'Baja' : (extracted.confianza || 'Alta'),
            suggestedFileName: standardName,
            finalFileName: standardName,
            isCustomRenamed: false,
            status: isLowConfidence ? 'Revisión Requerida' : 'Completado',
            processedAt: new Date(processedAtMs).toLocaleString('es-AR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
            processedAtMs,
            originPath: `${folderConfig.originPath}\\${file.name}`,
            destinationPath: `${folderConfig.destinationPath}\\${standardName}`,
          };

          // Keep a copy of the PDF for the history (preview, download, manual
          // correction) — stored before anything else touches the file, and
          // deleted together with this record once it leaves the history.
          await storePolicyFile(newRecord.id, base64);

          // If destination directory handle is available (from the folder-picker
          // scan flow), write the renamed file directly there.
          if (destDirHandle) {
            try {
              const fileHandle = await destDirHandle.getFileHandle(standardName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(file);
              await writable.close();
              newRecord.savedToDisk = true;
            } catch (writeErr) {
              console.warn(`Could not save directly to destination directory:`, writeErr);
            }
          } else if (isElectron() && folderConfig.destinationPath) {
            // Regular drag-and-drop flow (desktop app): write straight to the
            // permanently configured destination folder — no manual download
            // step needed, the renamed PDF just appears there.
            const saveResult = await saveFileToDestination(folderConfig.destinationPath, standardName, base64);
            if (saveResult.success) {
              newRecord.savedToDisk = true;
              newRecord.destinationPath = saveResult.path;
              // Confirmed real bug: main.cjs used to overwrite silently
              // whenever a DIFFERENT document in the same batch already
              // computed this exact standardName — 12 files in, only 8
              // distinct names surviving on disk, with no visible sign
              // anything was lost. main.cjs now appends "(2)"/"(3)..." on a
              // real collision instead of overwriting; when it does, the
              // table has to reflect that ACTUAL saved name too, or it
              // would show a filename that isn't what's really in the
              // destination folder.
              const actualFileName = saveResult.path?.split(/[\\/]/).pop();
              if (actualFileName && actualFileName !== standardName) {
                newRecord.finalFileName = actualFileName;
                newRecord.suggestedFileName = actualFileName;
                newRecord.confianza = 'Baja';
                newRecord.status = 'Revisión Requerida';
                newRecord.observaciones = `${newRecord.observaciones ? newRecord.observaciones + ' — ' : ''}Ya existía otro archivo con el nombre "${standardName}" en destino (posible dato duplicado o extracción fallida en alguno de los dos); se guardó como "${actualFileName}" para no perder ninguno. Revisar.`;
              }
            } else {
              console.warn(`Could not auto-save "${standardName}" to destination folder:`, saveResult.error);
              addToast(
                'error',
                `No se pudo guardar "${standardName}" en destino`,
                saveResult.error || 'Verificá que la carpeta de destino sea válida y tengas permisos de escritura.'
              );
            }
          }

          results[currentIndex] = newRecord;
        } catch (err: any) {
          console.error(`Error processing file ${file.name}:`, err);
          const standardName = generateStandardFileName('000000000', '00', 'Póliza');
          const processedAtMs = Date.now();
          const errorRecord: ExtractedPolicyData = {
            id: `file-err-${processedAtMs}-${currentIndex}`,
            originalFileName: file.name,
            fileSize: file.size,
            compania: 'Aseguradora por Identificar',
            asegurado: 'REVISIÓN REQUERIDA',
            numeroPoliza: '000000000',
            numeroPolizaPadded: '000000000',
            numeroEndoso: '00',
            rubro: 'Automotor',
            tipoDocumento: 'Póliza',
            confianza: 'Baja',
            observaciones: `Error al leer archivo: ${err.message || 'Formato ilegible'}. Revisar manualmente.`,
            suggestedFileName: standardName,
            finalFileName: standardName,
            isCustomRenamed: false,
            status: 'Revisión Requerida',
            processedAt: new Date(processedAtMs).toLocaleString('es-AR'),
            processedAtMs,
            originPath: `${folderConfig.originPath}\\${file.name}`,
            destinationPath: `${folderConfig.destinationPath}\\${standardName}`,
          };
          // Whatever could be read of the file is still kept for the history,
          // so the manual review can show it.
          if (base64) await storePolicyFile(errorRecord.id, base64).catch(() => {});
          results[currentIndex] = errorRecord;
        } finally {
          completedCount++;
          publish(file.name);
        }
      }
    };

    const workerPool = Array(Math.min(concurrency, files.length))
      .fill(0)
      .map(() => worker());

    await Promise.all(workerPool);
    return results.filter(Boolean);
  };

  const handleStopProcessing = () => {
    cancelRef.current = true;
    setIsStopping(true);
  };

  // Process PDF Files uploaded by user (with parallel concurrency)
  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    cancelRef.current = false;
    setIsStopping(false);
    setIsProcessing(true);
    setProcessingProgress({ done: 0, total: files.length, startedAt: Date.now() });

    const newExtractedList = await processFilesConcurrent(files, 4);

    setPolicies((prev) => [...newExtractedList, ...prev]);
    setIsProcessing(false);
    setIsStopping(false);

    if (cancelRef.current) {
      cancelRef.current = false;
      addToast(
        'info',
        'Lectura detenida',
        `Se leyeron ${newExtractedList.length} de ${files.length} documentos; lo ya leído quedó en el historial. Los demás no se leyeron: podés volver a agregarlos.`
      );
      return;
    }

    const savedCount = newExtractedList.filter((p) => p.savedToDisk).length;
    if (isElectron() && folderConfig.destinationPath) {
      addToast(
        'success',
        '¡Procesamiento Completado!',
        savedCount === newExtractedList.length
          ? `Se procesaron y guardaron ${savedCount} documento(s) directamente en "${folderConfig.destinationPath}".`
          : `Se procesaron ${newExtractedList.length} documento(s); ${savedCount} se guardaron en la carpeta de destino y el resto quedó disponible para descargar manualmente.`
      );
    } else {
      addToast(
        'success',
        '¡Procesamiento Rápido Completado!',
        `Se procesaron y renombraron ${newExtractedList.length} documento(s) en paralelo.`
      );
    }
  };

  // Handles a single new file reported by the live folder watch — same
  // extraction/rename/auto-save pipeline as drag-and-drop, run one file at a
  // time as they trickle in (rather than the whole-batch progress bar, which
  // is for an upfront pile of files, not files arriving over time).
  // Caps how many files the folder watch will extract at once — confirmed
  // real bug: each 'folder-watch-new-file' event used to call
  // processFilesConcurrent independently with no queue shared across calls,
  // unlike the drag-and-drop batch path (which caps at 4 workers). Left
  // unthrottled, a folder with 100+ pre-existing PDFs firing 'add' all at
  // once on watch start/resume would launch 100+ concurrent PDF.js/OCR
  // calls simultaneously.
  const WATCH_CONCURRENCY = 4;
  const watchQueueRef = useRef<{ running: number; waiters: (() => void)[] }>({ running: 0, waiters: [] });
  const runWithWatchLimit = async (task: () => Promise<void>) => {
    if (watchQueueRef.current.running >= WATCH_CONCURRENCY) {
      await new Promise<void>((resolve) => watchQueueRef.current.waiters.push(resolve));
    }
    watchQueueRef.current.running++;
    try {
      await task();
    } finally {
      watchQueueRef.current.running--;
      const next = watchQueueRef.current.waiters.shift();
      if (next) next();
    }
  };

  const handleWatchedFile = async (file: FolderPdfFile) => {
    setWatchReading((prev) => [...prev, file.name]);
    try {
      const res = await fetch(file.dataUrl);
      const blob = await res.blob();
      const fileObj = new File([blob], file.name, { type: 'application/pdf' });
      const [result] = await processFilesConcurrent([fileObj], 1, undefined, false);
      setPolicies((prev) => [result, ...prev]);

      // Once the renamed copy is safely sitting in the destination folder,
      // remove the original from the origin folder — confirmed real
      // request: otherwise every processed PDF just piles up there forever.
      // Only ever done after a *confirmed* successful save (never
      // speculatively), and only for files that came from the watch itself
      // (file.path is only set for those).
      if (result.savedToDisk && file.path) {
        const deleteResult = await deleteOriginFile(file.path);
        if (!deleteResult.success) {
          console.warn(`No se pudo borrar el archivo de origen "${file.name}":`, deleteResult.error);
        }
      }

      addToast(
        'success',
        'Nuevo Documento Detectado y Procesado',
        result.savedToDisk ? `Guardado en destino: ${result.finalFileName}` : result.finalFileName
      );
    } catch (e: any) {
      addToast('error', 'Error al procesar archivo detectado', `${file.name}: ${e.message}`);
    } finally {
      setWatchReading((prev) => {
        const at = prev.indexOf(file.name);
        return at < 0 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
      });
    }
  };

  // Subscribes to new-file/error events from the main-process filesystem
  // watcher (see main.cjs) UNCONDITIONALLY (not gated on isWatchingFolder) —
  // confirmed real race otherwise: start-folder-watch resolves and only
  // THEN does a downstream effect (keyed on isWatchingFolder) attach this
  // listener, but chokidar's initial scan for pre-existing files can emit
  // 'add' events before that later effect ever runs, and Electron does not
  // queue/replay IPC sends for a listener that attaches after they fired —
  // those files were silently dropped. Subscribing here, on mount, well
  // before the watch can possibly start (whether via the toggle button or
  // the launch-resume effect below), closes that gap entirely. Re-subscribes
  // whenever folderConfig changes so handleWatchedFile's closure (via
  // processFilesConcurrent) always sees current values.
  useEffect(() => {
    if (!isElectron()) return;
    const unsubscribeFile = onFolderWatchNewFile((file) => {
      runWithWatchLimit(() => handleWatchedFile(file));
    });
    const unsubscribeError = onFolderWatchError((message) => {
      addToast('error', 'Error en el escaneo automático', message);
    });
    return () => {
      unsubscribeFile();
      unsubscribeError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderConfig]);

  // Toggles a persistent watch on the origin folder (desktop app only):
  // every PDF already there when it starts, plus every one dropped in
  // afterward, gets processed automatically — no more re-clicking the
  // button for each new batch of files. Previously this was a one-shot
  // scan that ALSO used to always open a browser `showDirectoryPicker()`
  // ignoring the paths already set in "Rutas Carpetas" (which could only
  // ever recover a folder's *name*, not its real path, and overwrote
  // folderConfig with a fabricated "C:\Seguros\{name}" pointing nowhere
  // real) — that's fixed too: the desktop path below uses the real
  // configured paths directly via Electron IPC, no picker at all.
  const handleToggleFolderWatch = async () => {
    if (isElectron()) {
      if (isWatchingFolder) {
        await stopFolderWatch();
        setIsWatchingFolder(false);
        setFolderConfig((prev) => ({ ...prev, autoScanEnabled: false }));
        addToast(
          'info',
          'Escaneo Automático Detenido',
          'Ya no se procesan nuevos archivos de la carpeta de origen automáticamente.'
        );
        return;
      }

      if (!folderConfig.originPath || !folderConfig.destinationPath) {
        addToast(
          'error',
          'Faltan carpetas configuradas',
          'Configurá la carpeta de Origen y de Destino en Configuración antes de usar el auto-procesamiento.'
        );
        setIsFolderConfigOpen(true);
        return;
      }

      const result = await startFolderWatch(folderConfig.originPath, folderConfig.destinationPath, settings.fileWaitSeconds);
      if (!result.success) {
        addToast(
          'error',
          'No se pudo iniciar el escaneo automático',
          result.error || `Verificá que "${folderConfig.originPath}" sea una ruta válida.`
        );
        return;
      }
      setIsWatchingFolder(true);
      setFolderConfig((prev) => ({ ...prev, autoScanEnabled: true }));
      addToast(
        'success',
        '¡Escaneo Automático Activado!',
        `Todo lo que aparezca en "${folderConfig.originPath}" se procesa y guarda solo en "${folderConfig.destinationPath}". Va a seguir activo aunque cierres y vuelvas a abrir la app.`
      );
      return;
    }

    // Browser/dev mode (npm run dev, not the packaged app): there's no
    // filesystem access without a picker, so this fallback is unavoidable —
    // and since the File System Access API can only ever recover a folder's
    // *name*, folderConfig is updated with a display-only placeholder, not a
    // real usable path.
    try {
      if (!('showDirectoryPicker' in window)) {
        addToast(
          'info',
          'Modo de Archivos',
          'Usa el botón de arrastrar archivos o examinar para seleccionar los PDFs de tu carpeta.'
        );
        return;
      }

      addToast('info', 'Paso 1: Carpeta Origen', 'Selecciona la carpeta donde tienes los PDFs descargados.');
      const originDirHandle = await (window as any).showDirectoryPicker({
        id: 'origin_folder_picker',
        mode: 'read',
      });

      if (!originDirHandle) return;

      const pdfFiles: File[] = [];
      for await (const entry of (originDirHandle as any).values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
          const file = await entry.getFile();
          pdfFiles.push(file);
        }
      }

      if (pdfFiles.length === 0) {
        addToast(
          'info',
          'Carpeta sin PDFs',
          `No se encontraron archivos .pdf dentro de "${originDirHandle.name}".`
        );
        return;
      }

      addToast(
        'info',
        'Paso 2: Carpeta Destino',
        `Selecciona la carpeta donde guardar los ${pdfFiles.length} archivos renombrados.`
      );
      let destDirHandle: any = null;
      try {
        destDirHandle = await (window as any).showDirectoryPicker({
          id: 'destination_folder_picker',
          mode: 'readwrite',
        });
      } catch (destErr) {
        console.log('Destination folder selection skipped or cancelled');
      }

      setFolderConfig((prev) => ({
        ...prev,
        originPath: `C:\\Seguros\\${originDirHandle.name}`,
        destinationPath: destDirHandle ? `C:\\Seguros\\${destDirHandle.name}` : prev.destinationPath,
      }));

      cancelRef.current = false;
      setIsStopping(false);
      setIsProcessing(true);
      setProcessingProgress({ done: 0, total: pdfFiles.length, startedAt: Date.now() });

      const processedResults = await processFilesConcurrent(pdfFiles, 4, destDirHandle);

      setPolicies((prev) => [...processedResults, ...prev]);
      setIsProcessing(false);

      if (destDirHandle) {
        addToast(
          'success',
          '¡Carpeta Procesada y Guardada!',
          `Se procesaron ${processedResults.length} PDFs desde "${originDirHandle.name}" y se guardaron directamente en "${destDirHandle.name}".`
        );
      } else {
        addToast(
          'success',
          '¡Carpeta Procesada con Éxito!',
          `Se leyeron y renombraron ${processedResults.length} PDFs de "${originDirHandle.name}".`
        );
      }
    } catch (e: any) {
      setIsProcessing(false);
      if (e.name !== 'AbortError') {
        console.error('Error in handleScanAndProcessFolder:', e);
        addToast('error', 'Error al escanear carpeta', e.message);
      }
    }
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Saves the folders and the parameters of Configuración. Everything applies right away, no restart: a watch
  // that is already running keeps using the folders (and the wait time) it was started with, so it is restarted
  // — leaving it on the old origin while the destination moved is how an output folder ends up inside the
  // folder being watched.
  const handleSaveSettings = async (newConfig: FolderConfig, newSettings: AppSettings) => {
    const foldersChanged =
      newConfig.originPath !== folderConfig.originPath ||
      newConfig.destinationPath !== folderConfig.destinationPath;
    const waitChanged = newSettings.fileWaitSeconds !== settings.fileWaitSeconds;
    const daysChanged = newSettings.historyDays !== settings.historyDays;
    setFolderConfig(newConfig);
    settingsRef.current = newSettings;
    setSettings(newSettings);
    saveSettings(localStorage, newSettings);
    // Fewer days than before: what is now too old goes right away (the screen warned how many).
    if (daysChanged) purgeExpiredHistory();
    addToast('success', 'Configuración Guardada', 'Las carpetas y los parámetros ya están aplicados.');

    if ((!foldersChanged && !waitChanged) || !isElectron() || !isWatchingFolder) return;
    const result = await startFolderWatch(newConfig.originPath, newConfig.destinationPath, newSettings.fileWaitSeconds);
    if (result.success) {
      addToast('info', 'Escaneo Automático Reiniciado', `Ahora vigila "${newConfig.originPath}".`);
    } else {
      await stopFolderWatch();
      setIsWatchingFolder(false);
      setFolderConfig((prev) => ({ ...prev, autoScanEnabled: false }));
      addToast(
        'error',
        'El escaneo automático quedó detenido',
        result.error || 'No se pudo vigilar la nueva carpeta de origen.'
      );
    }
  };

  // Save manual edit — writes the corrected PDF straight to the destination
  // folder (desktop app) instead of leaving the user to click "Descargar"
  // afterwards. If the computed name changed from what was previously saved
  // (e.g. correcting the policy number changes the standard filename), the
  // stale copy under the old name is cleaned up too.
  const handleSaveManualReview = async (updatedPolicy: ExtractedPolicyData) => {
    const previous = policies.find((p) => p.id === updatedPolicy.id);
    const previousFileName =
      previous?.savedToDisk && previous.finalFileName !== updatedPolicy.finalFileName
        ? previous.finalFileName
        : undefined;

    let verifiedPolicy: ExtractedPolicyData = {
      ...updatedPolicy,
      status: 'Completado',
      confianza: 'Alta',
    };

    if (isElectron() && folderConfig.destinationPath) {
      const fileDataUrl = await getPolicyFileDataUrl(verifiedPolicy.id);
      if (!fileDataUrl) {
        addToast(
          'error',
          'No se pudo regrabar el PDF en destino',
          'La copia del PDF ya no está disponible. Se guardaron los datos corregidos, pero el archivo en la carpeta de destino quedó como estaba.'
        );
      } else {
        const saveResult = await saveFileToDestination(
          folderConfig.destinationPath,
          verifiedPolicy.finalFileName,
          fileDataUrl,
          previousFileName
        );
        if (saveResult.success) {
          verifiedPolicy = { ...verifiedPolicy, savedToDisk: true, destinationPath: saveResult.path };
        } else {
          addToast(
            'error',
            'No se pudo guardar en la carpeta de destino',
            saveResult.error || 'Verificá que la carpeta de destino sea válida y tengas permisos de escritura.'
          );
        }
      }
    }

    setPolicies((prev) =>
      prev.map((item) => (item.id === verifiedPolicy.id ? verifiedPolicy : item))
    );

    addToast(
      'success',
      '¡Documento Aprobado y Listo!',
      verifiedPolicy.savedToDisk
        ? `Guardado en la carpeta de destino como: ${verifiedPolicy.finalFileName}`
        : `Movido a categoría "${verifiedPolicy.tipoDocumento}" con estado Listo: ${verifiedPolicy.finalFileName}`
    );
  };

  // A scanned document whose policy number the OCR cannot read (ATM's card) takes it from another
  // document of the same insured and the same validity dates, when exactly one number matches
  // (see utils/pairing.ts). The renamed copy in the destination folder is replaced like in a
  // manual correction. Runs on every change of the list, so it does not matter which of the two
  // documents was processed first.
  const pairingBusyRef = useRef(false);
  const pairingAgainRef = useRef(false);
  // Ids already handled (completed or failed) in this session. The list the loop reads is the one
  // of the last render, so right after completing a record the same stale copy may come around
  // again (a state change during the file save, or React's double effect in development): without
  // this a second save would leave a duplicate "(2)" file and a second notice.
  const pairingTriedRef = useRef<Set<string>>(new Set());

  const completeMissingPolicies = async (list: ExtractedPolicyData[]) => {
    const pairings = findMissingPolicies(list).filter((p) => !pairingTriedRef.current.has(p.id));
    for (const pairing of pairings) {
      if (pairingTriedRef.current.has(pairing.id)) continue;
      pairingTriedRef.current.add(pairing.id);
      const target = list.find((p) => p.id === pairing.id);
      if (!target) continue;
      const padded = formatPolicyNumber(pairing.numeroPoliza);
      const newName = target.isCustomRenamed
        ? target.finalFileName
        : generateStandardFileName(padded, target.numeroEndoso, target.tipoDocumento);
      let updated: ExtractedPolicyData = {
        ...target,
        numeroPoliza: pairing.numeroPoliza,
        numeroPolizaPadded: padded,
        suggestedFileName: newName,
        finalFileName: newName,
        confianza: 'Media',
        status: 'Completado',
        numeroPolizaDe: pairing.sourceFileName,
        observaciones: `${target.observaciones ? target.observaciones + ' — ' : ''}El OCR no pudo leer el número de póliza en este documento: se tomó de "${pairing.sourceFileName}" (mismo asegurado y misma vigencia).`,
      };

      if (target.savedToDisk && isElectron() && folderConfig.destinationPath) {
        const fileDataUrl = await getPolicyFileDataUrl(target.id);
        const saveResult = fileDataUrl
          ? await saveFileToDestination(folderConfig.destinationPath, newName, fileDataUrl, target.finalFileName)
          : undefined;
        if (!saveResult?.success) {
          // Could not rewrite the saved copy: leave the record as it was (still "Revisión Requerida").
          continue;
        }
        const actualName = saveResult.path?.split(/[\\/]/).pop();
        updated = {
          ...updated,
          destinationPath: saveResult.path,
          ...(actualName && actualName !== newName ? { finalFileName: actualName, suggestedFileName: actualName } : {}),
        };
      }

      setPolicies((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      addToast('info', 'Número de póliza completado', `${updated.finalFileName}: tomado de "${pairing.sourceFileName}".`);
    }
  };

  const runPairing = async () => {
    if (pairingBusyRef.current) {
      pairingAgainRef.current = true;
      return;
    }
    pairingBusyRef.current = true;
    try {
      do {
        pairingAgainRef.current = false;
        await completeMissingPolicies(policiesRef.current);
      } while (pairingAgainRef.current);
    } finally {
      pairingBusyRef.current = false;
    }
  };

  useEffect(() => {
    void runPairing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies]);

  // Delete policy from history (and the copy of its PDF that went with it)
  const handleDeletePolicy = (id: string) => {
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    void deletePolicyFiles([id]);
    addToast('info', 'Documento Eliminado', 'Se quitó el registro del historial.');
  };

  // Batch delete
  const handleBatchDelete = (ids: string[]) => {
    setPolicies((prev) => prev.filter((p) => !ids.includes(p.id)));
    void deletePolicyFiles(ids);
    addToast('info', 'Registros Eliminados', `Se eliminaron ${ids.length} documentos.`);
  };

  // Reveal an already-saved file in the OS file explorer (desktop app only)
  const handleShowInFolder = async (policy: ExtractedPolicyData) => {
    if (!policy.destinationPath) return;
    const result = await showInFolder(policy.destinationPath);
    if (!result.success) {
      addToast('error', 'No se pudo mostrar el archivo', result.error || 'El archivo ya no existe en esa ubicación.');
    }
  };

  // Copy policy number toast trigger
  const handleCopyPolicyNumber = (policyNumber: string) => {
    addToast(
      'success',
      '¡Número de Póliza Copiado!',
      `${policyNumber} copiado al portapapeles listo para usar en tu sistema.`
    );
  };

  // Download Single PDF
  const handleDownloadSingle = async (policy: ExtractedPolicyData) => {
    try {
      const fileDataUrl = await getPolicyFileDataUrl(policy.id);
      if (!fileDataUrl) {
        addToast(
          'error',
          'El PDF ya no está disponible',
          'La copia del PDF solo se conserva mientras el registro está en el historial. Buscalo en la carpeta de destino.'
        );
        return;
      }
      const link = document.createElement('a');
      link.href = fileDataUrl;
      link.download = policy.finalFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast('success', 'Descargando Archivo', policy.finalFileName);
    } catch (e: any) {
      addToast('error', 'Error al descargar', e.message);
    }
  };

  // Export All as ZIP organized in destination folder
  const handleExportAllZip = async () => {
    if (policies.length === 0) return;

    setBusyLabel(`Armando el ZIP con ${policies.length} documentos…`);
    try {
      const { blob, included, missing } = await buildPoliciesZip(
        policies,
        folderConfig.createSubfoldersByCompany,
        getPolicyFileDataUrl
      );

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Polizas_Renombradas_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      addToast(
        'success',
        '¡Exportación ZIP Exitosa!',
        missing === 0
          ? `Se descargaron ${included} archivos con el formato oficial.`
          : `Se descargaron ${included} archivos. ${missing} registro(s) figuran solo en el índice CSV porque su PDF ya no está disponible.`
      );
    } catch (e: any) {
      console.error('Error generating zip:', e);
      addToast('error', 'Error al exportar ZIP', e.message);
    } finally {
      setBusyLabel(null);
    }
  };

  // ---------- barra de menús, atajos y clic derecho en espacio vacío ----------
  const anyModalOpen =
    isFolderConfigOpen || isHelpOpen || isAboutOpen || Boolean(reviewPolicy || detailPolicy || previewPolicy || appUpdateNotice);

  const openSettings = () => {
    setSettingsTab(sectionRef.current);
    setIsFolderConfigOpen(true);
  };
  const handleSaveInsp = (config: InspConfig) => {
    setInspConfig(config);
    saveInspConfig(localStorage, config);
  };
  const openHelp = () => setIsHelpOpen(true);
  const addFiles = () => dropzoneRef.current?.openFiles();
  const addFolder = () => dropzoneRef.current?.openFolder();
  const focusSearch = () => {
    const el = document.getElementById('search-policies-input') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  };
  const showWhatsNew = () => {
    if (APP_NOTES.length === 0) {
      addToast('info', 'Sin novedades', 'Esta versión no tiene novedades para mostrar.');
      return;
    }
    setIsAboutOpen(false);
    setAppUpdateNotice({ version: APP_VERSION, notes: APP_NOTES });
  };
  const openFolderFromMenu = async (path: string) => {
    const result = await openFolder(path);
    if (!result.success) addToast('error', 'No se pudo abrir la carpeta', result.error);
  };

  const menuBar = buildMenuBar(
    {
      watching: isWatchingFolder,
      canOpenFolders: isElectron(),
      hasPolicies: policies.length > 0,
      reviewOnly: filters.type === 'revision',
      theme,
      zoom: textZoom,
      section,
      inspHayFotos: inspStatus.hayFotos,
      inspPuedeRenombrar: inspStatus.puedeRenombrar,
      inspOcupado: inspStatus.ocupado,
    },
    {
      addFiles,
      addFolder,
      toggleWatch: handleToggleFolderWatch,
      exportZip: handleExportAllZip,
      exit: () => window.close(),
      focusSearch,
      toggleReviewOnly: () => setFilters((f) => ({ ...f, type: f.type === 'revision' ? 'all' : 'revision' })),
      showAll: () => setFilters({ query: '', type: 'all', company: 'all' }),
      openOrigin: () => void openFolderFromMenu(folderConfig.originPath),
      openDestination: () => void openFolderFromMenu(folderConfig.destinationPath),
      openFolders: openSettings,
      setZoom: setTextZoom,
      setTheme,
      openSettings,
      openHelp,
      openWhatsNew: showWhatsNew,
      openAbout: () => setIsAboutOpen(true),
      insp: {
        leer: () => inspRef.current?.leer(),
        agregarFotos: () => inspRef.current?.agregarFotos(),
        agregarCarpeta: () => inspRef.current?.agregarCarpeta(),
        renombrar: () => inspRef.current?.renombrar(),
        nuevo: () => inspRef.current?.nuevo(),
        verMuestras: () => inspRef.current?.verMuestras(),
        abrirSalida: () => inspRef.current?.abrirSalida(),
      },
    }
  );

  // Atajos de toda la ventana. Siempre llaman a lo último (la función de cada render), no a la del primer render.
  const shortcutsRef = useRef({ addFiles, addFolder, focusSearch, openSettings, openHelp, exportZip: handleExportAllZip, blocked: anyModalOpen, helpOpen: isHelpOpen });
  shortcutsRef.current = { addFiles, addFolder, focusSearch, openSettings, openHelp, exportZip: handleExportAllZip, blocked: anyModalOpen, helpOpen: isHelpOpen };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutsRef.current;
      const run = (action: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        action();
      };
      if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (!s.helpOpen) run(s.openHelp);
        return;
      }
      if (s.blocked || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (sectionRef.current === 'inspecciones') {
        const i = inspRef.current;
        if (key === 'o') return run(() => (e.shiftKey ? i?.agregarCarpeta() : i?.agregarFotos()));
        if (key === 'l' && !e.shiftKey) return run(() => i?.leer());
        if (key === 'n' && !e.shiftKey) return run(() => i?.nuevo());
        if (e.key === 'Enter') return run(() => i?.renombrar());
      }
      if (key === 'o') run(e.shiftKey ? s.addFolder : s.addFiles);
      else if (key === 'f' && !e.shiftKey) run(s.focusSearch);
      else if (key === ',' && !e.shiftKey) run(s.openSettings);
      else if (key === 'e' && e.shiftKey) run(s.exportZip);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Clic derecho en un lugar vacío de la ventana (norma 11). Filas, campos de texto, carpetas y cuadros ya
  // tienen el suyo y lo atienden antes.
  const handleRootContextMenu = (e: React.MouseEvent) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, .fixed')) return;
    e.preventDefault();
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items:
        section === 'inspecciones'
          ? buildInspEmptyMenu(
              { ocupado: inspStatus.ocupado, puedeRenombrar: inspStatus.puedeRenombrar, hayFotos: inspStatus.hayFotos, canOpen: isElectron() },
              {
                leer: () => inspRef.current?.leer(),
                agregar: () => inspRef.current?.agregarFotos(),
                agregarCarpeta: () => inspRef.current?.agregarCarpeta(),
                renombrar: () => inspRef.current?.renombrar(),
                nuevo: () => inspRef.current?.nuevo(),
                muestras: () => inspRef.current?.verMuestras(),
                abrirSalida: () => inspRef.current?.abrirSalida(),
              }
            )
          : buildEmptySpaceMenu(
              { hasPolicies: policies.length > 0 },
              { addFiles, exportZip: handleExportAllZip, openSettings, openHelp }
            ),
    });
  };

  const getTextZoomClass = () => {
    if (textZoom === 'large') return 'text-[105%]';
    if (textZoom === 'xlarge') return 'text-[112%]';
    return '';
  };

  return (
    <div
      id="polizamaster-app-root"
      onContextMenu={handleRootContextMenu}
      className={`h-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200 ${getTextZoomClass()}`}
    >
      {/* 1. Marca, barra de menús, tema y tamaño de letra (fijo) */}
      <Header
        menus={menuBar}
        theme={theme}
        onThemeChange={setTheme}
        textZoom={textZoom}
        onTextZoomChange={setTextZoom}
        onExportAllZip={handleExportAllZip}
        totalPolicies={section === 'polizas' ? policies.length : 0}
      />

      {/* 1b. Dos botones: Pólizas | Inspecciones (fijo) */}
      <Solapas seccion={section} onChange={setSection} />

      {/* Pólizas: todo lo de siempre (queda montado aunque se vea Inspecciones, así no se pierde la tabla ni el avance) */}
      <div className={section === 'polizas' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
      {/* 2. Carpetas de Origen y Destino y escaneo automático (fijo) */}
      <FolderStatusBar
        folderConfig={folderConfig}
        onOpenConfig={openSettings}
        processedCount={policies.filter((p) => p.status === 'Completado').length}
        pendingCount={policies.filter((p) => p.status === 'Revisión Requerida').length}
        onScanAndProcessFolder={handleToggleFolderWatch}
        isScanning={isProcessing}
        isWatching={isWatchingFolder}
        onNotify={addToast}
      />

      {/* 3. Zona de trabajo: arrastrar PDF, totales y la tabla, que ocupa el alto que queda y se desplaza por dentro */}
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 px-4 py-2">
        <DropzoneUploader
          ref={dropzoneRef}
          onFilesSelected={handleFilesSelected}
          isProcessing={isProcessing}
          processingProgress={processingProgress}
          isStopping={isStopping}
          onStop={handleStopProcessing}
          busyLabel={busyLabel}
          watchReading={watchReading}
        />

        <StatsCards
          policies={policies}
          activeFilter={filters.type}
          onFilterClick={(type) => setFilters((f) => ({ ...f, type }))}
        />

        <HistoryTable
          policies={policies}
          filters={filters}
          onFiltersChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onOpenDetailSheet={(policy) => setDetailPolicy(policy)}
          onOpenEditModal={(policy) => setReviewPolicy(policy)}
          onPreviewDocument={(policy) => setPreviewPolicy(policy)}
          onDeletePolicy={handleDeletePolicy}
          onCopyPolicyNumber={handleCopyPolicyNumber}
          onDownloadSingle={handleDownloadSingle}
          onShowInFolder={handleShowInFolder}
          onBatchDelete={handleBatchDelete}
          onNotify={addToast}
        />
      </main>
      </div>

      {/* Inspecciones: fotos de vehículos, un vehículo a la vez */}
      <div className={section === 'inspecciones' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
        <InspeccionesView
          ref={inspRef}
          activa={section === 'inspecciones'}
          originPath={folderConfig.originPath || 'C:\\Seguros\\Entrada_PDFs'}
          config={inspConfig}
          onNotify={addToast}
          onOpenSettings={openSettings}
          onStatus={setInspStatus}
        />
      </div>

      {/* 4. Pie (fijo) */}
      <footer className="shrink-0 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800/80 py-1.5 px-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">PólizaMaster Desktop</span>
            <span>•</span>
            <span>
              Formato activo:{' '}
              <code className="font-mono text-blue-600 dark:text-blue-400">{section === 'polizas' ? 'PZA-000000000-00[-Tipo].pdf' : 'PATENTE-TOMA.jpg'}</code>
            </span>
          </div>
          {section === 'polizas' ? (
            <div className="flex items-center gap-4 text-[11px]">
              <span>Historial: últimos {settings.historyDays} {settings.historyDays === 1 ? 'día' : 'días'}</span>
              <span>
                Total cargados: <strong className="text-slate-800 dark:text-white">{policies.length}</strong>
              </span>
              <span>
                Atajos: <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border font-mono">Doble Clic</kbd> Ver Ficha
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-4 text-[11px]">
              <span>{inspStatus.pie}</span>
              <span>
                Atajos: <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border font-mono">Doble Clic</kbd> Ver foto
              </span>
            </div>
          )}
        </div>
      </footer>

      {/* Modals & Dialogs */}
      <SettingsModal
        isOpen={isFolderConfigOpen}
        onClose={() => setIsFolderConfigOpen(false)}
        folderConfig={folderConfig}
        settings={settings}
        onSave={handleSaveSettings}
        inspConfig={inspConfig}
        onSaveInsp={handleSaveInsp}
        initialTab={settingsTab}
        countExpiring={(days) => splitByRetention(policies, Date.now(), days).expired.length}
      />

      <HelpModal isOpen={isHelpOpen} version={APP_VERSION} onClose={() => setIsHelpOpen(false)} />

      <AboutModal
        isOpen={isAboutOpen}
        version={APP_VERSION}
        onClose={() => setIsAboutOpen(false)}
        onShowWhatsNew={showWhatsNew}
      />

      <ManualReviewModal
        isOpen={Boolean(reviewPolicy)}
        onClose={() => setReviewPolicy(null)}
        policy={reviewPolicy}
        onSave={handleSaveManualReview}
      />

      <PolicyInfoSheetModal
        isOpen={Boolean(detailPolicy)}
        onClose={() => setDetailPolicy(null)}
        policy={detailPolicy}
        onEdit={(policy) => {
          setDetailPolicy(null);
          setReviewPolicy(policy);
        }}
        onCopyPolicy={handleCopyPolicyNumber}
        onDownloadFile={handleDownloadSingle}
        onPreview={(policy) => {
          setDetailPolicy(null);
          setPreviewPolicy(policy);
        }}
        onShowInFolder={handleShowInFolder}
      />

      <DocumentPreviewModal
        isOpen={Boolean(previewPolicy)}
        onClose={() => setPreviewPolicy(null)}
        policy={previewPolicy}
      />

      {/* Floating Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <WhatsNewModal
        isOpen={Boolean(appUpdateNotice)}
        version={appUpdateNotice?.version || ''}
        notes={appUpdateNotice?.notes || []}
        onClose={() => setAppUpdateNotice(null)}
      />
    </div>
  );
}

export default App;
