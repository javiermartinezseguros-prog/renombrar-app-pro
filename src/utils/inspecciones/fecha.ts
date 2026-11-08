/**
 * Fecha de una foto: primero los metadatos (EXIF, la fecha en que se sacó); si no los tiene —WhatsApp los borra—
 * la fecha de envío que WhatsApp pone en el nombre del archivo. Sin ninguna de las dos: null (no se inventa).
 */
export interface FechaFoto {
  /** AAAA-MM-DD */
  iso: string;
  origen: 'metadatos' | 'WhatsApp';
}

const fechaValida = (a: number, m: number, d: number): boolean => {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(a, m, 0).getDate();
};
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** IMG-20261106-WA0031.jpg · WhatsApp Image 2026-11-06 at 14.32.10.jpeg */
export function fechaDeNombreWhatsApp(nombre: string): string | null {
  const m = /^IMG-(\d{4})(\d{2})(\d{2})-WA\d+/i.exec(nombre) ?? /^WhatsApp Image (\d{4})-(\d{2})-(\d{2}) at /i.exec(nombre);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return fechaValida(a, mes, d) ? iso(a, mes, d) : null;
}

const TAG_FECHA_ORIGINAL = 0x9003;
const TAG_FECHA_DIGITALIZADA = 0x9004;
const TAG_EXIF_IFD = 0x8769;

/** Lee DateTimeOriginal de un JPEG. Cualquier cosa rara (no es JPEG, sin EXIF, fecha 0000) da null. */
export function fechaExif(bytes: Uint8Array): string | null {
  try {
    if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) return null;
      const marcador = bytes[pos + 1];
      if (marcador === 0xd9 || marcador === 0xda) return null; // fin de imagen / datos: ya no hay metadatos
      const largo = dv.getUint16(pos + 2, false);
      if (marcador === 0xe1 && String.fromCharCode(...bytes.slice(pos + 4, pos + 8)) === 'Exif') {
        return leerTiff(dv, pos + 10, pos + 2 + largo);
      }
      pos += 2 + largo;
    }
  } catch {
    // archivo cortado o dañado
  }
  return null;
}

function leerTiff(dv: DataView, inicio: number, fin: number): string | null {
  const little = dv.getUint16(inicio, false) === 0x4949;
  const u16 = (o: number) => dv.getUint16(inicio + o, little);
  const u32 = (o: number) => dv.getUint32(inicio + o, little);
  const ifd = (offset: number): Map<number, { tipo: number; cuenta: number; valor: number }> => {
    const out = new Map();
    const n = u16(offset);
    for (let i = 0; i < n && inicio + offset + 2 + i * 12 + 12 <= fin; i++) {
      const e = offset + 2 + i * 12;
      out.set(u16(e), { tipo: u16(e + 2), cuenta: u32(e + 4), valor: u32(e + 8) });
    }
    return out;
  };
  const texto = (e: { cuenta: number; valor: number }) => {
    let s = '';
    for (let i = 0; i < e.cuenta - 1 && inicio + e.valor + i < fin; i++) s += String.fromCharCode(dv.getUint8(inicio + e.valor + i));
    return s;
  };
  const raiz = ifd(u32(4));
  const puntero = raiz.get(TAG_EXIF_IFD);
  if (!puntero) return null;
  const exif = ifd(puntero.valor);
  const entrada = exif.get(TAG_FECHA_ORIGINAL) ?? exif.get(TAG_FECHA_DIGITALIZADA);
  if (!entrada) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(texto(entrada));
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return fechaValida(a, mes, d) ? iso(a, mes, d) : null;
}

export function fechaDeLaFoto(nombre: string, bytes: Uint8Array): FechaFoto | null {
  const exif = fechaExif(bytes);
  if (exif) return { iso: exif, origen: 'metadatos' };
  const wa = fechaDeNombreWhatsApp(nombre);
  return wa ? { iso: wa, origen: 'WhatsApp' } : null;
}

/** AAAA-MM-DD → DD/MM/AAAA */
export const formatoFecha = (isoFecha: string): string => isoFecha.split('-').reverse().join('/');
