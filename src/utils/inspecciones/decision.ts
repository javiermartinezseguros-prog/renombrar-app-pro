/**
 * De «qué tan parecida es la foto a cada muestra» a «qué toma es». Los límites salen de medir con fotos reales
 * (KNE353): las bien reconocidas tuvieron un parecido de 0,27 a 0,70 y una ventaja sobre la segunda de 0,005 a 0,13;
 * las que quedan muy cerca de la segunda se marcan como dudosas para que Javier las confirme.
 */
import { CLASES_DOS_RUEDAS } from './encuadre';
import { TipoVehiculo, TomaId } from './tomas';
import { Parecido } from './vision';

/** Ni una toma del vehículo: licencias de conducir, cédulas, DNI, tarjetas. Se reconoce para no confundirlas con una toma (antes caían en OBLEA). */
export const DOCUMENTO = 'DOCUMENTO';

export interface ClaveMuestra {
  tipo: TipoVehiculo;
  toma: TomaId | typeof DOCUMENTO;
}

export interface DecisionToma {
  /** Casi siempre una; AUXILIO y GNC vienen juntas cuando la foto vale por las dos (el baúl con el cilindro). */
  tomas: TomaId[];
  /** Auto o moto; null si la foto es un documento (no dice nada del vehículo). */
  tipo: TipoVehiculo | null;
  /** La foto parece un documento y no una toma: no se le asigna ninguna. */
  documento: boolean;
  puntaje: number;
  /** Ventaja del primero sobre el segundo (de otra toma). */
  margen: number;
  /** Poco segura: se le pide a Javier que la confirme. */
  dudosa: boolean;
}

/** Por debajo de este parecido con cualquier muestra no se asigna ninguna toma. */
export const PUNTAJE_MINIMO = 0.15;
/** Ventaja menor que esta sobre la segunda toma = dudosa. */
export const MARGEN_DUDOSO = 0.04;
/** Parecido menor que este = dudosa. */
export const PUNTAJE_DUDOSO = 0.25;
/** AUXILIO y GNC: si la otra del par también se parece tanto, la foto vale por las dos. */
export const PAR_MINIMO = 0.5;

const PAR: TomaId[] = ['AUXILIO', 'GNC'];
const esDelPar = (t: ClaveMuestra['toma']): boolean => (PAR as string[]).includes(t);

export function decidirToma(ordenados: Parecido<ClaveMuestra>[], claseVehiculo: string | null): DecisionToma | null {
  // Si el detector vio un vehículo, la moto se compara solo con muestras de moto y el auto con las de auto.
  let candidatas = ordenados;
  if (claseVehiculo) {
    const tipo: TipoVehiculo = CLASES_DOS_RUEDAS.includes(claseVehiculo) ? 'moto' : 'auto';
    const delTipo = ordenados.filter((o) => o.clave.tipo === tipo || o.clave.toma === DOCUMENTO);
    if (delTipo.length > 0) candidatas = delTipo;
  }
  const mejor = candidatas[0];
  if (!mejor || mejor.puntaje < PUNTAJE_MINIMO) return null;

  const otras = candidatas.filter((o) => o.clave.toma !== mejor.clave.toma);
  const segunda = otras[0];
  if (mejor.clave.toma === DOCUMENTO) {
    const margenDoc = segunda ? mejor.puntaje - segunda.puntaje : mejor.puntaje;
    return { tomas: [], tipo: null, documento: true, puntaje: mejor.puntaje, margen: margenDoc, dudosa: margenDoc < MARGEN_DUDOSO };
  }
  let tomas: TomaId[] = [mejor.clave.toma];
  let rival = segunda;
  if (esDelPar(mejor.clave.toma) && segunda && esDelPar(segunda.clave.toma) && segunda.puntaje >= PAR_MINIMO) {
    tomas = PAR.slice(); // las dos juntas, en el orden de siempre
    rival = otras.find((o) => !esDelPar(o.clave.toma));
  }
  const margen = rival ? mejor.puntaje - rival.puntaje : mejor.puntaje;
  return {
    tomas,
    tipo: mejor.clave.tipo,
    documento: false,
    puntaje: mejor.puntaje,
    margen,
    dudosa: margen < MARGEN_DUDOSO || mejor.puntaje < PUNTAJE_DUDOSO,
  };
}
