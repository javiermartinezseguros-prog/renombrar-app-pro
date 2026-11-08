import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOMAS, tomasDe, nombreDeArchivo, planDeCopias, faltantes } from '../src/utils/inspecciones/tomas';
import { normalizarPatente, esPatenteValida, corregirConfusiones, buscarPatente } from '../src/utils/inspecciones/patente';
import { fechaDeNombreWhatsApp, fechaExif, fechaDeLaFoto, formatoFecha } from '../src/utils/inspecciones/fecha';
import { ladosCortados, elegirVehiculo } from '../src/utils/inspecciones/encuadre';
import { DEFAULT_INSP_CONFIG, sanitizeInspConfig, loadInspConfig, saveInspConfig, INSP_PARAM_SPEC, outputFolderFor } from '../src/utils/inspecciones/config';

// ───────── tomas y nombres ─────────
test('tomas: auto y moto tienen las que pidió Javier', () => {
  const auto = tomasDe('auto').map((t) => t.archivo);
  assert.deepEqual(auto, ['FRENTE', 'TRASERA', 'CONDUCTOR', 'ACOMPAÑANTE', 'RUEDA', 'AUXILIO', 'TABLERO', 'PARABRISAS', 'GNC', 'OBLEA', 'CEDULA VERDE FRENTE', 'CEDULA VERDE DORSO']);
  const moto = tomasDe('moto').map((t) => t.archivo);
  assert.deepEqual(moto, ['FRENTE', 'TRASERA', 'CONDUCTOR', 'ACOMPAÑANTE', 'CUADRO', 'MOTOR', 'CEDULA VERDE FRENTE', 'CEDULA VERDE DORSO']);
  assert.equal(new Set(TOMAS.map((t) => t.id)).size, TOMAS.length);
});

test('nombre del archivo: PATENTE-TOMA.jpg como el ejemplo KNE353', () => {
  assert.equal(nombreDeArchivo('KNE353', 'FRENTE', 'IMG-1.jpg'), 'KNE353-FRENTE.jpg');
  assert.equal(nombreDeArchivo('kne 353', 'ACOMPANANTE', 'x.JPEG'), 'KNE353-ACOMPAÑANTE.jpg');
  assert.equal(nombreDeArchivo('KNE353', 'CEDULA_DORSO', 'a.png'), 'KNE353-CEDULA VERDE DORSO.png');
  assert.equal(nombreDeArchivo('AB123CD', 'GNC', 'sin-extension'), 'AB123CD-GNC.jpg');
});

test('nombre del archivo: no deja pasar rutas ni signos raros en la patente', () => {
  assert.equal(nombreDeArchivo('..\\..\\KNE353', 'FRENTE', 'a.jpg'), 'KNE353-FRENTE.jpg');
  assert.throws(() => nombreDeArchivo('', 'FRENTE', 'a.jpg'));
  assert.throws(() => nombreDeArchivo('///', 'FRENTE', 'a.jpg'));
});

test('plan de copias: una foto puede valer por dos tomas (AUXILIO y GNC)', () => {
  const plan = planDeCopias('KNE353', [
    { fotoId: 'f1', tomas: ['FRENTE'], nombreOriginal: 'IMG-1.jpg' },
    { fotoId: 'f2', tomas: ['AUXILIO', 'GNC'], nombreOriginal: 'IMG-2.jpg' },
    { fotoId: 'f3', tomas: [], nombreOriginal: 'IMG-3.jpg' },
  ]);
  assert.deepEqual(plan.map((p) => [p.fotoId, p.nombre]), [['f1', 'KNE353-FRENTE.jpg'], ['f2', 'KNE353-AUXILIO.jpg'], ['f2', 'KNE353-GNC.jpg']]);
});

test('plan de copias: dos fotos con la misma toma no se pisan (la segunda lleva (2))', () => {
  const plan = planDeCopias('KNE353', [
    { fotoId: 'a', tomas: ['FRENTE'], nombreOriginal: 'a.jpg' },
    { fotoId: 'b', tomas: ['FRENTE'], nombreOriginal: 'b.jpg' },
  ]);
  assert.deepEqual(plan.map((p) => p.nombre), ['KNE353-FRENTE.jpg', 'KNE353-FRENTE (2).jpg']);
});

test('faltantes: avisa las tomas obligatorias que no llegaron', () => {
  const obligatorias = ['FRENTE', 'TRASERA', 'MOTOR'] as const;
  assert.deepEqual(faltantes([...obligatorias], ['FRENTE', 'TRASERA']), ['MOTOR']);
  assert.deepEqual(faltantes([...obligatorias], ['FRENTE', 'TRASERA', 'MOTOR', 'GNC']), []);
});

// ───────── patente ─────────
test('patente: normaliza espacios, guiones y minúsculas', () => {
  assert.equal(normalizarPatente(' kne-353 '), 'KNE353');
  assert.equal(normalizarPatente('ab 123 cd'), 'AB123CD');
});

test('patente: reconoce los cuatro formatos argentinos', () => {
  for (const ok of ['KNE353', 'AB123CD', '123ABC', 'A123BCD']) assert.equal(esPatenteValida(ok), true, ok);
  for (const mal of ['KNE35', 'KNE3533', 'AB12CD', '1234567', 'ABCDEFG', '']) assert.equal(esPatenteValida(mal), false, mal);
});

test('patente: corrige confusiones de lectura según la posición', () => {
  assert.equal(corregirConfusiones('KNE3S3'), 'KNE353'); // S en lugar de 5
  assert.equal(corregirConfusiones('KNEO53'), 'KNE053'); // O en lugar de 0
  assert.equal(corregirConfusiones('AB1Z3CD'), 'AB123CD');
  assert.equal(corregirConfusiones('ABC123'), 'ABC123');
  assert.equal(corregirConfusiones('QQQQQQQQ'), null);
  assert.equal(corregirConfusiones('KOLSARU'), null); // 3 cambios: es texto de un cartel, no una patente mal leída
  assert.equal(corregirConfusiones('KNEO5S'), 'KNE055'); // 2 cambios: todavía vale
});

test('patente: la busca entre varios textos leídos de una foto', () => {
  assert.deepEqual(buscarPatente(['ARGENTINA', 'KNE 353', 'MERCOSUR']), { patente: 'KNE353', exacta: true });
  assert.deepEqual(buscarPatente(['hola', 'KKM 219']), { patente: 'KKM219', exacta: true });
  assert.equal(buscarPatente(['sin', 'nada']), null);
  assert.deepEqual(buscarPatente(['AB l23 CD']), { patente: 'AB123CD', exacta: false });
});

// ───────── fecha ─────────
test('fecha de WhatsApp: salen del nombre del archivo', () => {
  assert.equal(fechaDeNombreWhatsApp('IMG-20261106-WA0031.jpg'), '2026-11-06');
  assert.equal(fechaDeNombreWhatsApp('IMG-20261106-WA0031(1).jpg'), '2026-11-06');
  assert.equal(fechaDeNombreWhatsApp('WhatsApp Image 2026-11-06 at 14.32.10.jpeg'), '2026-11-06');
  assert.equal(fechaDeNombreWhatsApp('WhatsApp Image 2026-11-06 at 14.32.10 (2).jpeg'), '2026-11-06');
  assert.equal(fechaDeNombreWhatsApp('foto.jpg'), null);
  assert.equal(fechaDeNombreWhatsApp('IMG-20261342-WA0001.jpg'), null); // mes 13 no existe
});

// JPEG mínimo con EXIF: FFD8, APP1 'Exif', TIFF little-endian, IFD0 → ExifIFD → DateTimeOriginal
function jpegConExif(fecha: string, tag = 0x9003): Uint8Array {
  const texto = new TextEncoder().encode(fecha + '\0'); // 20 bytes
  // TIFF: header(8) + IFD0(2+12+4) + ExifIFD(2+12+4) + texto
  const tiff = new Uint8Array(8 + 18 + 18 + texto.length);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]);
  dv.setUint32(4, 8, true);
  // IFD0 en 8: una entrada → 0x8769 apuntando a 26
  dv.setUint16(8, 1, true);
  dv.setUint16(10, 0x8769, true); dv.setUint16(12, 4, true); dv.setUint32(14, 1, true); dv.setUint32(18, 26, true);
  dv.setUint32(22, 0, true);
  // ExifIFD en 26: una entrada → tag con ASCII en 44
  dv.setUint16(26, 1, true);
  dv.setUint16(28, tag, true); dv.setUint16(30, 2, true); dv.setUint32(32, texto.length, true); dv.setUint32(36, 44, true);
  dv.setUint32(40, 0, true);
  tiff.set(texto, 44);
  const exifId = new TextEncoder().encode('Exif\0\0');
  const len = 2 + exifId.length + tiff.length;
  const out = new Uint8Array(2 + 2 + 2 + exifId.length + tiff.length + 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255]);
  out.set(exifId, 6);
  out.set(tiff, 6 + exifId.length);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

test('fecha EXIF: lee DateTimeOriginal de un JPEG', () => {
  assert.equal(fechaExif(jpegConExif('2026:11:05 09:15:30')), '2026-11-05');
  assert.equal(fechaExif(jpegConExif('2026:11:05 09:15:30', 0x9004)), '2026-11-05'); // digitalizada
});

test('fecha EXIF: lo que no es JPEG, no tiene EXIF o trae basura da null', () => {
  assert.equal(fechaExif(new Uint8Array([1, 2, 3])), null);
  assert.equal(fechaExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(fechaExif(jpegConExif('0000:00:00 00:00:00')), null);
  assert.equal(fechaExif(jpegConExif('2026:13:40 00:00:00')), null);
});

test('fecha de la foto: primero los metadatos, después la de WhatsApp, si no hay ninguna null', () => {
  assert.deepEqual(fechaDeLaFoto('IMG-20261106-WA0031.jpg', jpegConExif('2026:11:01 10:00:00')), { iso: '2026-11-01', origen: 'metadatos' });
  assert.deepEqual(fechaDeLaFoto('IMG-20261106-WA0031.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), { iso: '2026-11-06', origen: 'WhatsApp' });
  assert.equal(fechaDeLaFoto('foto.jpg', new Uint8Array(0)), null);
});

test('formato de fecha: día/mes/año', () => {
  assert.equal(formatoFecha('2026-11-06'), '06/11/2026');
});

// ───────── encuadre ─────────
test('encuadre: el vehículo pegado a un borde está cortado en ese lado', () => {
  assert.deepEqual(ladosCortados({ x0: 0, y0: 100, x1: 800, y1: 500 }, 1000, 600, 2), ['izquierdo']);
  assert.deepEqual(ladosCortados({ x0: 100, y0: 100, x1: 995, y1: 500 }, 1000, 600, 2), ['derecho']);
  assert.deepEqual(ladosCortados({ x0: 100, y0: 2, x1: 900, y1: 598 }, 1000, 600, 2), ['superior', 'inferior']);
  assert.deepEqual(ladosCortados({ x0: 100, y0: 100, x1: 900, y1: 500 }, 1000, 600, 2), []);
});

test('encuadre: el margen es un porcentaje de la foto (2 % de 1000 px = 20 px)', () => {
  assert.deepEqual(ladosCortados({ x0: 19, y0: 100, x1: 900, y1: 500 }, 1000, 600, 2), ['izquierdo']);
  assert.deepEqual(ladosCortados({ x0: 21, y0: 100, x1: 900, y1: 500 }, 1000, 600, 2), []);
  assert.deepEqual(ladosCortados({ x0: 5, y0: 100, x1: 900, y1: 500 }, 1000, 600, 0), []); // margen 0: solo si toca el borde
  assert.deepEqual(ladosCortados({ x0: 0, y0: 100, x1: 900, y1: 500 }, 1000, 600, 0), ['izquierdo']);
});

test('encuadre: de varias detecciones se queda con el vehículo más grande', () => {
  const dets = [
    { clase: 'person', puntaje: 0.99, caja: { x0: 0, y0: 0, x1: 50, y1: 100 } },
    { clase: 'car', puntaje: 0.9, caja: { x0: 100, y0: 100, x1: 300, y1: 200 } },
    { clase: 'truck', puntaje: 0.8, caja: { x0: 50, y0: 50, x1: 700, y1: 500 } },
    { clase: 'car', puntaje: 0.2, caja: { x0: 0, y0: 0, x1: 1000, y1: 600 } }, // poco seguro: no cuenta
  ];
  assert.deepEqual(elegirVehiculo(dets), dets[2]);
  assert.equal(elegirVehiculo([dets[0]]), null);
  // una moto vista de atrás sale como «bicycle»: igual es el vehículo
  assert.equal(elegirVehiculo([{ clase: 'bicycle', puntaje: 0.72, caja: { x0: 1, y0: 1, x1: 50, y1: 50 } }])?.clase, 'bicycle');
});

// ───────── configuración ─────────
test('configuración de Inspecciones: valores de fábrica', () => {
  assert.equal(DEFAULT_INSP_CONFIG.marginPct, 0.5);
  assert.equal(DEFAULT_INSP_CONFIG.outputPath, '');
  assert.deepEqual(DEFAULT_INSP_CONFIG.requiredAuto, tomasDe('auto').map((t) => t.id));
  assert.deepEqual(DEFAULT_INSP_CONFIG.requiredMoto, tomasDe('moto').map((t) => t.id));
  assert.deepEqual(INSP_PARAM_SPEC.marginPct, { min: 0, max: 15, step: 0.5, factory: 0.5 });
  assert.deepEqual(INSP_PARAM_SPEC.angleRigor, { min: 0, max: 10, step: 1, factory: 5 });
});

test('configuración de Inspecciones: corrige lo inválido y deja solo tomas que existen para ese tipo', () => {
  const c = sanitizeInspConfig({ marginPct: 99, requiredAuto: ['FRENTE', 'CUADRO', 'XX'], requiredMoto: 'no', outputPath: 5 });
  assert.equal(c.marginPct, 15);
  assert.deepEqual(c.requiredAuto, ['FRENTE']); // CUADRO es de moto y XX no existe
  assert.deepEqual(c.requiredMoto, DEFAULT_INSP_CONFIG.requiredMoto);
  assert.equal(c.outputPath, '');
  assert.equal(sanitizeInspConfig({ marginPct: 'abc' }).marginPct, 0.5);
  assert.equal(sanitizeInspConfig({ marginPct: '2,5' }).marginPct, 2.5);
});

test('configuración de Inspecciones: se guarda y se lee', () => {
  const data: Record<string, string> = {};
  const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  assert.deepEqual(loadInspConfig(storage), DEFAULT_INSP_CONFIG);
  saveInspConfig(storage, { ...DEFAULT_INSP_CONFIG, marginPct: 4, outputPath: 'D:\\Fotos', requiredAuto: ['FRENTE'] });
  const c = loadInspConfig(storage);
  assert.equal(c.marginPct, 4);
  assert.equal(c.outputPath, 'D:\\Fotos');
  assert.deepEqual(c.requiredAuto, ['FRENTE']);
  assert.deepEqual(loadInspConfig({ getItem: () => '{roto' }), DEFAULT_INSP_CONFIG);
});

test('carpeta de salida: si no se eligió, es «Inspecciones» dentro del Origen', () => {
  assert.equal(outputFolderFor({ ...DEFAULT_INSP_CONFIG, outputPath: '' }, 'C:\\Users\\Javier\\Downloads'), 'C:\\Users\\Javier\\Downloads\\Inspecciones');
  assert.equal(outputFolderFor({ ...DEFAULT_INSP_CONFIG, outputPath: 'D:\\Fotos' }, 'C:\\x'), 'D:\\Fotos');
  assert.equal(outputFolderFor({ ...DEFAULT_INSP_CONFIG, outputPath: '' }, 'C:\\x\\'), 'C:\\x\\Inspecciones');
});

// ───────── análisis de la foto ─────────
import { varianzaLaplaciana, base64ABytes } from '../src/utils/inspecciones/nitidez';

test('nitidez: una imagen lisa vale 0 y una con bordes marcados vale mucho más', () => {
  const w = 20, h = 20;
  const lisa = new Uint8Array(w * h).fill(128);
  const rayada = new Uint8Array(w * h).map((_, i) => ((i % w) % 2 ? 255 : 0));
  assert.equal(varianzaLaplaciana(lisa, w, h), 0);
  assert.ok(varianzaLaplaciana(rayada, w, h) > 1000);
  assert.equal(varianzaLaplaciana(lisa, 2, 2), 0); // muy chica: no revienta
});

test('data URL → bytes', () => {
  assert.deepEqual([...base64ABytes('data:image/jpeg;base64,/9j/4A==')], [0xff, 0xd8, 0xff, 0xe0]);
});

// ───────── fotos ya copiadas ─────────
import { agregarProcesadas, cargarProcesadas, clavePhoto, MAX_PROCESADAS } from '../src/utils/inspecciones/procesadas';

const almacen = () => {
  const d: Record<string, string> = {};
  return { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => void (d[k] = v) };
};

test('fotos ya copiadas: se recuerdan y no se repiten', () => {
  const s = almacen();
  agregarProcesadas(s, [clavePhoto('IMG-1.jpg', 10), clavePhoto('IMG-2.jpg', 20)]);
  agregarProcesadas(s, [clavePhoto('IMG-2.jpg', 20), clavePhoto('IMG-3.jpg', 30)]);
  assert.deepEqual(cargarProcesadas(s), ['img-1.jpg|10', 'img-2.jpg|20', 'img-3.jpg|30']);
});

test('fotos ya copiadas: tiene tope (se olvidan las más viejas) y soporta datos rotos', () => {
  const s = almacen();
  agregarProcesadas(s, Array.from({ length: MAX_PROCESADAS + 50 }, (_, i) => `f${i}|1`));
  const todas = cargarProcesadas(s);
  assert.equal(todas.length, MAX_PROCESADAS);
  assert.equal(todas[0], 'f50|1');
  assert.deepEqual(cargarProcesadas({ getItem: () => '{roto' }), []);
  assert.deepEqual(cargarProcesadas({ getItem: () => '{"a":1}' }), []);
});

// ───────── fotos en diagonal (costados que no salieron de perfil) ─────────
import { aspectoMinimoDePerfil, enDiagonal } from '../src/utils/inspecciones/encuadre';
import { angleError, clampAngle } from '../src/utils/inspecciones/config';

test('diagonal: con el rigor de fábrica (5) un costado más corto que 2,1 de ancho por alto se avisa', () => {
  assert.ok(Math.abs(aspectoMinimoDePerfil(5) - 2.1) < 1e-9);
  assert.equal(enDiagonal(1.9, 5), true); // vehículo de tres cuartos
  assert.equal(enDiagonal(2.5, 5), false); // de perfil
  assert.equal(enDiagonal(2.1, 5), false); // justo en el límite no avisa
});

test('diagonal: rigor 0 apaga el aviso y más rigor avisa más; sin vehículo detectado no inventa nada', () => {
  assert.equal(enDiagonal(1.0, 0), false);
  assert.equal(enDiagonal(2.3, 5), false);
  assert.equal(enDiagonal(2.3, 8), true);
  assert.equal(enDiagonal(undefined, 10), false);
  assert.equal(enDiagonal(NaN, 10), false);
});

test('diagonal: el rigor se guarda entre 0 y 10, de a uno, y lo inválido vuelve a la fábrica', () => {
  assert.equal(clampAngle(99), 10);
  assert.equal(clampAngle(-3), 0);
  assert.equal(clampAngle('6,4'), 6);
  assert.equal(clampAngle('abc'), 5);
  assert.equal(angleError('abc'), 'Escribí un número.');
  assert.equal(angleError(11), 'Tiene que estar entre 0 y 10.');
  assert.equal(angleError(5), null);
  assert.equal(sanitizeInspConfig({}).angleRigor, 5);
  assert.equal(sanitizeInspConfig({ angleRigor: 7 }).angleRigor, 7);
});

import { costadoEnDiagonal } from '../src/utils/inspecciones/encuadre';
test('diagonal: solo cuenta en conductor y acompañante de un auto, nunca en motos, frente ni trasera', () => {
  const base = { tomas: ['ACOMPANANTE'], tipo: 'auto', clase: 'car', relacion: 1.8, rigor: 5 };
  assert.equal(costadoEnDiagonal(base), true);
  assert.equal(costadoEnDiagonal({ ...base, tomas: ['CONDUCTOR'] }), true);
  assert.equal(costadoEnDiagonal({ ...base, tomas: ['FRENTE'] }), false);
  assert.equal(costadoEnDiagonal({ ...base, tomas: [] }), false);
  assert.equal(costadoEnDiagonal({ ...base, tipo: 'moto' }), false);
  assert.equal(costadoEnDiagonal({ ...base, clase: 'motorcycle' }), false);
  assert.equal(costadoEnDiagonal({ ...base, clase: 'bicycle' }), false);
  assert.equal(costadoEnDiagonal({ ...base, relacion: undefined }), false);
  assert.equal(costadoEnDiagonal({ ...base, rigor: 0 }), false);
});
