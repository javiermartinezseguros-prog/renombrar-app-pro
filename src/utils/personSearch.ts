/**
 * Búsqueda de personas con sugerencias (norma 3 de la guía de estilo de Soter):
 * desde la 2.ª letra, sin distinguir mayúsculas ni tildes, en cualquier orden,
 * lo mejor primero. Solo datos y reglas, sin DOM (se prueba con node --test).
 */
import { ExtractedPolicyData } from '../types';

export const MIN_SUGGEST_CHARS = 2;

const stripChar = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Minúsculas y sin tildes, una letra por letra (así los índices coinciden con el texto original). */
export function foldText(s: string | undefined | null): string {
  return Array.from(String(s ?? ''))
    .map((c) => {
      const f = stripChar(c);
      return f.length === 1 ? f : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
    })
    .join('');
}

export function queryTokens(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

/** El nombre tiene todas las palabras escritas, en cualquier orden y en cualquier parte. */
export function matchesPerson(name: string | undefined, query: string): boolean {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return false;
  const folded = foldText(name);
  return tokens.every((t) => folded.includes(t));
}

/** Menor = mejor: primero los que empiezan igual, después los que tienen las palabras al comienzo de una palabra. */
export function matchRank(name: string, query: string): number {
  const folded = foldText(name);
  const tokens = queryTokens(query);
  const words = folded.split(/[^a-z0-9ñ]+/).filter(Boolean);
  let rank = folded.startsWith(foldText(query).trim()) ? 0 : 10;
  for (const t of tokens) if (!words.some((w) => w.startsWith(t))) rank += 3;
  return rank;
}

export interface PersonSuggestion {
  name: string;
  /** Cuántos documentos tiene en el historial. */
  count: number;
  /** El más reciente: de ahí salen los datos para distinguir a dos personas parecidas. */
  latest: ExtractedPolicyData;
}

const NO_NAME = ['asegurado no identificado', 'revision requerida', 'revisión requerida', 'asegurado por identificar'];

export function suggestPeople(policies: ExtractedPolicyData[], query: string, limit = Infinity): PersonSuggestion[] {
  if (foldText(query).trim().length < MIN_SUGGEST_CHARS) return [];
  const byName = new Map<string, PersonSuggestion>();
  for (const p of policies) {
    const name = (p.asegurado || '').trim();
    if (!name || NO_NAME.includes(name.toLowerCase())) continue;
    if (!matchesPerson(name, query)) continue;
    const key = foldText(name).replace(/\s+/g, ' ');
    const found = byName.get(key);
    if (!found) byName.set(key, { name, count: 1, latest: p });
    else {
      found.count++;
      if ((p.processedAtMs ?? 0) > (found.latest.processedAtMs ?? 0)) found.latest = p;
    }
  }
  return Array.from(byName.values())
    .sort((a, b) => matchRank(a.name, query) - matchRank(b.name, query) || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit);
}

/** Tramos [desde, hasta) del nombre que coinciden con lo escrito, para resaltarlos. */
export function highlightRanges(name: string, query: string): Array<[number, number]> {
  const folded = foldText(name);
  const ranges: Array<[number, number]> = [];
  for (const t of queryTokens(query)) {
    // prefiere la coincidencia al comienzo de una palabra
    let at = -1;
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + 1)) {
      if (at < 0) at = i;
      if (i === 0 || /[^a-z0-9ñ]/.test(folded[i - 1])) {
        at = i;
        break;
      }
    }
    if (at >= 0) ranges.push([at, at + t.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** "ATM Compañía de Seguros S.A." → "ATM"; "San Cristóbal Seguros" → "San Cristóbal". */
export function shortCompany(name: string | undefined): string {
  const short = String(name ?? '')
    .replace(/compañ[ií]a de seguros/gi, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(compañ[ií]a|seguros|s\.a\.?|sa)$/i.test(w))
    .join(' ');
  return short || String(name ?? '');
}

/** Texto corto que distingue a dos personas parecidas: "Póliza 005957923 · ATM". */
export function suggestionDetail(s: PersonSuggestion): string {
  const p = s.latest;
  const digits = String(p.numeroPoliza ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const number = digits ? (p.numeroPolizaPadded || p.numeroPoliza) : 'sin póliza';
  const base = `${p.tipoDocumento} ${number} · ${shortCompany(p.compania)}`;
  return s.count > 1 ? `${base} · ${s.count} documentos` : base;
}
