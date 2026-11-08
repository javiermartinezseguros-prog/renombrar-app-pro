import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { UploadCloud, FileText, FolderUp, Loader2, Square } from 'lucide-react';
import { etaText, percent } from '../utils/progress';

export interface DropzoneHandle {
  openFiles: () => void;
  openFolder: () => void;
}

export interface ProcessingProgress {
  /** Documentos ya leídos (terminados). */
  done: number;
  total: number;
  currentFileName?: string;
  /** Cuándo empezó la tanda (ms), para calcular el tiempo que falta. */
  startedAt?: number;
}

interface DropzoneUploaderProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
  processingProgress: ProcessingProgress;
  /** Se apretó «Detener» y todavía se están terminando los que estaban en marcha. */
  isStopping?: boolean;
  onStop?: () => void;
  /** Otra tarea larga (por ejemplo armar el ZIP): una línea con ruedita. */
  busyLabel?: string | null;
  /** Archivos que el escaneo automático está leyendo ahora mismo. */
  watchReading?: string[];
}

export const DropzoneUploader = forwardRef<DropzoneHandle, DropzoneUploaderProps>(
  ({ onFilesSelected, isProcessing, processingProgress, isStopping = false, onStop, busyLabel, watchReading = [] }, ref) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      openFiles: () => fileInputRef.current?.click(),
      openFolder: () => folderInputRef.current?.click(),
    }));

    // El tiempo que falta se refresca solo mientras se trabaja.
    useEffect(() => {
      if (!isProcessing) return;
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }, [isProcessing]);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isProcessing) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const validFiles: File[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) validFiles.push(file);
        }
        if (validFiles.length > 0) onFilesSelected(validFiles);
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesSelected(Array.from(e.target.files));
        e.target.value = '';
      }
    };

    const pct = percent(processingProgress.done, processingProgress.total);
    const eta = etaText(
      processingProgress.startedAt ? now - processingProgress.startedAt : 0,
      processingProgress.done,
      processingProgress.total
    );

    return (
      <div
        id="pdf-drag-and-drop-area"
        data-help="pdf-drag-and-drop-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`shrink-0 relative rounded-xl border-2 border-dashed transition-all px-4 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
            : 'border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 hover:border-blue-400 dark:hover:border-blue-500'
        } ${isProcessing ? 'py-2.5' : 'py-1.5'}`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple onChange={handleFileInputChange} className="hidden" id="pdf-file-picker-input" />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          id="pdf-folder-picker-input"
        />

        {isProcessing ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>
                  {isStopping
                    ? 'Deteniendo… termina lo que ya está leyendo'
                    : `Leyendo documentos: ${processingProgress.done} de ${processingProgress.total} (${pct} %)`}
                </span>
              </div>
              {onStop && (
                <button
                  type="button"
                  id="btn-stop-processing"
                  data-help="btn-stop-processing"
                  onClick={onStop}
                  disabled={isStopping}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-800 text-white shadow-xs disabled:opacity-60 transition-colors"
                  title="Cortar la lectura de los PDF que faltan (lo ya leído se conserva)"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Detener</span>
                </button>
              )}
            </div>
            <div
              className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">
                Ahora: <strong className="text-slate-800 dark:text-slate-200">{processingProgress.currentFileName || '…'}</strong>
              </span>
              <span className="shrink-0">{eta}</span>
            </div>
          </div>
        ) : busyLabel ? (
          <div className="flex items-center gap-2 py-1 text-blue-600 dark:text-blue-400 font-bold text-sm" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{busyLabel}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  Arrastrá aquí tus archivos PDF de seguros o seleccioná desde tu PC
                </h3>
                {watchReading.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-semibold" role="status" aria-live="polite">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="truncate">
                      Escaneo automático leyendo {watchReading.length === 1 ? watchReading[0] : `${watchReading.length} archivos nuevos`}…
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                id="btn-select-individual-files"
                data-help="btn-select-individual-files"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-colors"
                title="Elegir uno o varios PDF (Ctrl+O)"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Seleccionar Archivos PDF</span>
              </button>
              <button
                type="button"
                id="btn-select-entire-folder"
                data-help="btn-select-entire-folder"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
                title="Seleccionar una carpeta completa para procesar en lote (Ctrl+Mayús+O)"
              >
                <FolderUp className="w-3.5 h-3.5 text-blue-500" />
                <span>Cargar Carpeta Completa</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);
DropzoneUploader.displayName = 'DropzoneUploader';
