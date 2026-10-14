import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileWarning, ExternalLink, ScanSearch } from 'lucide-react';
import { ExtractedPolicyData } from '../types';
import { usePolicyFile } from '../utils/policyFiles';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: ExtractedPolicyData | null;
}

interface DocumentPreviewModalContentProps {
  policy: ExtractedPolicyData;
  onClose: () => void;
}

// Standalone full-size PDF preview — available for every document (not just
// ones flagged for review) so the user can look at the actual source page
// while deciding whether the extracted data needs correcting. Split out so
// <AnimatePresence> can play the exit animation instead of the modal
// vanishing instantly (same pattern as the other modals in this app).
const DocumentPreviewModalContent: React.FC<DocumentPreviewModalContentProps> = ({ policy, onClose }) => {
  const { url: fileUrl, loading } = usePolicyFile(policy);
  const hasFile = Boolean(fileUrl);

  return (
    <div
      id="document-preview-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 shrink-0">
              <ScanSearch className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Previsualización del Documento Original
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                {policy.originalFileName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasFile && (
              <a
                href={fileUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Abrir en una pestaña nueva"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: embedded PDF or fallback */}
        <div className="flex-1 bg-slate-200 dark:bg-slate-950 min-h-0">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Cargando el PDF…
            </div>
          ) : hasFile ? (
            <iframe title={`Vista previa de ${policy.originalFileName}`} src={fileUrl ?? undefined} className="w-full h-full border-0" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6">
              <FileWarning className="w-8 h-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No hay un archivo PDF disponible para previsualizar
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                La copia del PDF se conserva solo mientras el registro está en el historial (7 días) y no se
                guarda entre sesiones al usar la versión web. Si lo necesitás, está en la carpeta de destino.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ isOpen, onClose, policy }) => {
  return (
    <AnimatePresence>
      {isOpen && policy && <DocumentPreviewModalContent key={policy.id} policy={policy} onClose={onClose} />}
    </AnimatePresence>
  );
};
