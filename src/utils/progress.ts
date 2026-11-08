/** Cálculos de la animación de avance (norma 14 de la guía de estilo): porcentaje y tiempo que falta. */

export function percent(done: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/**
 * «Faltan unos 2 minutos». Con menos de dos documentos listos todavía no hay con qué calcular
 * y dice «calculando…»; nunca promete menos de 5 segundos.
 */
export function etaText(elapsedMs: number, done: number, total: number): string {
  if (!(total > 0) || done >= total) return '';
  if (done < 2 || elapsedMs <= 0) return 'Calculando el tiempo que falta…';
  const remainingSeconds = Math.round(((elapsedMs / done) * (total - done)) / 1000);
  if (remainingSeconds < 5) return 'Faltan unos segundos';
  if (remainingSeconds < 50) return `Faltan unos ${Math.round(remainingSeconds / 5) * 5} segundos`;
  const minutes = Math.round(remainingSeconds / 60);
  if (minutes <= 1) return 'Falta cerca de un minuto';
  if (minutes < 90) return `Faltan unos ${minutes} minutos`;
  const hours = Math.round((remainingSeconds / 3600) * 2) / 2;
  return `Faltan unas ${String(hours).replace('.', ',')} horas`;
}
