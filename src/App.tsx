import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
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
import {
  ExtractedPolicyData,
  FolderConfig,
  ThemeMode,
  TextZoom,
  DocumentType,
} from './types';
import { SAMPLE_POLICIES } from './data/samplePolicies';
import { generateStandardFileName, formatPolicyNumber, formatEndorsementNumber } from './utils/naming';
import { extractPolicyData } from './utils/policyExtractor';
import { isElectron, saveFileToDestination, showInFolder, readFolderPdfs } from './utils/electronBridge';

const STORAGE_KEY_POLICIES = 'polizamaster_history_v1';
const STORAGE_KEY_FOLDERS = 'polizamaster_folder_config_v1';
const STORAGE_KEY_THEME = 'polizamaster_theme_mode_v1';
const STORAGE_KEY_ZOOM = 'polizamaster_text_zoom_v1';
const STORAGE_KEY_API_KEY = 'polizamaster_gemini_api_key_v1';

export function App() {
  // 1. Persistence & Settings State
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
    } catch {
      return '';
    }
  });

  const [policies, setPolicies] = useState<ExtractedPolicyData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POLICIES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error loading policies from localStorage:', e);
    }
    return SAMPLE_POLICIES;
  });

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

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_POLICIES, JSON.stringify(policies));
    } catch (e) {}
  }, [policies]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folderConfig));
    } catch (e) {}
  }, [folderConfig]);

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

  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
      else localStorage.removeItem(STORAGE_KEY_API_KEY);
    } catch (e) {}
  }, [apiKey]);

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

        try {
          const base64 = await fileToBase64(file);
          const result = await extractPolicyData(file, base64, apiKey);
          const extracted = result.data || {};

          const docType = (extracted.tipoDocumento || 'Póliza') as DocumentType;
          const paddedPolicy = formatPolicyNumber(extracted.numeroPoliza || file.name);
          const paddedEndorsement = formatEndorsementNumber(extracted.numeroEndoso || '00');
          const standardName = generateStandardFileName(paddedPolicy, paddedEndorsement, docType);

          const isLowConfidence =
            extracted.confianza === 'Baja' ||
            !extracted.asegurado ||
            extracted.asegurado === 'Asegurado por Identificar';

          const newRecord: ExtractedPolicyData = {
            id: `file-${Date.now()}-${currentIndex}-${Math.random().toString(36).substring(2, 7)}`,
            originalFileName: file.name,
            fileSize: file.size,
            fileDataUrl: base64,
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
            formaPago: extracted.formaPago,
            cuotas: extracted.cuotas,
            observaciones: extracted.observaciones || `Procesado mediante ${result.source}`,
            confianza: isLowConfidence ? 'Baja' : (extracted.confianza || 'Alta'),
            suggestedFileName: standardName,
            finalFileName: standardName,
            isCustomRenamed: false,
            status: isLowConfidence ? 'Revisión Requerida' : 'Completado',
            processedAt: new Date().toLocaleString('es-AR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
            originPath: `${folderConfig.originPath}\\${file.name}`,
            destinationPath: `${folderConfig.destinationPath}\\${standardName}`,
          };

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
            } else {
              console.warn(`Could not auto-save "${standardName}" to destination folder:`, saveResult.error);
            }
          }

          results[currentIndex] = newRecord;
        } catch (err: any) {
          console.error(`Error processing file ${file.name}:`, err);
          const standardName = generateStandardFileName('000000000', '00', 'Póliza');
          results[currentIndex] = {
            id: `file-err-${Date.now()}-${currentIndex}`,
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
            processedAt: new Date().toLocaleString('es-AR'),
            originPath: `${folderConfig.originPath}\\${file.name}`,
            destinationPath: `${folderConfig.destinationPath}\\${standardName}`,
          };
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

  // Automated Scanning from Origin Folder -> Writing to Destination Folder.
  //
  // Desktop app: uses the real, already-configured folderConfig paths
  // directly via Electron IPC — no folder picker at all. Previously this
  // ALWAYS opened a browser `showDirectoryPicker()` for both folders on
  // every single run (ignoring the paths already set in "Rutas Carpetas"),
  // which could only ever recover a folder's *name* — not its real path —
  // and then overwrote folderConfig with a fabricated "C:\Seguros\{name}"
  // that pointed nowhere real. That's why this looked like it "didn't
  // auto-scan anything" and kept re-asking for folders every session, and
  // why a later manual correction could end up saved under that fake path
  // instead of the destination folder the user actually configured.
  const handleScanAndProcessFolder = async () => {
    if (isElectron()) {
      if (!folderConfig.originPath || !folderConfig.destinationPath) {
        addToast(
          'error',
          'Faltan carpetas configuradas',
          'Configurá la carpeta de Origen y de Destino en "Rutas Carpetas" antes de usar el auto-procesamiento.'
        );
        setIsFolderConfigOpen(true);
        return;
      }

      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: 0 });

      try {
        const readResult = await readFolderPdfs(folderConfig.originPath);
        if (!readResult.success || !readResult.files) {
          setIsProcessing(false);
          addToast(
            'error',
            'No se pudo leer la carpeta de origen',
            readResult.error || `Verificá que "${folderConfig.originPath}" sea una ruta válida.`
          );
          return;
        }

        if (readResult.files.length === 0) {
          setIsProcessing(false);
          addToast('info', 'Carpeta sin PDFs', `No se encontraron archivos .pdf en "${folderConfig.originPath}".`);
          return;
        }

        // Rebuild real File objects from the bytes read on disk so the rest
        // of the pipeline (processFilesConcurrent) doesn't need a separate
        // code path — it already knows how to auto-save to
        // folderConfig.destinationPath for every file it processes.
        const files = await Promise.all(
          readResult.files.map(async (f) => {
            const res = await fetch(f.dataUrl);
            const blob = await res.blob();
            return new File([blob], f.name, { type: 'application/pdf' });
          })
        );

        setProcessingProgress({ current: 0, total: files.length });
        const processedResults = await processFilesConcurrent(files, 4);

        setPolicies((prev) => [...processedResults, ...prev]);
        setIsProcessing(false);

        const savedCount = processedResults.filter((p) => p.savedToDisk).length;
        addToast(
          'success',
          '¡Carpeta Procesada!',
          savedCount === processedResults.length
            ? `Se procesaron y guardaron ${savedCount} documento(s) desde "${folderConfig.originPath}" en "${folderConfig.destinationPath}".`
            : `Se procesaron ${processedResults.length} documento(s); ${savedCount} se guardaron en la carpeta de destino y el resto quedó disponible para descargar manualmente.`
        );
      } catch (e: any) {
        setIsProcessing(false);
        console.error('Error in handleScanAndProcessFolder (Electron):', e);
        addToast('error', 'Error al escanear carpeta', e.message);
      }
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

  // Load predefined sample policies
  const handleLoadSamples = () => {
    setPolicies(SAMPLE_POLICIES);
    addToast(
      'info',
      'Pólizas de Ejemplo Cargadas',
      'Se restauraron 5 ejemplos reales de Federación Patronal, San Cristóbal, La Segunda, Allianz y Sancor.'
    );
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

    if (isElectron() && folderConfig.destinationPath && verifiedPolicy.fileDataUrl) {
      const saveResult = await saveFileToDestination(
        folderConfig.destinationPath,
        verifiedPolicy.finalFileName,
        verifiedPolicy.fileDataUrl,
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

  // Delete policy from history
  const handleDeletePolicy = (id: string) => {
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    addToast('info', 'Documento Eliminado', 'Se quitó el registro del historial.');
  };

  // Batch delete
  const handleBatchDelete = (ids: string[]) => {
    setPolicies((prev) => prev.filter((p) => !ids.includes(p.id)));
    addToast('info', 'Registros Eliminados', `Se eliminaron ${ids.length} documentos.`);
  };

  // Reveal an already-saved file in the OS file explorer (desktop app only)
  const handleShowInFolder = async (policy: ExtractedPolicyData) => {
    if (!policy.destinationPath) return;
    await showInFolder(policy.destinationPath);
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
  const handleDownloadSingle = (policy: ExtractedPolicyData) => {
    try {
      if (policy.fileDataUrl) {
        // Real uploaded file
        const link = document.createElement('a');
        link.href = policy.fileDataUrl;
        link.download = policy.finalFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Generate simulated PDF/text certificate
        const content = `PÓLIZA DE SEGURO RENOMBRADA
============================================
Nombre de Archivo Final: ${policy.finalFileName}
Compañía: ${policy.compania}
Asegurado: ${policy.asegurado}
N° Póliza: ${policy.numeroPolizaPadded}
N° Endoso: ${policy.numeroEndoso}
Tipo de Documento: ${policy.tipoDocumento}
Rubro / Sección: ${policy.rubro}
Vigencia: ${policy.vigenciaDesde || 'N/D'} - ${policy.vigenciaHasta || 'N/D'}
${policy.vehiculo ? `Vehículo: ${policy.vehiculo.marca} ${policy.vehiculo.modelo} (Patente: ${policy.vehiculo.patente})` : ''}
Premio Total: ${policy.premioTotal || 'N/D'}
============================================
Generado automáticamente por PólizaMaster Desktop
`;
        const blob = new Blob([content], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = policy.finalFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      addToast('success', 'Descargando Archivo', policy.finalFileName);
    } catch (e: any) {
      addToast('error', 'Error al descargar', e.message);
    }
  };

  // Export All as ZIP organized in destination folder
  const handleExportAllZip = async () => {
    if (policies.length === 0) return;

    try {
      const zip = new JSZip();
      const folderName = 'Polizas_Renombradas_Export';
      const rootFolder = zip.folder(folderName) || zip;

      for (const policy of policies) {
        const fileContent = policy.fileDataUrl
          ? policy.fileDataUrl.split(',')[1] || ''
          : `PÓLIZA DE SEGURO\nCompañía: ${policy.compania}\nAsegurado: ${policy.asegurado}\nPóliza: ${policy.numeroPolizaPadded}\nEndoso: ${policy.numeroEndoso}\nTipo: ${policy.tipoDocumento}\nArchivo: ${policy.finalFileName}`;

        if (folderConfig.createSubfoldersByCompany && policy.compania) {
          const compFolder = rootFolder.folder(policy.compania.replace(/[/\\?%*:|"<>]/g, '_')) || rootFolder;
          if (policy.fileDataUrl) {
            compFolder.file(policy.finalFileName, fileContent, { base64: true });
          } else {
            compFolder.file(policy.finalFileName, fileContent);
          }
        } else {
          if (policy.fileDataUrl) {
            rootFolder.file(policy.finalFileName, fileContent, { base64: true });
          } else {
            rootFolder.file(policy.finalFileName, fileContent);
          }
        }
      }

      // Add a summary manifest CSV
      const csvHeader = 'Nombre Original,Nombre Renombrado,Compania,Asegurado,Numero Poliza,Numero Endoso,Tipo Documento,Rubro\n';
      const csvRows = policies
        .map(
          (p) =>
            `"${p.originalFileName}","${p.finalFileName}","${p.compania}","${p.asegurado}","${p.numeroPolizaPadded}","${p.numeroEndoso}","${p.tipoDocumento}","${p.rubro}"`
        )
        .join('\n');

      rootFolder.file('indice_polizas_renombradas.csv', '\uFEFF' + csvHeader + csvRows);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
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
        `Se descargaron ${policies.length} archivos con el formato oficial.`
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
        onLoadSamples={handleLoadSamples}
        totalPolicies={policies.length}
        hasApiKey={Boolean(apiKey)}
      />

      {/* 2. Permanent Folder Paths Status Bar */}
      <FolderStatusBar
        folderConfig={folderConfig}
        onOpenConfig={() => setIsFolderConfigOpen(true)}
        processedCount={policies.filter((p) => p.status === 'Completado').length}
        pendingCount={policies.filter((p) => p.status === 'Revisión Requerida').length}
        onScanAndProcessFolder={handleScanAndProcessFolder}
        isScanning={isProcessing}
      />

      {/* 3. Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* PDF Dropzone & Upload Section */}
        <DropzoneUploader
          onFilesSelected={handleFilesSelected}
          isProcessing={isProcessing}
          processingProgress={processingProgress}
          onLoadSamples={handleLoadSamples}
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
        currentApiKey={apiKey}
        onSave={(newConfig, newApiKey) => {
          setFolderConfig(newConfig);
          if (newApiKey !== undefined) {
            setApiKey(newApiKey);
          }
          addToast('success', 'Configuración Guardada', 'Se actualizaron las rutas y clave API.');
        }}
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
    </div>
  );
}

export default App;
