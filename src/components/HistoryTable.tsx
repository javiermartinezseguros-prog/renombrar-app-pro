import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Eye,
  ScanSearch,
  FolderOutput,
  CheckSquare,
  Square,
  Link2,
} from 'lucide-react';
import { ExtractedPolicyData, DocumentType } from '../types';
import { isElectron } from '../utils/electronBridge';
import { openContextMenu } from '../utils/contextMenu';
import { buildMultiMenu, buildRowMenu, needsReview, RowMenuActions } from '../utils/menuModel';
import {
  foldText,
  highlightRanges,
  matchesPerson,
  MIN_SUGGEST_CHARS,
  suggestionDetail,
  suggestPeople,
  PersonSuggestion,
} from '../utils/personSearch';
import { FloatTip } from './FloatTip';

export interface HistoryFilters {
  query: string;
  /** 'all', un tipo de documento o 'revision'. */
  type: string;
  /** 'all' o el nombre de una compañía. */
  company: string;
}

interface HistoryTableProps {
  policies: ExtractedPolicyData[];
  filters: HistoryFilters;
  onFiltersChange: (patch: Partial<HistoryFilters>) => void;
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

const TYPE_PILLS: Array<{ type: string; label: string; on: string }> = [
  { type: 'all', label: 'Todos', on: 'bg-blue-600' },
  { type: 'Póliza', label: 'Pólizas', on: 'bg-blue-600' },
  { type: 'Endoso', label: 'Endosos', on: 'bg-purple-600' },
  { type: 'Tarjeta de RC', label: 'Tarjetas de RC', on: 'bg-amber-600' },
  { type: 'Cuponera', label: 'Cuponeras', on: 'bg-emerald-600' },
  { type: 'Cobertura', label: 'Coberturas', on: 'bg-cyan-600' },
];

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

/** El nombre con lo escrito resaltado. */
const Highlighted: React.FC<{ name: string; query: string }> = ({ name, query }) => {
  const ranges = highlightRanges(name, query);
  if (ranges.length === 0) return <>{name}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], i) => {
    if (from > at) parts.push(name.slice(at, from));
    parts.push(
      <mark key={i} className="bg-amber-200 dark:bg-amber-400/40 text-inherit rounded-sm px-0">
        {name.slice(from, to)}
      </mark>
    );
    at = to;
  });
  if (at < name.length) parts.push(name.slice(at));
  return <>{parts}</>;
};

export const HistoryTable: React.FC<HistoryTableProps> = ({
  policies,
  filters,
  onFiltersChange,
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
  const { query: searchQuery, type: selectedTypeFilter, company: selectedCompanyFilter } = filters;
  // Fila a la que apunta el menú del clic derecho mientras está abierto
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ---------- sugerencias de personas (norma 3) ----------
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState(searchQuery);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // No traba la escritura: espera ~150 ms entre letras antes de buscar.
  useEffect(() => {
    const timer = setTimeout(() => setSuggestQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Un número (póliza, celular, DNI) lo resuelve el filtro de la tabla, no las sugerencias de personas.
  const typedNumber = /^[\d\s.\-]+$/.test(searchQuery.trim());

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
    const q = foldText(searchQuery).trim();
    return policies.filter((item) => {
      if (selectedTypeFilter !== 'all') {
        if (selectedTypeFilter === 'revision') {
          if (!needsReview(item)) return false;
        } else if (item.tipoDocumento !== selectedTypeFilter) {
          return false;
        }
      }
      if (selectedCompanyFilter !== 'all' && item.compania !== selectedCompanyFilter) return false;
      if (q) {
        // el nombre se busca con todas las palabras, sin tildes y en cualquier orden; lo demás, como texto
        const has = (text?: string) => foldText(text).includes(q);
        return (
          matchesPerson(item.asegurado, searchQuery) ||
          has(item.numeroPoliza) ||
          has(item.numeroPolizaPadded) ||
          has(item.compania) ||
          has(item.rubro) ||
          has(item.originalFileName) ||
          has(item.finalFileName) ||
          has(item.vehiculo?.patente)
        );
      }
      return true;
    });
  }, [policies, searchQuery, selectedTypeFilter, selectedCompanyFilter]);

  const suggestions = useMemo<PersonSuggestion[]>(
    () => (typedNumber ? [] : suggestPeople(policies, suggestQuery, 60)),
    [policies, suggestQuery, typedNumber]
  );
  const searchReady = foldText(searchQuery).trim().length >= MIN_SUGGEST_CHARS && !typedNumber;
  const noOneFound = searchReady && suggestions.length === 0 && filteredPolicies.length === 0;
  const listOpen = searchFocused && !suggestionsHidden && searchReady && (suggestions.length > 0 || noOneFound);

  useEffect(() => {
    if (activeSuggestion < 0) return;
    (listRef.current?.querySelector(`[data-index="${activeSuggestion}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }, [activeSuggestion]);

  const chooseSuggestion = (s: PersonSuggestion) => {
    onFiltersChange({ query: s.name });
    setSuggestQuery(s.name);
    setSuggestionsHidden(true);
    setActiveSuggestion(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || suggestions.length === 0) {
      if (e.key === 'Escape' && searchQuery) {
        e.preventDefault();
        onFiltersChange({ query: '' });
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      chooseSuggestion(suggestions[Math.max(0, activeSuggestion)]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      chooseSuggestion(suggestions[0]); // Tab completa con la primera
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestionsHidden(true);
    }
  };

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
    if (selectedIds.length === filteredPolicies.length) setSelectedIds([]);
    else setSelectedIds(filteredPolicies.map((p) => p.id));
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
      onFiltersChange({ company: item.compania });
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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const pill = (active: boolean, on: string) =>
    `px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
      active ? `${on} text-white shadow-2xs font-semibold` : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`;

  const th = 'sticky top-0 z-10 py-2 px-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700';

  return (
    <div id="history-section" className="flex-1 min-h-0 flex flex-col gap-2">
      {/* Buscador y filtros (fijos: no se desplazan con la tabla) */}
      <div className="shrink-0 bg-white dark:bg-slate-900 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            id="search-policies-input"
            data-help="search-policies-input"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => {
              onFiltersChange({ query: e.target.value });
              setSuggestionsHidden(false);
              setActiveSuggestion(-1);
            }}
            onFocus={() => {
              setSearchFocused(true);
              setSuggestionsHidden(false);
            }}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar asegurado, N° póliza, compañía, patente…"
            className="field-soft w-full pl-9 pr-16 py-1.5 text-xs rounded-xl"
          />
          {searchQuery && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFiltersChange({ query: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Limpiar
            </button>
          )}

          {listOpen && (
            <div
              id="search-suggestions"
              role="listbox"
              className="absolute left-0 top-full mt-1 z-40 w-[40rem] min-w-full max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              {noOneFound ? (
                <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  No encontré a nadie con “{searchQuery.trim()}”.
                </div>
              ) : (
                <>
                  <div ref={listRef} className="max-h-[17.5rem] overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <div
                        key={s.name}
                        role="option"
                        aria-selected={i === activeSuggestion}
                        data-index={i}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          chooseSuggestion(s);
                        }}
                        onMouseEnter={() => setActiveSuggestion(i)}
                        className={`flex items-center justify-between gap-4 px-4 h-[2.125rem] cursor-pointer text-xs ${
                          i === activeSuggestion ? 'bg-blue-100 dark:bg-blue-950/60' : ''
                        }`}
                      >
                        <span className="font-bold uppercase tracking-tight text-slate-900 dark:text-white truncate">
                          <Highlighted name={s.name} query={searchQuery} />
                        </span>
                        <span className="shrink-0 text-slate-500 dark:text-slate-400 truncate max-w-[55%]">{suggestionDetail(s)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                    ↑ ↓ para recorrer · Enter para abrir · Esc para cerrar · Tab completa con la primera
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            data-help="company-filter"
            value={selectedCompanyFilter}
            onChange={(e) => onFiltersChange({ company: e.target.value })}
            className="field-soft px-2.5 py-1.5 text-xs rounded-xl"
          >
            <option value="all">Todas las Compañías ({uniqueCompanies.length})</option>
            {uniqueCompanies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div data-help="type-pills" className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          {TYPE_PILLS.map(({ type, label, on }) => (
            <button key={type} type="button" onClick={() => onFiltersChange({ type })} className={pill(selectedTypeFilter === type, on)}>
              {type === 'all' ? `${label} (${policies.length})` : label}
            </button>
          ))}
          <button
            type="button"
            data-help="review-pill"
            onClick={() => onFiltersChange({ type: 'revision' })}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
              selectedTypeFilter === 'revision'
                ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/60'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Pendientes Revisión</span>
          </button>
        </div>
      </div>

      {/* Selected Batch Bar */}
      {selectedIds.length > 0 && (
        <div className="shrink-0 bg-blue-50 dark:bg-blue-950/60 py-1.5 px-4 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
          <span>{selectedIds.length} elementos seleccionados</span>
          <button
            type="button"
            data-help="batch-delete"
            onClick={removeSelected}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Eliminar Seleccionados</span>
          </button>
        </div>
      )}

      {/* Tabla: ocupa el alto que queda y se desplaza por dentro, con los títulos fijos */}
      <div
        id="history-table-frame"
        className="flex-1 min-h-[9rem] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-auto"
      >
        {filteredPolicies.length === 0 ? (
          <div className="py-10 px-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">No se encontraron pólizas ni documentos</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Arrastrá archivos PDF a la franja de arriba, o cambiá el filtro o la búsqueda.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className={`${th} w-10 text-center`}>
                  <button
                    type="button"
                    data-help="select-all"
                    onClick={handleSelectAll}
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Seleccionar todos (Ctrl+A)"
                  >
                    {selectedIds.length === filteredPolicies.length && filteredPolicies.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className={th}>Tipo Doc</th>
                <th className={th}>Asegurado / Tomador</th>
                <th className={th} title="Clic en el número para copiarlo">N° Póliza (clic copia)</th>
                <th className={th}>Endoso</th>
                <th className={th}>Compañía / Rubro</th>
                <th className={th}>Nombre Renombrado Final</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right right-0 z-20 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredPolicies.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isCopied = copiedId === item.id;
                const isReviewRequired = needsReview(item);
                const patente = item.vehiculo?.patente;

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
                    className={`group transition-colors cursor-pointer select-none sm-focusable ${menuRowId === item.id ? 'sm-target ' : ''}${
                      isSelected
                        ? 'bg-blue-50/60 dark:bg-blue-950/30'
                        : isReviewRequired
                        ? 'bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60 dark:hover:bg-amber-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-[3px] px-2.5 text-center" onClick={(e) => handleToggleSelect(item.id, e)}>
                      <button type="button" className="p-0.5 text-slate-400 hover:text-blue-600" tabIndex={-1}>
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>

                    <td className="py-[3px] px-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0 rounded-md text-[11px] font-bold border leading-5 ${getDocTypeBadge(item.tipoDocumento)}`}>
                        {item.tipoDocumento}
                      </span>
                    </td>

                    <td
                      className="py-[3px] px-2.5 max-w-[15rem] truncate"
                      title={patente ? `${item.asegurado} — Patente ${patente} (${item.vehiculo?.marca ?? ''} ${item.vehiculo?.modelo ?? ''})` : item.asegurado}
                    >
                      <span className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">{item.asegurado}</span>
                      {patente && <span className="ml-2 text-[10px] text-slate-400 font-mono">{patente}</span>}
                    </td>

                    <td className="py-[3px] px-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        data-help="copy-policy"
                        onClick={(e) => handleCopy(e, item)}
                        className="inline-flex items-center gap-1.5 px-2 py-0 rounded-lg font-mono font-bold text-xs leading-5 bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-900 transition-all border border-slate-200 dark:border-slate-700"
                        title="Clic para copiar el número de póliza al portapapeles"
                      >
                        <span>{item.numeroPolizaPadded || item.numeroPoliza}</span>
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </td>

                    <td className="py-[3px] px-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300 font-semibold">
                      {item.numeroEndoso || '00'}
                    </td>

                    <td className="py-[3px] px-2.5 max-w-[15rem] truncate" title={`${item.compania} · ${item.rubro}`}>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.compania}</span>
                      <span className="hidden 2xl:inline ml-1.5 text-[10px] text-slate-500 dark:text-slate-400">{item.rubro}</span>
                    </td>

                    <td className="py-[3px] px-2.5 max-w-[19rem] truncate" title={`${item.finalFileName} — Original: ${item.originalFileName}`}>
                      <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">{item.finalFileName}</span>
                    </td>

                    <td className="py-[3px] px-2.5 whitespace-nowrap" data-help="state-chips">
                      {isReviewRequired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0 rounded-full text-[10px] leading-5 font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Revisión</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0 rounded-full text-[10px] leading-5 font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <Check className="w-3 h-3" />
                          <span>Listo</span>
                        </span>
                      )}
                      {item.numeroPolizaDe && (
                        <FloatTip
                          className="ml-1.5 inline-block align-middle"
                          content={
                            <>
                              <strong className="block mb-0.5">El número no se leyó de este documento.</strong>
                              Se tomó de <span className="font-mono">{item.numeroPolizaDe}</span>: mismo asegurado y misma vigencia
                              {item.vigenciaDesde && item.vigenciaHasta ? ` (${item.vigenciaDesde} – ${item.vigenciaHasta})` : ''}. Conviene verificarlo.
                            </>
                          }
                        >
                          <span
                            tabIndex={0}
                            className="inline-flex items-center gap-1 px-2 py-0 rounded-full text-[10px] leading-5 font-semibold bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 cursor-help"
                          >
                            <Link2 className="w-3 h-3" />
                            <span>Póliza de otro doc.</span>
                          </span>
                        </FloatTip>
                      )}
                    </td>

                    <td className="py-[3px] px-2.5 text-right whitespace-nowrap sticky right-0 z-[5] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]">
                      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          data-help="row-view"
                          onClick={() => onOpenDetailSheet(item)}
                          className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Ver Ficha Extraída (Doble Clic)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-help="row-preview"
                          onClick={() => onPreviewDocument(item)}
                          className="p-1 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                          title="Previsualizar el PDF original"
                        >
                          <ScanSearch className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-help="row-edit"
                          onClick={() => onOpenEditModal(item)}
                          className="p-1 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          title="Editar Datos o Renombrado Manual"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isElectron() && item.savedToDisk ? (
                          <button
                            type="button"
                            data-help="row-folder-download"
                            onClick={() => onShowInFolder(item)}
                            className="p-1 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            title="Ya guardado en la carpeta de destino — mostrar en el explorador"
                          >
                            <FolderOutput className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-help="row-folder-download"
                            onClick={() => onDownloadSingle(item)}
                            className="p-1 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                            title="Descargar PDF Renombrado"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          data-help="row-delete"
                          onClick={() => onDeletePolicy(item.id)}
                          className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Eliminar del historial (Supr)"
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
        )}
      </div>
    </div>
  );
};
