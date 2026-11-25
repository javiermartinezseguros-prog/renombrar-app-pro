import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALFABETO_CHAPA, decodificarChapa, elegirLectura, interpretarLectura, POSICIONES_CHAPA } from '../src/utils/inspecciones/lectorPatente';

/** Salida del modelo inventada: para cada posición, la letra elegida con esa certeza (el resto repartido). */
function salida(texto: string, certeza: number | number[] = 0.99): Float32Array {
  const clases = ALFABETO_CHAPA.length;
  const out = new Float32Array(POSICIONES_CHAPA * clases);
  for (let p = 0; p < POSICIONES_CHAPA; p++) {
    const c = p < texto.length ? ALFABETO_CHAPA.indexOf(texto[p]) : ALFABETO_CHAPA.indexOf('_');
    const cz = Array.isArray(certeza) ? certeza[p] ?? 0.99 : certeza;
    out.fill((1 - cz) / (clases - 1), p * clases, (p + 1) * clases);
    out[p * clases + c] = cz;
  }
  return out;
}

test('lector: decodifica las posiciones y descarta las vacías', () => {
  const l = decodificarChapa(salida('MZT998', 0.97));
  assert.equal(l.texto, 'MZT998');
  assert.ok(Math.abs(l.confianza - 0.97) < 1e-6);
});

test('lector: la certeza de toda la lectura es la de su letra más dudosa', () => {
  const l = decodificarChapa(salida('AB123CD', [0.99, 0.99, 0.99, 0.5, 0.99, 0.99, 0.99]));
  assert.equal(l.texto, 'AB123CD');
  assert.ok(Math.abs(l.confianza - 0.5) < 1e-6);
});

test('lector: sin nada leído devuelve texto vacío y certeza cero', () => {
  assert.deepEqual(decodificarChapa(salida('')), { texto: '', confianza: 0 });
});

test('lector: solo se aceptan lecturas con forma de patente argentina', () => {
  assert.equal(interpretarLectura({ texto: 'NJN', confianza: 0.99 }), null); // chapa cortada
  assert.equal(interpretarLectura({ texto: 'AB111Q', confianza: 0.999 }), null);
  assert.equal(interpretarLectura({ texto: 'GEN1NNA', confianza: 0.9 }), null); // ruido
  assert.deepEqual(interpretarLectura({ texto: 'MZT998', confianza: 0.99 }), { patente: 'MZT998', exacta: true, confianza: 0.99 });
  assert.equal(interpretarLectura({ texto: 'AB123CD', confianza: 0.99 })?.exacta, true);
  assert.equal(interpretarLectura({ texto: '123ABC', confianza: 0.99 })?.exacta, true); // moto
});

test('lector: con poca certeza la patente se ofrece pero no se usa sola; con muy poca, ni se ofrece', () => {
  assert.equal(interpretarLectura({ texto: 'MZT998', confianza: 0.55 })?.exacta, false);
  assert.equal(interpretarLectura({ texto: 'MZT998', confianza: 0.2 }), null);
});

test('lector: una lectura sin forma de patente no se «arregla» cambiando letras por números', () => {
  assert.equal(interpretarLectura({ texto: 'M2T998', confianza: 0.99 }), null);
  assert.equal(interpretarLectura({ texto: 'AB111Q', confianza: 0.999 }), null); // chapa cortada: no puede volverse ABI110
});

test('lector: de varios recortes gana la lectura segura sobre muchas dudosas', () => {
  const r = elegirLectura([
    { texto: 'DXA102', confianza: 0.45 },
    { texto: 'DXA102', confianza: 0.45 },
    { texto: 'DXA142', confianza: 0.98 },
    { texto: 'ZZ', confianza: 0.99 },
  ])!;
  assert.equal(r.patente, 'DXA142');
  assert.equal(r.exacta, true);
  assert.equal(elegirLectura([{ texto: 'NJN', confianza: 0.99 }]), null);
  assert.equal(elegirLectura([]), null);
});

test('lector: si todo es dudoso se ofrece la más repetida pero no se da por segura', () => {
  const r = elegirLectura([{ texto: 'DXA102', confianza: 0.5 }, { texto: 'DXA102', confianza: 0.55 }, { texto: 'DXA142', confianza: 0.5 }])!;
  assert.equal(r.patente, 'DXA102');
  assert.equal(r.exacta, false);
});
