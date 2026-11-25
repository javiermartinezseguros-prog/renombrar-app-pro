/**
 * Dónde está la patente en una foto y cuál creer cuando hay lecturas de adelante y de atrás. Todo con cuentas (sin
 * imágenes ni modelos), para poder probarlo.
 *
 * Leer la foto entera no sirve: la chapa ocupa un pedacito y se mezcla con faros, rejillas y carteles. Primero se ubican
 * los rectángulos que parecen una chapa (muchos trazos verticales —las letras— repartidos en todo el rectángulo, dos tonos
 * bien marcados y un entorno distinto); recién ahí se lee cada uno con el lector de patentes (lectorPatente.ts).
 */
export interface Zona {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Candidata extends Zona {
  puntaje: number;
  /** La ventana sola que más puntaje sacó: el rectángulo de arriba puede salir más grande que la chapa (junta ventanas vecinas), y esta es la versión ajustada. */
  nucleo: Zona;
}

/** Trazo vertical: diferencia de brillo entre vecinos de izquierda y derecha desde la cual se cuenta como borde de una letra. */
const UMBRAL_BORDE = 40;
/** Brillo (0 a 255, con el contraste ya estirado) desde el cual un punto cuenta como fondo claro de la chapa, y hasta el cual como letra. */
const UMBRAL_CLARO = 150;
const UMBRAL_OSCURO = 90;
/** Proporciones ancho/alto de una chapa: auto (con el borde y la franja ARGENTINA) y moto (más cuadrada). */
const PROPORCIONES = [2.8, 1.7];

/**
 * Busca en una imagen en grises los rectángulos que parecen una chapa: muchos trazos verticales (las letras y números)
 * repartidos por todo el rectángulo y, a la vez, un entorno con muchos menos (la chapa está rodeada de chapa lisa).
 * Devuelve hasta `max` candidatas, de la más a la menos probable, en píxeles de la imagen recibida.
 */
export function buscarCandidatas(gris: Uint8Array, ancho: number, alto: number, region: Zona | null = null, max = 4): Candidata[] {
  const W = ancho;
  const H = alto;
  // borde vertical (Sobel en x) como imagen binaria, y su imagen integral para contar bordes de cualquier rectángulo en un paso
  const integral = new Int32Array((W + 1) * (H + 1));
  // y lo mismo para los puntos claros (fondo de la chapa) y oscuros (letras), y para la suma de grises
  const clara = new Int32Array((W + 1) * (H + 1));
  const oscura = new Int32Array((W + 1) * (H + 1));
  const brillo = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let fila = 0, filaC = 0, filaO = 0, filaB = 0;
    for (let x = 0; x < W; x++) {
      let borde = 0;
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        const i = y * W + x;
        const g = gris[i - W + 1] + 2 * gris[i + 1] + gris[i + W + 1] - gris[i - W - 1] - 2 * gris[i - 1] - gris[i + W - 1];
        if (Math.abs(g) / 4 > UMBRAL_BORDE) borde = 1;
      }
      fila += borde;
      const v = gris[y * W + x];
      filaC += v > UMBRAL_CLARO ? 1 : 0;
      filaO += v < UMBRAL_OSCURO ? 1 : 0;
      filaB += v;
      const k = (y + 1) * (W + 1) + x + 1;
      const arriba = y * (W + 1) + x + 1;
      integral[k] = integral[arriba] + fila;
      clara[k] = clara[arriba] + filaC;
      oscura[k] = oscura[arriba] + filaO;
      brillo[k] = brillo[arriba] + filaB;
    }
  }
  const suma = (t: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number): number => {
    // las coordenadas llegan con decimales (tercios, márgenes): se redondean para indexar la tabla
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
    if (x1 <= x0 || y1 <= y0) return 0;
    return t[y1 * (W + 1) + x1] - t[y0 * (W + 1) + x1] - t[y1 * (W + 1) + x0] + t[y0 * (W + 1) + x0];
  };
  const cuenta = (x0: number, y0: number, x1: number, y1: number): number => suma(integral, x0, y0, x1, y1);
  const r = region ?? { x0: 0, y0: 0, x1: W, y1: H };
  const todas: Array<Zona & { puntaje: number }> = [];
  for (const prop of PROPORCIONES) {
    for (let w = Math.max(40, W * 0.05); w <= Math.min(r.x1 - r.x0, W * 0.6); w *= 1.18) {
      const h = Math.round(w / prop);
      const px = Math.max(2, Math.round(w / 8));
      const py = Math.max(2, Math.round(h / 5));
      for (let y = Math.round(r.y0); y + h <= r.y1; y += py) {
        for (let x = Math.round(r.x0); x + w <= r.x1; x += px) {
          const x1 = Math.round(x + w);
          const dentro = cuenta(x, y, x1, y + h) / (w * h);
          if (dentro < 0.1 || dentro > 0.55) continue;
          // dos tonos bien marcados, sea fondo claro con letras oscuras (chapa blanca) o fondo oscuro con letras claras (chapa negra)
          const area = w * h;
          const claros = suma(clara, x, y, x1, y + h) / area;
          const oscuros = suma(oscura, x, y, x1, y + h) / area;
          if (claros < 0.12 || oscuros < 0.12 || claros + oscuros < 0.6) continue;
          // las letras se reparten por todo el ancho: el tercio más pobre no puede ser casi vacío
          const t = w / 3;
          const tercios = [0, 1, 2].map((k) => cuenta(x + k * t, y, x + (k + 1) * t, y + h) / (t * h));
          if (Math.min(...tercios) < dentro * 0.4) continue;
          const mx = w * 0.4;
          const my = h * 0.4;
          const areaFuera = (w + 2 * mx) * (h + 2 * my) - w * h;
          const fuera = (cuenta(x - mx, y - my, x1 + mx, y + h + my) - cuenta(x, y, x1, y + h)) / Math.max(1, areaFuera);
          // y de brillo distinto al de su entorno (la chapa se destaca del paragolpes)
          const brilloDentro = suma(brillo, x, y, x1, y + h) / area;
          const brilloFuera = (suma(brillo, x - mx, y - my, x1 + mx, y + h + my) - suma(brillo, x, y, x1, y + h)) / Math.max(1, areaFuera);
          todas.push({ x0: x, y0: y, x1, y1: y + h, puntaje: dentro - 0.6 * fuera + (0.5 * Math.abs(brilloDentro - brilloFuera)) / 255 });
        }
      }
    }
  }
  todas.sort((a, b) => b.puntaje - a.puntaje);
  const cruzan = (p: Zona, q: Zona): number => {
    const iw = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
    const ih = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    return iw > 0 && ih > 0 ? iw * ih : 0;
  };
  const area = (z: Zona): number => (z.x1 - z.x0) * (z.y1 - z.y0);
  const elegidas: Candidata[] = [];
  for (const c of todas) {
    if (elegidas.length >= max + 2) break;
    if (elegidas.some((e) => cruzan(e, c) / (area(e) + area(c) - cruzan(e, c)) > 0.1 || cruzan(e, c) > 0.5 * area(c))) continue;
    // las ventanas casi tan buenas que se cruzan con ésta se juntan: así la candidata cubre la chapa entera y no solo la mitad
    let u: Candidata = { ...c, nucleo: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 } };
    const mw = (c.x1 - c.x0) * 0.4;
    const mh = (c.y1 - c.y0) * 0.4;
    const vecindad: Zona = { x0: c.x0 - mw, y0: c.y0 - mh, x1: c.x1 + mw, y1: c.y1 + mh };
    for (const o of todas) {
      if (o.puntaje < c.puntaje * 0.8) break;
      if (cruzan(o, vecindad) > 0.3 * area(o)) u = { x0: Math.min(u.x0, o.x0), y0: Math.min(u.y0, o.y0), x1: Math.max(u.x1, o.x1), y1: Math.max(u.y1, o.y1), puntaje: c.puntaje, nucleo: u.nucleo };
    }
    elegidas.push(u);
  }
  // una chapa partida en dos o tres rectángulos pegados (letras | números) se junta en uno solo
  const vecinas = (p: Zona, q: Zona): boolean => {
    const alto = Math.min(p.y1 - p.y0, q.y1 - q.y0);
    const sobreY = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    const hueco = Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1);
    return sobreY >= 0.5 * alto && hueco < 0.5 * Math.max(p.x1 - p.x0, q.x1 - q.x0);
  };
  const juntas: Candidata[] = [];
  for (const c of elegidas) {
    const ya = juntas.find((j) => vecinas(j, c));
    if (ya) {
      ya.x0 = Math.min(ya.x0, c.x0); ya.y0 = Math.min(ya.y0, c.y0); ya.x1 = Math.max(ya.x1, c.x1); ya.y1 = Math.max(ya.y1, c.y1);
      ya.puntaje = Math.max(ya.puntaje, c.puntaje);
    } else juntas.push({ ...c });
  }
  return juntas.slice(0, max);
}

// ── la patente del vehículo: la de adelante contra la de atrás ──

export type LadoChapa = 'FRENTE' | 'TRASERA';

/** De dónde salió una lectura: la foto de adelante, la de atrás, la cédula (campo DOMINIO), o null si es una foto sin toma conocida. */
export type OrigenLectura = LadoChapa | 'CEDULA';

export interface LecturaChapa {
  lado: OrigenLectura | null;
  patente: string;
  exacta: boolean;
}

export interface PatenteDelVehiculo {
  patente: string;
  /** Se puede usar sola: se leyó completa, o coincide la de adelante con la de atrás. */
  exacta: boolean;
  /** `coincide`: adelante y atrás dicen lo mismo · `distinta`: dicen cosas distintas · `un_lado`: solo se leyó una. */
  cruce: 'coincide' | 'distinta' | 'un_lado';
  /** Lado de la lectura que se eligió (null si no se sabe). */
  lado: OrigenLectura | null;
  /** Qué dijo la cédula contra las fotos (si se leyó el dominio de una cédula). `sola`: no hay lectura de fotos; `coincide`: las fotos dicen lo mismo; `corrige`: las fotos difieren en una letra y se toma la de la cédula; `distinta`: dicen algo muy distinto. */
  cedula?: { patente: string; estado: 'coincide' | 'corrige' | 'distinta' | 'sola'; fotos: string[] };
  /** En `distinta`, lo que dijo el otro lado. */
  otra?: { lado: LadoChapa; patente: string };
}

/** Las motos llevan la chapa solo atrás; los demás vehículos, adelante y atrás. */
export const ladosConChapa = (esMoto: boolean): LadoChapa[] => (esMoto ? ['TRASERA'] : ['FRENTE', 'TRASERA']);

const mejorLectura = (l: LecturaChapa[]): LecturaChapa | undefined => l.find((x) => x.exacta) ?? l[0];

/**
 * Junta lo leído en las fotos del vehículo. Si se leyó la de adelante y la de atrás y dicen lo mismo, es casi seguro
 * (aunque cada una por separado fuera dudosa); si dicen cosas distintas se avisa y se ofrece la mejor leída.
 */
export function patenteDelVehiculo(lecturas: LecturaChapa[]): PatenteDelVehiculo | null {
  const cedula = mejorLectura(lecturas.filter((l) => l.lado === 'CEDULA'));
  const fotos = lecturas.filter((l) => l.lado !== 'CEDULA');
  const deFotos = patenteDeFotos(fotos);
  return cedula ? conCedula(cedula, fotos, deFotos) : deFotos;
}

/**
 * La cédula trae el dominio de forma inequívoca. Si las fotos dicen lo mismo, queda confirmada. Si lo que difiere es una
 * lectura dudosa de una foto (chapa mal leída), manda la cédula. Si una foto leída con certeza dice algo distinto (aunque
 * sea una sola letra), no se sabe cuál falló —el OCR de la cédula también se equivoca—: se ofrece la de la cédula con aviso,
 * sin completarla sola.
 */
function conCedula(cedula: LecturaChapa, fotos: LecturaChapa[], deFotos: PatenteDelVehiculo | null): PatenteDelVehiculo {
  const patentesFotos = [...new Set(fotos.map((f) => f.patente))];
  if (patentesFotos.length === 0) {
    return { patente: cedula.patente, exacta: cedula.exacta, cruce: 'un_lado', lado: 'CEDULA', cedula: { patente: cedula.patente, estado: 'sola', fotos: [] } };
  }
  if (patentesFotos.every((p) => p === cedula.patente)) {
    return { ...(deFotos as PatenteDelVehiculo), patente: cedula.patente, exacta: true, lado: 'CEDULA', cedula: { patente: cedula.patente, estado: 'coincide', fotos: patentesFotos } };
  }
  const base = deFotos as PatenteDelVehiculo;
  const fotosSeguras = fotos.filter((f) => f.exacta);
  if (cedula.exacta && fotosSeguras.every((f) => f.patente === cedula.patente)) {
    return { patente: cedula.patente, exacta: true, cruce: base.cruce === 'distinta' ? 'un_lado' : base.cruce, lado: 'CEDULA', cedula: { patente: cedula.patente, estado: 'corrige', fotos: patentesFotos } };
  }
  return { ...base, patente: cedula.exacta ? cedula.patente : base.patente, exacta: false, lado: cedula.exacta ? 'CEDULA' : base.lado, cedula: { patente: cedula.patente, estado: 'distinta', fotos: patentesFotos } };
}

/** Lo leído en las fotos de adelante y de atrás (sin la cédula). */
function patenteDeFotos(lecturas: LecturaChapa[]): PatenteDelVehiculo | null {
  if (lecturas.length === 0) return null;
  const frente = mejorLectura(lecturas.filter((l) => l.lado === 'FRENTE'));
  const trasera = mejorLectura(lecturas.filter((l) => l.lado === 'TRASERA'));
  if (frente && trasera) {
    if (frente.patente === trasera.patente) return { patente: trasera.patente, exacta: true, cruce: 'coincide', lado: 'TRASERA' };
    // distintas: gana la que se leyó completa; si las dos o ninguna, la de atrás (la que sale en todos los vehículos)
    const elegida = frente.exacta && !trasera.exacta ? frente : trasera;
    const otra = elegida === frente ? trasera : frente;
    return { patente: elegida.patente, exacta: false, cruce: 'distinta', lado: elegida.lado, otra: { lado: otra.lado as LadoChapa, patente: otra.patente } };
  }
  const unica = mejorLectura(lecturas.filter((l) => l.lado !== null)) ?? mejorLectura(lecturas)!;
  // dos lecturas iguales de fotos distintas también valen más que una sola
  const repetida = lecturas.filter((l) => l.patente === unica.patente).length > 1;
  return { patente: unica.patente, exacta: unica.exacta || repetida, cruce: 'un_lado', lado: unica.lado };
}
