import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileEdit,
  X,
  Check,
  Building2,
  User,
  Hash,
  Layers,
  FileText,
  AlertCircle,
  ExternalLink,
  FileWarning,
} from 'lucide-react';
import { ExtractedPolicyData, DocumentType } from '../types';
import { usePolicyFile } from '../utils/policyFiles';
import { generateStandardFileName, formatPolicyNumber, formatEndorsementNumber, validateFileName } from '../utils/naming';

interface ManualReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: ExtractedPolicyData | null;
  onSave: (updated: ExtractedPolicyData) => void;
}

const COMMON_COMPANIES = [
  'Federación Patronal',
  'San Cristóbal',
  'La Segunda',
  'Allianz',
  'Sancor Seguros',
  'Zurich',
  'Mapfre',
  'Rivadavia',
  'Mercantil Andina',
  'Berkley',
  'Río Uruguay Seguros',
  'SMG Seguros',
  'Provincia Seguros',
];

const COMMON_BRANCHES = [
  'Automotor',
  'Combinado Familiar',
  'Integral de Comercio',
  'Vida Colectivo',
  'Accidentes Personales',
  'Caución',
  'Responsabilidad Civil',
  'Motovehículos',
  'Transporte',
];

interface ManualReviewModalContentProps {
  policy: ExtractedPolicyData;
  onClose: () => void;
  onSave: (updated: ExtractedPolicyData) => void;
}

// Split out from ManualReviewModal so it only mounts while the modal is open
// with a policy loaded. Every hook below now runs unconditionally for this
// component's whole lifetime (no more conditional-hooks crash risk), and
// <AnimatePresence> in the wrapper below can finally play the exit animation
// instead of the modal vanishing instantly. Remounting per `policy.id` (see
// the `key` in the wrapper) also means fields always start fresh from the
// current policy — no manual resync effect needed.
const ManualReviewModalContent: React.FC<ManualReviewModalContentProps> = ({
  policy,
  onClose,
  onSave,
}) => {
  const { url: fileUrl, loading: fileLoading } = usePolicyFile(policy);
  const [compania, setCompania] = useState(policy.compania || '');
  const [asegurado, setAsegurado] = useState(policy.asegurado || '');
  const [numeroPoliza, setNumeroPoliza] = useState(policy.numeroPoliza || '');
  const [numeroEndoso, setNumeroEndoso] = useState(policy.numeroEndoso || '00');
  const [tipoDocumento, setTipoDocumento] = useState<DocumentType>(policy.tipoDocumento || 'Póliza');
  const [rubro, setRubro] = useState(policy.rubro || 'Automotor');
  const [vigenciaDesde, setVigenciaDesde] = useState(policy.vigenciaDesde || '');
  const [vigenciaHasta, setVigenciaHasta] = useState(policy.vigenciaHasta || '');
  const [observaciones, setObservaciones] = useState(policy.observaciones || '');

  // Filename override options
  const [isManualOverride, setIsManualOverride] = useState(policy.isCustomRenamed || false);
  const [customFinalName, setCustomFinalName] = useState(policy.finalFileName || '');

  // Auto-calculated standard name
  const calculatedStandardName = generateStandardFileName(
    numeroPoliza,
    numeroEndoso,
    tipoDocumento
  );

  const activeFinalName = isManualOverride ? customFinalName : calculatedStandardName;
  const validation = validateFileName(activeFinalName);

  const handlePadPolicyNumber = () => {
    setNumeroPoliza(formatPolicyNumber(numeroPoliza));
  };

  const handleFormatEndorsement = () => {
    setNumeroEndoso(formatEndorsementNumber(numeroEndoso));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const paddedPolicy = formatPolicyNumber(numeroPoliza);
    const paddedEndorsement = formatEndorsementNumber(numeroEndoso);
    const standardName = generateStandardFileName(paddedPolicy, paddedEndorsement, tipoDocumento);
    const finalName = isManualOverride && customFinalName.trim() ? customFinalName.trim() : standardName;

    const updated: ExtractedPolicyData = {
      ...policy,
      compania: compania.trim(),
      asegurado: asegurado.trim().toUpperCase(),
      numeroPoliza: numeroPoliza.trim(),
      numeroPolizaPadded: paddedPolicy,
      numeroEndoso: paddedEndorsement,
      tipoDocumento,
      rubro: rubro.trim(),
      vigenciaDesde: vigenciaDesde.trim(),
      vigenciaHasta: vigenciaHasta.trim(),
      observaciones: observaciones.trim() || 'Verificado y aprobado manualmente.',
      confianza: 'Alta',
      suggestedFileName: standardName,
      finalFileName: finalName,
      isCustomRenamed: isManualOverride,
      status: 'Completado',
      destinationPath: `C:\\Seguros\\Renombrados\\${finalName}`,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div
      id="manual-review-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-6xl w-full my-8 overflow-hidden flex flex-col lg:h-[88vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Sector de Revisión Manual & Edición de Datos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                Archivo original: <span className="font-mono">{policy.originalFileName}</span>
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

        {/* Split body: source PDF on one side, editable fields on the other
            — so the document that landed in "Revisión" can actually be
            looked at while correcting what the extractor got wrong. Stacks
            vertically on small screens, side-by-side from lg: up. */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* PDF Preview Panel */}
          <div className="lg:w-[42%] shrink-0 bg-slate-200 dark:bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col h-[45vh] lg:h-auto">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Documento Original
              </span>
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title="Abrir en una pestaña nueva"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {fileLoading ? (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  Cargando el PDF…
                </div>
              ) : fileUrl ? (
                <iframe
                  title={`Vista previa de ${policy.originalFileName}`}
                  src={fileUrl}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                  <FileWarning className="w-7 h-7 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Sin PDF disponible para previsualizar
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Editable Fields Panel */}
          <form onSubmit={handleSave} className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5">
          {/* Document Type Selector (Top Priority) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              📄 Clase / Tipo de Documento:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {(['Póliza', 'Endoso', 'Tarjeta de RC', 'Cuponera', 'Cobertura'] as DocumentType[]).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setTipoDocumento(type)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-semibold border flex flex-col items-center justify-center gap-1 transition-all ${
                    tipoDocumento === type
                      ? type === 'Cobertura'
                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs shadow-cyan-500/20'
                        : 'bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{type}</span>
                  <span className="text-[10px] font-normal opacity-80">
                    {type === 'Póliza' || type === 'Endoso'
                      ? 'Sin sufijo tipo'
                      : `-${type.toUpperCase()}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Insured Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-blue-500" />
                <span>Nombre del Asegurado / Tomador</span>
              </label>
              <input
                type="text"
                value={asegurado}
                onChange={(e) => setAsegurado(e.target.value)}
                placeholder="Ej: PEREZ JUAN CARLOS"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 uppercase"
                required
              />
            </div>

            {/* Insurance Company */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Compañía de Seguros</span>
              </label>
              <input
                type="text"
                list="insurance-companies-list"
                value={compania}
                onChange={(e) => setCompania(e.target.value)}
                placeholder="Ej: Federación Patronal, San Cristóbal..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
              />
              <datalist id="insurance-companies-list">
                {COMMON_COMPANIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Policy Number */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-emerald-500" />
                  <span>N° de Póliza</span>
                </label>
                <button
                  type="button"
                  onClick={handlePadPolicyNumber}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                  title="Rellenar con ceros a la izquierda a 9 dígitos"
                >
                  Rellenar 9 dígitos
                </button>
              </div>
              <input
                type="text"
                value={numeroPoliza}
                onChange={(e) => setNumeroPoliza(e.target.value)}
                placeholder="Ej: 849201"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                9 dígitos: {formatPolicyNumber(numeroPoliza)}
              </p>
            </div>

            {/* Endorsement Number */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>N° Endoso (00 si no aplica)</span>
                </label>
                <button
                  type="button"
                  onClick={handleFormatEndorsement}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                  title="Formatear a 2 dígitos"
                >
                  Formatear 00
                </button>
              </div>
              <input
                type="text"
                value={numeroEndoso}
                onChange={(e) => setNumeroEndoso(e.target.value)}
                placeholder="00"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                2 dígitos: {formatEndorsementNumber(numeroEndoso)}
              </p>
            </div>

            {/* Branch / Section */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-purple-500" />
                <span>Rubro o Sección</span>
              </label>
              <input
                type="text"
                list="insurance-branches-list"
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                placeholder="Automotor, Vida..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="insurance-branches-list">
                {COMMON_BRANCHES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Final Filename Editor & Preview */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Nombre Final del Archivo Renombrado:
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManualOverride(!isManualOverride);
                  if (!isManualOverride) setCustomFinalName(calculatedStandardName);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
              >
                {isManualOverride ? 'Volver a Regla Estándar' : 'Editar Nombre Libremente'}
              </button>
            </div>

            {isManualOverride ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={customFinalName}
                  onChange={(e) => setCustomFinalName(e.target.value)}
                  placeholder="PZA-000123456-00.pdf"
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Modo de edición manual activado. Se guardará con este nombre específico.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  {calculatedStandardName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Fórmula Estándar
                </span>
              </div>
            )}

            {!validation.isValid && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠️ {validation.warning}
              </p>
            )}
          </div>

          {/* Observations note */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Observaciones / Notas de Revisión
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Corregido dígito de póliza ilegible"
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Cambios & Renombrar</span>
            </button>
          </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export const ManualReviewModal: React.FC<ManualReviewModalProps> = ({ isOpen, onClose, policy, onSave }) => {
  return (
    <AnimatePresence>
      {isOpen && policy && (
        <ManualReviewModalContent key={policy.id} policy={policy} onClose={onClose} onSave={onSave} />
      )}
    </AnimatePresence>
  );
};
