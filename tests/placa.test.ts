import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarCandidatas } from '../src/utils/inspecciones/placa';

// imagen de prueba: paragolpes oscuro con una chapa clara de letras oscuras verticales
function imagenConChapa(ancho: number, alto: number, chapa: { x: number; y: number; w: number; h: number }): Uint8Array {
  const g = new Uint8Array(ancho * alto).fill(70);
  for (let y = chapa.y; y < chapa.y + chapa.h; y++) {
    for (let x = chapa.x; x < chapa.x + chapa.w; x++) {
      const col = Math.floor(((x - chapa.x) / chapa.w) * 14); // 14 franjas: 7 letras
      const dentroLetra = col % 2 === 1 && y > chapa.y + chapa.h * 0.2 && y < chapa.y + chapa.h * 0.85;
      g[y * ancho + x] = dentroLetra ? 20 : 235;
    }
  }
  return g;
}

test('buscarCandidatas: ubica una chapa (fondo claro, letras oscuras) y no se confunde con el paragolpes liso', () => {
  const chapa = { x: 180, y: 200, w: 110, h: 40 };
  const gris = imagenConChapa(500, 320, chapa);
  const [mejor] = buscarCandidatas(gris, 500, 320, null, 3);
  assert.ok(mejor, 'no encontró ninguna candidata');
  const cx = (mejor.x0 + mejor.x1) / 2;
  const cy = (mejor.y0 + mejor.y1) / 2;
  assert.ok(cx > chapa.x && cx < chapa.x + chapa.w && cy > chapa.y && cy < chapa.y + chapa.h, `el centro (${cx}, ${cy}) cae fuera de la chapa`);
  assert.equal(buscarCandidatas(new Uint8Array(500 * 320).fill(70), 500, 320, null, 3).length, 0);
});

test('buscarCandidatas: respeta la región que se le da', () => {
  const gris = imagenConChapa(500, 320, { x: 180, y: 200, w: 110, h: 40 });
  const arriba = { x0: 0, y0: 0, x1: 500, y1: 150 };
  assert.equal(buscarCandidatas(gris, 500, 320, arriba, 3).length, 0);
});

import { ladosConChapa, patenteDelVehiculo } from '../src/utils/inspecciones/placa';

test('patente del vehículo: adelante y atrás iguales la confirman, aunque cada una fuera dudosa', () => {
  const r = patenteDelVehiculo([{ lado: 'FRENTE', patente: 'AB123CD', exacta: false }, { lado: 'TRASERA', patente: 'AB123CD', exacta: false }])!;
  assert.equal(r.cruce, 'coincide');
  assert.equal(r.exacta, true);
});

test('patente del vehículo: adelante y atrás distintas se avisan y gana la leída completa', () => {
  const r = patenteDelVehiculo([{ lado: 'FRENTE', patente: 'DXA142', exacta: true }, { lado: 'TRASERA', patente: 'DXA102', exacta: false }])!;
  assert.equal(r.cruce, 'distinta');
  assert.equal(r.patente, 'DXA142');
  assert.equal(r.exacta, false);
  assert.deepEqual(r.otra, { lado: 'TRASERA', patente: 'DXA102' });
  const dos = patenteDelVehiculo([{ lado: 'FRENTE', patente: 'DXA142', exacta: true }, { lado: 'TRASERA', patente: 'DXA102', exacta: true }])!;
  assert.equal(dos.patente, 'DXA102'); // empatadas: la de atrás
  assert.equal(dos.cruce, 'distinta');
});

test('patente del vehículo: con un solo lado se usa esa lectura, y si se repite en dos fotos vale más', () => {
  assert.equal(patenteDelVehiculo([{ lado: 'TRASERA', patente: 'AB123CD', exacta: false }])!.cruce, 'un_lado');
  assert.equal(patenteDelVehiculo([{ lado: 'TRASERA', patente: 'AB123CD', exacta: false }])!.exacta, false);
  assert.equal(patenteDelVehiculo([{ lado: 'TRASERA', patente: 'AB123CD', exacta: false }, { lado: 'TRASERA', patente: 'AB123CD', exacta: false }])!.exacta, true);
  assert.equal(patenteDelVehiculo([]), null);
});

test('patente del vehículo: una foto sin toma conocida igual aporta su lectura', () => {
  const r = patenteDelVehiculo([{ lado: null, patente: 'AB123CD', exacta: true }])!;
  assert.equal(r.patente, 'AB123CD');
  assert.equal(r.lado, null);
});

test('las motos llevan la chapa solo atrás; los demás, adelante y atrás', () => {
  assert.deepEqual(ladosConChapa(true), ['TRASERA']);
  assert.deepEqual(ladosConChapa(false), ['FRENTE', 'TRASERA']);
});
