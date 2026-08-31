import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  X,
  Copy,
  Check,
  Edit3,
  Building2,
  User,
  Hash,
  Layers,
  Calendar,
  Car,
  CreditCard,
  Download,
  ScanSearch,
  FolderOutput,
} from 'lucide-react';
import { ExtractedPolicyData } from '../types';
import { isElectron } from '../utils/electronBridge';

interface PolicyInfoSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: ExtractedPolicyData | null;
  onEdit: (policy: ExtractedPolicyData) => void;
  onCopyPolicy: (policyNumber: string) => void;
  onDownloadFile?: (policy: ExtractedPolicyData) => void;
  onPreview?: (policy: ExtractedPolicyData) => void;
  onShowInFolder?: (policy: ExtractedPolicyData) => void;
}

type PolicyInfoSheetModalContentProps = Omit<PolicyInfoSheetModalProps, 'isOpen' | 'policy'> & {
  policy: ExtractedPolicyData;
};

// Split out from PolicyInfoSheetModal so it only mounts while the modal is
// open with a policy loaded, letting <AnimatePresence> (in the wrapper below)
// play the exit animation instead of the modal vanishing instantly.
const PolicyInfoSheetModalContent: React.FC<PolicyInfoSheetModalContentProps> = ({
  onClose,
  policy,
  onEdit,
  onCopyPolicy,
  onDownloadFile,
  onPreview,
  onShowInFolder,
}) => {
  const [copiedPolicy, setCopiedPolicy] = useState(false);
  const [copiedFileName, setCopiedFileName] = useState(false);

  const handleCopyPolicyNumber = () => {
    const textToCopy = policy.numeroPolizaPadded || policy.numeroPoliza;
    navigator.clipboard.writeText(textToCopy);
    setCopiedPolicy(true);
    onCopyPolicy(textToCopy);
    setTimeout(() => setCopiedPolicy(false), 2000);
  };

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(policy.finalFileName);
    setCopiedFileName(true);
    setTimeout(() => setCopiedFileName(false), 2000);
  };

  const getDocTypeColor = (type: string) => {
    switch (type) {
      case 'Tarjeta de RC':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Cuponera':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Cobertura':
        return 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
      case 'Endoso':
        return 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Póliza':
      default:
        return 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div
      id="policy-info-sheet-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full my-8 overflow-hidden"
      >
        {/* Certificate Style Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getDocTypeColor(policy.tipoDocumento)}`}>
                  {policy.tipoDocumento}
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  {policy.rubro || 'Seguro General'}
                </span>
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-white mt-1">
                {policy.compania || 'Aseguradora'}
              </h2>
              <p className="text-sm text-indigo-200 font-medium tracking-wide">
                Asegurado: <span className="text-white font-bold">{policy.asegurado}</span>
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar Ficha"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Large Policy Number Box with One-Click Copy */}
          <div className="mt-5 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-300 font-medium block">
                Número de Póliza Oficial (Click para copiar)
              </span>
              <button
                id="btn-copy-policy-modal"
                onClick={handleCopyPolicyNumber}
                className="group flex items-center gap-2 text-2xl font-mono font-black text-emerald-300 hover:text-emerald-200 transition-colors text-left"
                title="Haz clic para copiar el número de póliza al portapapeles"
              >
                <span>{policy.numeroPolizaPadded || policy.numeroPoliza}</span>
                {copiedPolicy ? (
                  <Check className="w-5 h-5 text-emerald-400 animate-bounce" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                )}
                {copiedPolicy && (
                  <span className="text-xs font-sans font-semibold text-emerald-400 ml-1">
                    ¡Copiado!
                  </span>
                )}
              </button>
            </div>

            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-slate-300 font-medium block">
                N° de Endoso
              </span>
              <span className="text-xl font-mono font-bold text-white">
                {policy.numeroEndoso || '00'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Body - Grid of Extracted Data */}
        <div className="p-6 space-y-6">
          {/* Section 1: Standard Renaming Result */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                Nombre del Archivo Renombrado:
              </span>
              <button
                onClick={handleCopyFileName}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
              >
                {copiedFileName ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFileName ? '¡Nombre Copiado!' : 'Copiar Nombre'}</span>
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs text-blue-700 dark:text-blue-300 break-all">
              {policy.finalFileName}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span>Original: <span className="font-mono">{policy.originalFileName}</span></span>
              <span>Procesado: {policy.processedAt}</span>
            </div>
          </div>

          {/* Section 2: Detailed Extracted Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Field: Compania */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                Compañía Aseguradora
              </span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {policy.compania}
              </p>
            </div>

            {/* Field: Asegurado */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                Asegurado / Titular
              </span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {policy.asegurado}
              </p>
            </div>

            {/* Field: Vigencia */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-purple-500" />
                Período de Vigencia
              </span>
              <p className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                {policy.vigenciaDesde || 'N/D'} hasta {policy.vigenciaHasta || 'N/D'}
              </p>
            </div>

            {/* Field: Pago / Premio */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                Premio y Forma de Pago
              </span>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {policy.premioTotal || 'Cuota mensual'} {policy.formaPago ? `(${policy.formaPago})` : ''}
              </p>
            </div>
          </div>

          {/* Vehicle Info (If Automotor) */}
          {policy.vehiculo && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-blue-500" />
                Datos de la Unidad Asegurada (Automotor / Motovehículo)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Marca / Modelo:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {policy.vehiculo.marca} {policy.vehiculo.modelo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Dominio / Patente:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    {policy.vehiculo.patente || 'N/D'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Año:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {policy.vehiculo.anio || 'N/D'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">N° Motor / Chasis:</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {policy.vehiculo.motor || policy.vehiculo.chasis || 'Registrado'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Observations & Confidence */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Confianza de Lectura:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                  policy.confianza === 'Alta'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                }`}
              >
                {policy.confianza || 'Alta'}
              </span>
            </div>

            {policy.observaciones && (
              <p className="text-slate-500 dark:text-slate-400 italic text-[11px] max-w-md truncate">
                {policy.observaciones}
              </p>
            )}
          </div>

          {/* Actions Bottom Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleCopyPolicyNumber}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5 text-blue-500" />
              <span>Copiar Póliza ({policy.numeroPolizaPadded})</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPreview?.(policy)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors flex items-center gap-1.5"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                <span>Previsualizar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(policy);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs shadow-amber-500/20 transition-colors flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Información / Corregir</span>
              </button>

              {isElectron() && policy.savedToDisk ? (
                <button
                  type="button"
                  onClick={() => onShowInFolder?.(policy)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shadow-emerald-500/20 transition-colors flex items-center gap-1.5"
                >
                  <FolderOutput className="w-3.5 h-3.5" />
                  <span>Mostrar en Carpeta</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownloadFile?.(policy)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const PolicyInfoSheetModal: React.FC<PolicyInfoSheetModalProps> = ({
  isOpen,
  onClose,
  policy,
  onEdit,
  onCopyPolicy,
  onDownloadFile,
  onPreview,
  onShowInFolder,
}) => {
  return (
    <AnimatePresence>
      {isOpen && policy && (
        <PolicyInfoSheetModalContent
          key={policy.id}
          onClose={onClose}
          policy={policy}
          onEdit={onEdit}
          onCopyPolicy={onCopyPolicy}
          onDownloadFile={onDownloadFile}
          onPreview={onPreview}
          onShowInFolder={onShowInFolder}
        />
      )}
    </AnimatePresence>
  );
};
