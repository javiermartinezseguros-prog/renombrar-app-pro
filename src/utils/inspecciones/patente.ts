/**
 * Patentes argentinas: auto ABC123 (vieja) y AB123CD (Mercosur); moto 123ABC (vieja) y A123BCD (Mercosur).
 * Lo que lee el OCR confunde letras y números parecidos (S/5, O/0, I/1…): se corrige según la posición,
 * y la app siempre muestra la patente para que Javier la confirme antes de renombrar.
 */
const FORMATOS = ['LLLDDD', 'LLDDDLL', 'DDDLLL', 'LDDDLLL'] as const;

const A_LETRA: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
const A_NUMERO: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };

export const normalizarPatente = (raw: string): string => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const encaja = (p: string, formato: string): boolean =>
  p.length === formato.length && [...p].every((c, i) => (formato[i] === 'L' ? /[A-Z]/.test(c) : /[0-9]/.test(c)));

export const esPatenteValida = (p: string): boolean => FORMATOS.some((f) => encaja(p, f));

/** Más cambios que estos casi siempre es texto cualquiera (carteles, marcas de agua), no una patente mal leída. */
export const MAX_CAMBIOS = 2;

/** Arregla confusiones letra/número según el formato que menos cambios necesita. null si ningún formato sirve. */
export function corregirConfusiones(raw: string): string | null {
  const p = normalizarPatente(raw);
  let mejor: { texto: string; cambios: number } | null = null;
  for (const formato of FORMATOS) {
    if (p.length !== formato.length) continue;
    let cambios = 0;
    let texto = '';
    let sirve = true;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      const quiereLetra = formato[i] === 'L';
      if (quiereLetra ? /[A-Z]/.test(c) : /[0-9]/.test(c)) { texto += c; continue; }
      const arreglo = quiereLetra ? A_LETRA[c] : A_NUMERO[c];
      if (!arreglo) { sirve = false; break; }
      texto += arreglo;
      cambios++;
    }
    if (sirve && cambios <= MAX_CAMBIOS && (!mejor || cambios < mejor.cambios)) mejor = { texto, cambios };
  }
  return mejor ? mejor.texto : null;
}

/** Busca una patente entre los textos que el OCR leyó de una foto (probando también pares de textos seguidos). */
export function buscarPatente(textos: string[]): { patente: string; exacta: boolean } | null {
  const candidatos = new Set<string>();
  const limpios = textos.map(normalizarPatente).filter(Boolean);
  limpios.forEach((t, i) => {
    candidatos.add(t);
    if (limpios[i + 1]) candidatos.add(t + limpios[i + 1]);
  });
  let corregida: string | null = null;
  for (const c of candidatos) {
    if (esPatenteValida(c)) return { patente: c, exacta: true };
    if (!corregida) corregida = corregirConfusiones(c);
  }
  return corregida ? { patente: corregida, exacta: false } : null;
}
