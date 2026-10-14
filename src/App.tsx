import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FolderStatusBar } from './components/FolderStatusBar';
import { DropzoneUploader } from './components/DropzoneUploader';
import { StatsCards } from './components/StatsCards';
import { HistoryTable } from './components/HistoryTable';
import { ManualReviewModal } from './components/ManualReviewModal';
import { PolicyInfoSheetModal } from './components/PolicyInfoSheetModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { FolderConfigModal } from './components/FolderConfigModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { WhatsNewModal } from './components/WhatsNewModal';
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
  startFolderWatch,
  stopFolderWatch,
  onFolderWatchNewFile,
  onFolderWatchError,
  deleteOriginFile,
  onAppUpdated,
  FolderPdfFile,
  AppUpdatedInfo,
} from './utils/electronBridge';
import {
  HISTORY_RETENTION_DAYS,
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

const STORAGE_KEY_FOLDERS = 'polizamaster_folder_config_v1';
const STORAGE_KEY_THEME = 'polizamaster_theme_mode_v1';
const STORAGE_KEY_ZOOM = 'polizamaster_text_zoom_v1';
// Older versions kept an API key here; nothing reads it any more, so it is
// removed on launch instead of staying behind in plain text.
const LEGACY_STORAGE_KEY_API_KEY = 'polizamaster_gemini_api_key_v1';

// How often a long-running session re-checks which records have passed the
// 7-day limit (the check also runs on every launch).
const HISTORY_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function App() {
  // 1. Persistence & Settings State
  const initialHistory = useRef<LoadedHistory | null>(null);
  if (initialHistory.current === null) initialHistory.current = loadHistory(localStorage);

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

  // UI Modals State
  const [isFolderConfigOpen, setIsFolderConfigOpen] = useState(false);
  const [reviewPolicy, setReviewPolicy] = useState<ExtractedPolicyData | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<ExtractedPolicyData | null>(null);
  const [previewPolicy, setPreviewPolicy] = useState<ExtractedPolicyData | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    currentFileName?: string;
  }>({ current: 0, total: 0 });

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

  // History retention: nothing older than HISTORY_RETENTION_DAYS is kept —
  // neither the record nor the copy of its PDF. On launch: first move any
  // PDF an older version embedded in a record into its own file, delete the
  // copies of the records that expired while the app was closed, and sweep
  // any stray copy no record claims. While the app stays open: re-check
  // every hour.
  const purgeExpiredHistory = () => {
    const { expired } = splitByRetention(policiesRef.current);
    if (expired.length === 0) return;
    setPolicies((prev) => splitByRetention(prev).kept);
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
    startFolderWatch(folderConfig.originPath, folderConfig.destinationPath).then((result) => {
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
    destDirHandle?: any
  ): Promise<ExtractedPolicyData[]> => {
    const results: ExtractedPolicyData[] = [];
    let completedCount = 0;
    let index = 0;

    const worker = async () => {
      while (index < files.length) {
        const currentIndex = index++;
        const file = files[currentIndex];

        setProcessingProgress({
          current: completedCount + 1,
          total: files.length,
          currentFileName: file.name,
        });

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
        }
      }
    };

    const workerPool = Array(Math.min(concurrency, files.length))
      .fill(0)
      .map(() => worker());

    await Promise.all(workerPool);
    return results.filter(Boolean);
  };

  // Process PDF Files uploaded by user (with parallel concurrency)
  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: files.length });

    const newExtractedList = await processFilesConcurrent(files, 4);

    setPolicies((prev) => [...newExtractedList, ...prev]);
    setIsProcessing(false);

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
    try {
      const res = await fetch(file.dataUrl);
      const blob = await res.blob();
      const fileObj = new File([blob], file.name, { type: 'application/pdf' });
      const [result] = await processFilesConcurrent([fileObj], 1);
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
          'Configurá la carpeta de Origen y de Destino en "Rutas Carpetas" antes de usar el auto-procesamiento.'
        );
        setIsFolderConfigOpen(true);
        return;
      }

      const result = await startFolderWatch(folderConfig.originPath, folderConfig.destinationPath);
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

      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: pdfFiles.length });

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

  // Saves new folder settings. A watch that is already running keeps using the
  // folders it was started with, so it is restarted on the new ones — leaving
  // it on the old origin while the destination moved is how an output folder
  // ends up inside the folder being watched.
  const handleSaveFolderConfig = async (newConfig: FolderConfig) => {
    const foldersChanged =
      newConfig.originPath !== folderConfig.originPath ||
      newConfig.destinationPath !== folderConfig.destinationPath;
    setFolderConfig(newConfig);
    addToast('success', 'Configuración Guardada', 'Se actualizaron las rutas de las carpetas.');

    if (!foldersChanged || !isElectron() || !isWatchingFolder) return;
    const result = await startFolderWatch(newConfig.originPath, newConfig.destinationPath);
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
    }
  };

  const getTextZoomClass = () => {
    if (textZoom === 'large') return 'text-[105%]';
    if (textZoom === 'xlarge') return 'text-[112%]';
    return '';
  };

  return (
    <div
      id="polizamaster-app-root"
      className={`min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200 ${getTextZoomClass()}`}
    >
      {/* 1. Main App Header */}
      <Header
        theme={theme}
        onThemeChange={setTheme}
        textZoom={textZoom}
        onTextZoomChange={setTextZoom}
        onOpenFolderConfig={() => setIsFolderConfigOpen(true)}
        onExportAllZip={handleExportAllZip}
        totalPolicies={policies.length}
      />

      {/* 2. Permanent Folder Paths Status Bar */}
      <FolderStatusBar
        folderConfig={folderConfig}
        onOpenConfig={() => setIsFolderConfigOpen(true)}
        processedCount={policies.filter((p) => p.status === 'Completado').length}
        pendingCount={policies.filter((p) => p.status === 'Revisión Requerida').length}
        onScanAndProcessFolder={handleToggleFolderWatch}
        isScanning={isProcessing}
        isWatching={isWatchingFolder}
      />

      {/* 3. Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* PDF Dropzone & Upload Section */}
        <DropzoneUploader
          onFilesSelected={handleFilesSelected}
          isProcessing={isProcessing}
          processingProgress={processingProgress}
        />

        {/* Stats & Quick Filter Cards */}
        <StatsCards
          policies={policies}
          onFilterClick={(type) => {
            const searchEl = document.getElementById('search-policies-input');
            if (searchEl) searchEl.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        {/* History Table & Search Bar */}
        <HistoryTable
          policies={policies}
          onOpenDetailSheet={(policy) => setDetailPolicy(policy)}
          onOpenEditModal={(policy) => setReviewPolicy(policy)}
          onPreviewDocument={(policy) => setPreviewPolicy(policy)}
          onDeletePolicy={handleDeletePolicy}
          onCopyPolicyNumber={handleCopyPolicyNumber}
          onDownloadSingle={handleDownloadSingle}
          onShowInFolder={handleShowInFolder}
          onBatchDelete={handleBatchDelete}
        />
      </main>

      {/* 4. Desktop Status Footer */}
      <footer className="bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800/80 py-3 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">PólizaMaster Desktop</span>
            <span>•</span>
            <span>Formato activo: <code className="font-mono text-blue-600 dark:text-blue-400">PZA-000000000-00[-Tipo].pdf</code></span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Historial: últimos {HISTORY_RETENTION_DAYS} días</span>
            <span>Total cargados: <strong className="text-slate-800 dark:text-white">{policies.length}</strong></span>
            <span>Atajos: <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border font-mono">Doble Clic</kbd> Ver Ficha</span>
          </div>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      <FolderConfigModal
        isOpen={isFolderConfigOpen}
        onClose={() => setIsFolderConfigOpen(false)}
        folderConfig={folderConfig}
        onSave={handleSaveFolderConfig}
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
