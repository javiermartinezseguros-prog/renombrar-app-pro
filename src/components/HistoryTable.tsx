import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Copy,
  Check,
  Edit3,
  Trash2,
  Download,
  FileText,
  AlertTriangle,
  Building2,
  User,
  Hash,
  Layers,
  ChevronRight,
  Eye,
  ScanSearch,
  FolderOutput,
  CheckSquare,
  Square,
} from 'lucide-react';
import { ExtractedPolicyData, DocumentType } from '../types';
import { isElectron } from '../utils/electronBridge';
import { openContextMenu } from '../utils/contextMenu';
import { buildMultiMenu, buildRowMenu, RowMenuActions } from '../utils/menuModel';

interface HistoryTableProps {
  policies: ExtractedPolicyData[];
  onOpenDetailSheet: (policy: ExtractedPolicyData) => void;
  onOpenEditModal: (policy: ExtractedPolicyData) => void;
  onPreviewDocument: (policy: ExtractedPolicyData) => void;
  onDeletePolicy: (id: string) => void;
  onCopyPolicyNumber: (policyNumber: string) => void;
  onDownloadSingle: (policy: ExtractedPolicyData) => void;
  onShowInFolder: (policy: ExtractedPolicyData) => void;
  onBatchDelete?: (ids: string[]) => void;
  /** Avisos (toasts) para las acciones del menú del clic derecho, como copiar. */
  onNotify?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  policies,
  onOpenDetailSheet,
  onOpenEditModal,
  onPreviewDocument,
  onDeletePolicy,
  onCopyPolicyNumber,
  onDownloadSingle,
  onShowInFolder,
  onBatchDelete,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  // Fila a la que apunta el menú del clic derecho mientras está abierto
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Unique companies for filter
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    policies.forEach((p) => {
      if (p.compania) set.add(p.compania);
    });
    return Array.from(set).sort();
  }, [policies]);

  // Filtered policies
  const filteredPolicies = useMemo(() => {
    return policies.filter((item) => {
      // Type Filter
      if (selectedTypeFilter !== 'all') {
        if (selectedTypeFilter === 'revision') {
          if (item.status !== 'Revisión Requerida' && item.confianza !== 'Baja') {
            return false;
          }
        } else if (item.tipoDocumento !== selectedTypeFilter) {
          return false;
        }
      }

      // Company Filter
      if (selectedCompanyFilter !== 'all' && item.compania !== selectedCompanyFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.asegurado?.toLowerCase().includes(q);
        const matchPolicy = item.numeroPoliza?.toLowerCase().includes(q) || item.numeroPolizaPadded?.includes(q);
        const matchCompany = item.compania?.toLowerCase().includes(q);
        const matchBranch = item.rubro?.toLowerCase().includes(q);
        const matchOrig = item.originalFileName?.toLowerCase().includes(q);
        const matchFinal = item.finalFileName?.toLowerCase().includes(q);
        const matchVehicle = item.vehiculo?.patente?.toLowerCase().includes(q);

        return matchName || matchPolicy || matchCompany || matchBranch || matchOrig || matchFinal || matchVehicle;
      }

      return true;
    });
  }, [policies, searchQuery, selectedTypeFilter, selectedCompanyFilter]);

  const copyPolicyNumber = (policy: ExtractedPolicyData) => {
    const textToCopy = policy.numeroPolizaPadded || policy.numeroPoliza;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(policy.id);
    onCopyPolicyNumber(textToCopy);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopy = (e: React.MouseEvent, policy: ExtractedPolicyData) => {
    e.stopPropagation();
    copyPolicyNumber(policy);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredPolicies.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPolicies.map((p) => p.id));
    }
  };

  // ---------- menú del clic derecho (ESTILO_MENUS.md) ----------
  const copyText = (text: string, what: string) => {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {}
    onNotify?.('success', 'Copiado', `Se copió ${what} al portapapeles.`);
  };

  const rowMenuActions = (item: ExtractedPolicyData): RowMenuActions => ({
    openDetail: () => onOpenDetailSheet(item),
    preview: () => onPreviewDocument(item),
    edit: () => onOpenEditModal(item),
    copyPolicyNumber: () => copyPolicyNumber(item),
    copy: copyText,
    showInFolder: () => onShowInFolder(item),
    download: () => onDownloadSingle(item),
    toggleSelect: () =>
      setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])),
    selectAll: () => setSelectedIds(filteredPolicies.map((p) => p.id)),
    filterByCompany: () => {
      setSelectedCompanyFilter(item.compania);
      onNotify?.('info', 'Filtrado por compañía', `Se muestran solo los documentos de ${item.compania}.`);
    },
    remove: () => onDeletePolicy(item.id),
  });

  const removeSelected = () => {
    if (!onBatchDelete) return;
    onBatchDelete(selectedIds);
    setSelectedIds([]);
  };

  const openRowMenu = (item: ExtractedPolicyData, x: number, y: number, anchor?: HTMLElement) => {
    const selectedMany = selectedIds.length > 1 && selectedIds.includes(item.id);
    const items = selectedMany
      ? buildMultiMenu(
          policies.filter((p) => selectedIds.includes(p.id)),
          {
            copy: copyText,
            clearSelection: () => setSelectedIds([]),
            selectAll: () => setSelectedIds(filteredPolicies.map((p) => p.id)),
            removeSelected,
          }
        )
      : buildRowMenu(
          item,
          { canShowInFolder: isElectron() && Boolean(item.savedToDisk), selected: selectedIds.includes(item.id) },
          rowMenuActions(item)
        );
    // Primero abre (si había otro menú, su onClose corre acá adentro) y recién después marca la fila.
    openContextMenu({
      x,
      y,
      items,
      anchor,
      onClose: () => setMenuRowId((current) => (current === item.id ? null : current)),
    });
    setMenuRowId(item.id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, item: ExtractedPolicyData) => {
    const row = e.currentTarget;
    // Tecla de menú o Shift+F10: sale el menú de la fila aunque el foco esté en uno de sus botones.
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      openRowMenu(item, 0, 0, row);
      return;
    }
    // El resto de las teclas son de la fila solo si el foco está en la fila (no en un botón de adentro).
    if (e.target !== row) return;
    const withCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const selectedMany = selectedIds.length > 1 && selectedIds.includes(item.id);
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpenDetailSheet(item);
    } else if (e.key === ' ') {
      e.preventDefault();
      onPreviewDocument(item);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (selectedMany) removeSelected();
      else onDeletePolicy(item.id);
    } else if (withCtrl && key === 'e') {
      e.preventDefault();
      onOpenEditModal(item);
    } else if (withCtrl && key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      if (selectedMany) {
        const chosen = policies.filter((p) => selectedIds.includes(p.id));
        copyText(chosen.map((p) => p.numeroPolizaPadded || p.numeroPoliza).join('\n'), `los ${chosen.length} N° de póliza`);
      } else {
        copyPolicyNumber(item);
      }
    } else if (withCtrl && key === 'a') {
      e.preventDefault();
      setSelectedIds(filteredPolicies.map((p) => p.id));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getDocTypeBadge = (type: DocumentType) => {
    switch (type) {
      case 'Tarjeta de RC':
        return 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Cuponera':
        return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Cobertura':
        return 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
      case 'Endoso':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Póliza':
      default:
        return 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div id="history-section" className="space-y-4">
      {/* Top Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              id="search-policies-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por asegurado, N° póliza (9 dígitos), compañía, rubro, patente o nombre..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Company Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas las Compañías ({uniqueCompanies.length})</option>
              {uniqueCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Quick Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todos ({policies.length})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('Póliza')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'Póliza'
                  ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Pólizas
            </button>
            <button
              onClick={() => setSelectedTypeFilter('Endoso')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'Endoso'
                  ? 'bg-purple-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Endosos
            </button>
            <button
              onClick={() => setSelectedTypeFilter('Tarjeta de RC')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'Tarjeta de RC'
                  ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Tarjetas de RC
            </button>
            <button
              onClick={() => setSelectedTypeFilter('Cuponera')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'Cuponera'
                  ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Cuponeras
            </button>
            <button
              onClick={() => setSelectedTypeFilter('Cobertura')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedTypeFilter === 'Cobertura'
                  ? 'bg-cyan-600 text-white shadow-2xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Coberturas
            </button>
            <button
              onClick={() => setSelectedTypeFilter('revision')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                selectedTypeFilter === 'revision'
                  ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/60'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Pendientes Revisión</span>
            </button>
          </div>

          {/* Table Hint */}
          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic hidden lg:inline">
            💡 Doble clic: ficha completa | Clic derecho: más opciones | Clic en N° Póliza: copiar
          </span>
        </div>
      </div>

      {/* Selected Batch Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/60 p-2.5 px-4 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
          <span>{selectedIds.length} elementos seleccionados</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onBatchDelete) {
                  onBatchDelete(selectedIds);
                  setSelectedIds([]);
                }
              }}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Eliminar Seleccionados</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {filteredPolicies.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              No se encontraron pólizas ni documentos
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Arrastra archivos PDF en la zona superior o carga los ejemplos para comenzar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      onClick={handleSelectAll}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Seleccionar todos"
                    >
                      {selectedIds.length === filteredPolicies.length && filteredPolicies.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Tipo Doc</th>
                  <th className="py-3 px-3">Asegurado / Tomador</th>
                  <th className="py-3 px-3">N° Póliza (Click copiar)</th>
                  <th className="py-3 px-3">Endoso</th>
                  <th className="py-3 px-3">Compañía / Rubro</th>
                  <th className="py-3 px-3">Nombre Renombrado Final</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPolicies.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isCopied = copiedId === item.id;
                  const isReviewRequired = item.status === 'Revisión Requerida' || item.confianza === 'Baja';

                  return (
                    <tr
                      key={item.id}
                      id={`policy-row-${item.id}`}
                      onDoubleClick={() => onOpenDetailSheet(item)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openRowMenu(item, e.clientX, e.clientY);
                      }}
                      onKeyDown={(e) => handleRowKeyDown(e, item)}
                      tabIndex={0}
                      className={`group transition-colors cursor-pointer select-none sm-focusable ${
                        menuRowId === item.id ? 'sm-target ' : ''
                      }${
                        isSelected
                          ? 'bg-blue-50/60 dark:bg-blue-950/30'
                          : isReviewRequired
                          ? 'bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60 dark:hover:bg-amber-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                      title="Doble clic para ver la ficha completa del documento"
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center" onClick={(e) => handleToggleSelect(item.id, e)}>
                        <button className="p-0.5 text-slate-400 hover:text-blue-600">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Tipo Documento */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${getDocTypeBadge(
                            item.tipoDocumento
                          )}`}
                        >
                          {item.tipoDocumento}
                        </span>
                      </td>

                      {/* Asegurado */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                          {item.asegurado}
                        </div>
                        {item.vehiculo?.patente && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Pat: {item.vehiculo.patente} ({item.vehiculo.marca} {item.vehiculo.modelo})
                          </div>
                        )}
                      </td>

                      {/* N° Poliza Clickable Copy */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => handleCopy(e, item)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-900 transition-all border border-slate-200 dark:border-slate-700"
                          title="Haz clic para copiar el número de póliza al portapapeles"
                        >
                          <span>{item.numeroPolizaPadded || item.numeroPoliza}</span>
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                          )}
                        </button>
                      </td>

                      {/* Endoso */}
                      <td className="py-3.5 px-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300 font-semibold">
                        {item.numeroEndoso || '00'}
                      </td>

                      {/* Compania & Rubro */}
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.compania}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {item.rubro}
                        </div>
                      </td>

                      {/* Nombre Renombrado */}
                      <td className="py-3.5 px-3 max-w-[220px]">
                        <div
                          className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate"
                          title={item.finalFileName}
                        >
                          {item.finalFileName}
                        </div>
                        <div
                          className="text-[10px] text-slate-400 truncate"
                          title={`Original: ${item.originalFileName}`}
                        >
                          Orig: {item.originalFileName}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isReviewRequired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Revisión</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3 h-3" />
                            <span>Listo</span>
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onOpenDetailSheet(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Ver Ficha Extraída (Doble Clic)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onPreviewDocument(item)}
                            className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                            title="Previsualizar el PDF original"
                          >
                            <ScanSearch className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onOpenEditModal(item)}
                            className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                            title="Editar Datos o Renombrado Manual"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {isElectron() && item.savedToDisk ? (
                            <button
                              onClick={() => onShowInFolder(item)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                              title="Ya guardado en la carpeta de destino — mostrar en el explorador"
                            >
                              <FolderOutput className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onDownloadSingle(item)}
                              className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              title="Descargar PDF Renombrado"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onDeletePolicy(item.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Eliminar del historial"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
