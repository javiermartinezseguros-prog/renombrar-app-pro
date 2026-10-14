import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  FolderUp,
  Loader2,
  FileCode,
} from 'lucide-react';

interface DropzoneUploaderProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
  processingProgress: {
    current: number;
    total: number;
    currentFileName?: string;
  };
}

export const DropzoneUploader: React.FC<DropzoneUploaderProps> = ({
  onFilesSelected,
  isProcessing,
  processingProgress,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles: File[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          validFiles.push(file);
        }
      }
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(filesArray);
      e.target.value = '';
    }
  };

  return (
    <div id="dropzone-uploader-section" className="space-y-3">
      {/* Formula & Rule Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/90 dark:to-indigo-950/40 p-3.5 rounded-xl border border-blue-100 dark:border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
            <FileCode className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Formato de Renombrado Activo:
            </span>
            <div className="font-mono text-[11px] sm:text-xs text-blue-700 dark:text-blue-300 font-semibold mt-0.5 flex flex-wrap items-center gap-1">
              <span className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                PZA
              </span>
              <span>-</span>
              <span className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-blue-200 dark:border-slate-700" title="Número de póliza a 9 dígitos (relleno con ceros a la izquierda)">
                {"{000123456}"}
              </span>
              <span>-</span>
              <span className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-blue-200 dark:border-slate-700" title="Número de endoso a 2 dígitos o 00">
                {"{00}"}
              </span>
              <span className="text-slate-400 dark:text-slate-500">[-{"{Tipo: Tarjeta de RC | Cuponera | Cobertura}"}]</span>
              <span>.pdf</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Drag and Drop Area */}
      <div
        id="pdf-drag-and-drop-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-3 cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 scale-[1.005]'
            : 'border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
        }`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          id="pdf-file-picker-input"
        />

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
          <div className="space-y-3 max-w-md w-full py-2">
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                Leyendo y Extrayendo Datos ({processingProgress.current} de{' '}
                {processingProgress.total})...
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${
                    processingProgress.total > 0
                      ? (processingProgress.current / processingProgress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {processingProgress.currentFileName || 'Extrayendo asegurado, póliza y compañía...'}
            </p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Arrastra aquí tus archivos PDF de seguros o selecciona desde tu PC
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Lee automáticamente Compañía, Asegurado, N° Póliza, Endoso, Rubro y reconoce
                si es <span className="font-semibold text-slate-700 dark:text-slate-300">Póliza, Endoso, Tarjeta de RC o Cuponera</span>.
              </p>
            </div>

            {/* Action Buttons */}
            <div
              className="flex flex-wrap items-center justify-center gap-2.5 pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                id="btn-select-individual-files"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Seleccionar Archivos PDF</span>
              </button>

              <button
                type="button"
                id="btn-select-entire-folder"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
                title="Seleccionar una carpeta completa para procesar en lote"
              >
                <FolderUp className="w-3.5 h-3.5 text-blue-500" />
                <span>Cargar Carpeta Completa</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
