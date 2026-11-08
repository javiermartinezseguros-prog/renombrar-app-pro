import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FolderInput, FolderOutput, ArrowRight, Loader2, Square, Check, AlertTriangle, Scissors, X, ScanSearch, ImagePlus, RotateCcw, Eye,
  UploadCloud, Settings, Folder, RotateCw,
} from 'lucide-react';
import { InspConfig, outputFolderFor } from '../utils/inspecciones/config';
import { Caja, costadoEnDiagonal, ladosCortados, Lado, LADO_TEXTO } from '../utils/inspecciones/encuadre';
import { formatoFecha, FechaFoto } from '../utils/inspecciones/fecha';
import { esPatenteValida, normalizarPatente } from '../utils/inspecciones/patente';
import { muestraUrl } from '../utils/inspecciones/muestras';
import { errorDeModelos, obtenerAnalizador } from '../utils/inspecciones/modelos';
import { Analizador, FuenteFoto, leerFoto, leerPatenteDeFoto } from '../utils/inspecciones/analisis';
import { NITIDEZ_MINIMA } from '../utils/inspecciones/nitidez';
import { agregarProcesadas, cargarProcesadas, clavePhoto } from '../utils/inspecciones/procesadas';
import { faltantes, FotoAsignada, planDeCopias, TipoVehiculo, TomaDef, TomaId, tomaPorId, tomasDe } from '../utils/inspecciones/tomas';
import { isElectron, listPhotoFiles, openFolder, readPhotoFile, savePhotoToDestination, showInFolder } from '../utils/electronBridge';
import { buildInspEmptyMenu, buildInspFotoMenu } from '../utils/menuModel';
import { closeContextMenu, openContextMenu } from '../utils/contextMenu';
import { etaText, percent } from '../utils/progress';
import {
  CedulaDibujo, ConfirmarRenombradoModal, FilaConfirmar, FotoGrandeModal, MuestrasContenido, MuestrasModal, TomasModal,
} from './InspeccionesModales';

export interface InspeccionesHandle {
  leer: () => void;
  agregarFotos: () => void;
  agregarCarpeta: () => void;
  renombrar: () => void;
  nuevo: () => void;
  verMuestras: () => void;
  abrirSalida: () => void;
}

/** Lo que la barra de menús y el pie necesitan saber de esta pantalla. */
export interface InspStatus {
  pie: string;
  hayFotos: boolean;
  puedeRenombrar: boolean;
  ocupado: boolean;
}

interface Props {
  /** La sección está a la vista (si no, no revisa la carpeta). */
  activa: boolean;
  originPath: string;
  config: InspConfig;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onOpenSettings: () => void;
  onStatus: (status: InspStatus) => void;
}

interface Foto {
  id: string;
  nombre: string;
  size: number;
  ruta?: string;
  dataUrl: string;
  miniatura: string;
  fecha: FechaFoto | null;
  nitidez: number;
  /** Tomas que reconoció el modelo (vacío = no pudo o no hay modelo). */
  tomasAuto: TomaId[];
  /** El modelo no está seguro de la toma: se pide confirmarla (con «Marcar como revisada» o cambiándola). */
  tomaDudosa: boolean;
  tipoModelo?: TipoVehiculo;
  /** Lo que eligió Javier a mano (manda sobre el modelo). */
  tomasManual?: TomaId[];
  clase?: string;
  /** Caja del vehículo como fracción de la foto (0 a 1). */
  caja?: Caja;
  /** Ancho / alto del vehículo en píxeles (sirve para saber si el costado salió de perfil o en diagonal). */
  relacion?: number;
  revisada: boolean;
  patente?: { patente: string; exacta: boolean };
  /** Archivos con exactamente la misma foto que se descartaron (se marcan como ya copiados junto con esta). */
  duplicadas?: string[];
}

interface Celda {
  key: string;
  toma: TomaId | null;
  foto?: Foto;
}

type Progreso = { fase: 'modelos' | 'fotos' | 'patente'; hecho: number; total: number; actual: string; inicio: number; parando: boolean };

let contador = 0;
const nuevoId = () => `f${Date.now()}-${contador++}`;

const btnNeutro = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50';
const btnVerde = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed';
const btnAzul = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed';
const segmento = (activo: boolean) =>
  `flex items-center gap-1 px-2 py-1 rounded-md transition-all ${activo ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs font-semibold' : 'hover:text-slate-900 dark:hover:text-white'}`;

const esImagen = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const aDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(f);
  });
const mismaRuta = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

type FuenteConDatos = FuenteFoto & { size: number; ruta?: string };

export const InspeccionesView = forwardRef<InspeccionesHandle, Props>(({ activa, originPath, config, onNotify, onOpenSettings, onStatus }, ref) => {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [tipo, setTipo] = useState<TipoVehiculo>('auto');
  const [patente, setPatente] = useState('');
  const [patenteExacta, setPatenteExacta] = useState<boolean | null>(null);
  /** Lectura dudosa de la patente: se ofrece, pero no se completa sola. */
  const [sugerencia, setSugerencia] = useState<string | null>(null);
  /** null = todavía no se intentó; false = no se pudieron cargar los modelos (queda el motivo en errorDeModelos). */
  const [modeloOk, setModeloOk] = useState<boolean | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [cola, setCola] = useState<string[]>([]);
  const [sel, setSel] = useState<{ fotoId: string | null; toma: TomaId | null }>({ fotoId: null, toma: null });
  const [pendientes, setPendientes] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [copiado, setCopiado] = useState<{ archivos: number; carpeta: string; ruta?: string; faltan: string[] } | null>(null);
  const [modalTomas, setModalTomas] = useState<{ fotoId: string; modo: 'cambiar' | 'tambien' } | null>(null);
  const [grande, setGrande] = useState<{ src: string; titulo: string } | null>(null);
  const [verMuestras, setVerMuestras] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [menuDe, setMenuDe] = useState<string | null>(null);
  const [procesadas, setProcesadas] = useState<string[]>(() => cargarProcesadas(localStorage));

  const fotosRef = useRef<Foto[]>([]);
  fotosRef.current = fotos;
  const stopRef = useRef(false);
  const tipoManual = useRef(false);
  const patenteExactaRef = useRef(false);
  patenteExactaRef.current = patenteExacta === true;
  const patenteManual = useRef(false);
  const analizadorP = useRef<Promise<Analizador | null> | null>(null);
  const inputFotos = useRef<HTMLInputElement>(null);
  const inputCarpeta = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);

  const ocupado = progreso !== null;
  const salida = outputFolderFor(config, originPath);

  // ---------- derivados ----------
  const efectivas = (f: Foto): TomaId[] => {
    const validas = new Set(tomasDe(tipo).map((t) => t.id));
    return (f.tomasManual ?? f.tomasAuto).filter((t) => validas.has(t));
  };

  const ladosDe = (f: Foto): Lado[] => {
    if (!f.caja || f.revisada) return [];
    const importa = efectivas(f).some((t) => tomaPorId(t)?.vistaCompleta);
    return importa ? ladosCortados(f.caja, 1, 1, config.marginPct) : [];
  };

  // Costados (conductor y acompañante) de un auto que no salieron de perfil sino en diagonal. Las motos no se miden.
  const diagonalDe = (f: Foto): boolean =>
    !f.revisada && costadoEnDiagonal({ tomas: efectivas(f), tipo, clase: f.clase, relacion: f.relacion, rigor: config.angleRigor });

  const celdas: Celda[] = useMemo(() => {
    const validas = tomasDe(tipo);
    const porToma = validas.flatMap((t) => {
      const conFoto = fotos.filter((f) => efectivas(f).includes(t.id));
      return conFoto.length ? conFoto.map((f) => ({ key: `${t.id}-${f.id}`, toma: t.id, foto: f })) : [{ key: `${t.id}-falta`, toma: t.id } as Celda];
    });
    const sinToma = fotos.filter((f) => efectivas(f).length === 0).map((f) => ({ key: `sin-${f.id}`, toma: null, foto: f }));
    // lo que pide una decisión (fotos sin toma) va primero
    return [...sinToma, ...porToma];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos, tipo]);

  const obligatorias = tipo === 'auto' ? config.requiredAuto : config.requiredMoto;
  const presentes = fotos.flatMap(efectivas);
  const faltan = faltantes(obligatorias, presentes);
  const cortadas = fotos.filter((f) => ladosDe(f).length > 0);
  const diagonales = fotos.filter(diagonalDe);
  const borrosas = fotos.filter((f) => f.nitidez < NITIDEZ_MINIMA && !f.revisada);
  const sinToma = fotos.filter((f) => efectivas(f).length === 0);
  const dudosas = fotos.filter((f) => f.tomaDudosa && !f.revisada && !f.tomasManual && efectivas(f).length > 0);
  const fechas = [...new Set(fotos.map((f) => f.fecha?.iso).filter(Boolean) as string[])].sort();
  const patentesLeidas = [...new Set(fotos.filter((f) => f.patente?.exacta).map((f) => f.patente!.patente))];
  const fechaVehiculo = useMemo(() => {
    const cuenta = new Map<string, FechaFoto>();
    const veces = new Map<string, number>();
    for (const f of fotos) if (f.fecha) { cuenta.set(f.fecha.iso, f.fecha); veces.set(f.fecha.iso, (veces.get(f.fecha.iso) ?? 0) + 1); }
    const mejor = [...veces.entries()].sort((a, b) => b[1] - a[1])[0];
    return mejor ? cuenta.get(mejor[0])! : null;
  }, [fotos]);

  const avisos: string[] = fotos.length === 0 ? [] : [
    ...cortadas.map((f) => `${efectivas(f).map((t) => tomaPorId(t)?.nombre).join(' / ')} corta una parte del vehículo`),
    ...diagonales.map((f) => `${efectivas(f).map((t) => tomaPorId(t)?.nombre).join(' / ')} salió en diagonal: sacala de perfil`),
    ...faltan.map((t) => `falta ${tomaPorId(t)?.nombre}`),
    ...(sinToma.length ? [`${sinToma.length} ${sinToma.length === 1 ? 'foto sin toma' : 'fotos sin toma'}`] : []),
    ...(dudosas.length ? [`${dudosas.length} ${dudosas.length === 1 ? 'toma poco segura' : 'tomas poco seguras'}: confirmalas`] : []),
    ...borrosas.map((f) => `${f.nombre} está movida o sin foco`),
    ...(patentesLeidas.length > 1 ? [`se leyeron patentes distintas (${patentesLeidas.join(', ')}): ¿hay fotos de dos vehículos?`] : []),
    ...(fechas.length > 1 ? [`las fotos son de días distintos (${fechas.map(formatoFecha).join(', ')})`] : []),
    ...(!esPatenteValida(normalizarPatente(patente)) ? [normalizarPatente(patente) === '' ? 'falta la patente' : 'revisá la patente'] : []),
  ];

  const nFotosConToma = fotos.filter((f) => efectivas(f).length > 0).length;
  const puedeRenombrar = fotos.length > 0 && !ocupado && !copiado && normalizarPatente(patente).length >= 5 && nFotosConToma > 0;

  // ---------- estado hacia la barra de menús y el pie ----------
  useEffect(() => {
    onStatus({
      pie: fotos.length ? `Vehículo en pantalla: ${normalizarPatente(patente) || 'sin patente'}` : 'Sin vehículo en pantalla',
      hayFotos: fotos.length > 0,
      puedeRenombrar,
      ocupado,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos.length, patente, puedeRenombrar, ocupado]);

  // ---------- fotos nuevas en la carpeta de Origen (se cuentan, no se leen solas) ----------
  useEffect(() => {
    if (!activa || !isElectron() || !originPath) return;
    let vivo = true;
    const contar = async () => {
      const r = await listPhotoFiles(originPath);
      if (!vivo || !r.success) return;
      const hechas = new Set(procesadas);
      const cargadas = new Set(fotosRef.current.map((f) => clavePhoto(f.nombre, f.size)));
      setPendientes(r.files.filter((f) => !hechas.has(clavePhoto(f.name, f.size)) && !cargadas.has(clavePhoto(f.name, f.size))).length);
    };
    void contar();
    const timer = setInterval(contar, 6000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [activa, originPath, procesadas, fotos.length, tick]);

  // la animación de avance necesita volver a pintar el tiempo que falta
  useEffect(() => {
    if (!progreso) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [progreso !== null]);

  // ---------- leer ----------
  const procesar = async (fuentes: FuenteConDatos[]) => {
    if (ocupado) return;
    const yaEstan = new Set(fotosRef.current.map((f) => clavePhoto(f.nombre, f.size)));
    const nuevas = fuentes.filter((f) => !yaEstan.has(clavePhoto(f.nombre, f.size)));
    if (nuevas.length === 0) {
      onNotify('info', 'No hay fotos nuevas', fuentes.length ? 'Esas fotos ya están en pantalla.' : 'No se encontraron imágenes (.jpg, .png o .webp).');
      return;
    }
    stopRef.current = false;
    setCopiado(null);
    setCola(nuevas.map((f) => f.nombre));
    setProgreso({ fase: analizadorP.current ? 'fotos' : 'modelos', hecho: 0, total: nuevas.length, actual: nuevas[0].nombre, inicio: Date.now(), parando: false });
    analizadorP.current ??= obtenerAnalizador();
    const analizador = await analizadorP.current;
    if (!analizador) analizadorP.current = null; // si falló, la próxima lectura vuelve a intentar
    setModeloOk(Boolean(analizador));
    if (!analizador) onNotify('error', 'No se pudo preparar el reconocimiento', `${errorDeModelos() ?? 'Falló la carga de los modelos.'} Podés elegir la toma de cada foto a mano.`);
    setProgreso((p) => (p ? { ...p, fase: 'fotos', inicio: Date.now() } : p));
    let intentosOcr = 0;
    let exactas = fotosRef.current.filter((f) => f.patente?.exacta).length;
    let motos = 0;
    let leidas = 0;
    const enTanda: Foto[] = [];
    for (let i = 0; i < nuevas.length; i++) {
      if (stopRef.current) break;
      const fuente = nuevas[i];
      setProgreso((p) => (p ? { ...p, hecho: i, actual: fuente.nombre } : p));
      try {
        const r = await leerFoto(fuente, analizador);
        // La misma foto con otro nombre (pasa con AUXILIO y GNC: el baúl con el cilindro) se usa una sola vez; la toma doble se asigna sola.
        const igual = [...fotosRef.current, ...enTanda].find((x) => x.dataUrl === r.dataUrl);
        if (igual) {
          const clave = clavePhoto(fuente.nombre, fuente.size);
          enTanda.forEach((x) => { if (x.id === igual.id) x.duplicadas = [...(x.duplicadas ?? []), clave]; });
          setFotos((prev) => prev.map((x) => (x.id === igual.id ? { ...x, duplicadas: [...(x.duplicadas ?? []), clave] } : x)));
          onNotify('info', 'Foto repetida', `${fuente.nombre} es igual a ${igual.nombre}: se usa una sola.`);
          setCola((c) => c.slice(1));
          continue;
        }
        const foto: Foto = {
          id: nuevoId(), nombre: fuente.nombre, size: fuente.size, ruta: fuente.ruta, dataUrl: r.dataUrl, miniatura: r.miniatura,
          fecha: r.fecha, nitidez: r.nitidez, tomasAuto: r.modelo?.tomas ?? [], tomaDudosa: r.modelo?.dudosa ?? false, tipoModelo: r.modelo?.tipo ?? undefined, clase: r.modelo?.vehiculo?.clase, revisada: false,
          relacion: r.modelo?.vehiculo ? (r.modelo.vehiculo.caja.x1 - r.modelo.vehiculo.caja.x0) / Math.max(1, r.modelo.vehiculo.caja.y1 - r.modelo.vehiculo.caja.y0) : undefined,
          caja: r.modelo?.vehiculo
            ? { x0: r.modelo.vehiculo.caja.x0 / r.lienzo.width, y0: r.modelo.vehiculo.caja.y0 / r.lienzo.height, x1: r.modelo.vehiculo.caja.x1 / r.lienzo.width, y1: r.modelo.vehiculo.caja.y1 / r.lienzo.height }
            : undefined,
        };
        if (foto.tipoModelo === 'moto') motos++;
        // La patente se busca en las primeras fotos (hasta dos lecturas seguras o seis intentos), como mucho.
        const puedeTenerPatente = !analizador || foto.tomasAuto.length === 0 || foto.tomasAuto.some((t) => t === 'FRENTE' || t === 'TRASERA');
        if (puedeTenerPatente && exactas < 2 && intentosOcr < 6 && !stopRef.current) {
          intentosOcr++;
          setProgreso((p) => (p ? { ...p, fase: 'patente' } : p));
          try {
            foto.patente = (await leerPatenteDeFoto(r.lienzo)) ?? undefined;
          } catch (e) {
            console.warn('OCR de patente no disponible:', e);
            intentosOcr = 99;
          }
          if (foto.patente?.exacta) exactas++;
          setProgreso((p) => (p ? { ...p, fase: 'fotos' } : p));
        }
        leidas++;
        enTanda.push(foto);
        setFotos((prev) => [...prev, foto]);
        if (foto.patente && !patenteManual.current && !patenteExactaRef.current) {
          if (foto.patente.exacta) {
            setPatente(foto.patente.patente);
            patenteExactaRef.current = true;
            setPatenteExacta(true);
            setSugerencia(null);
          } else {
            setSugerencia((actual) => actual ?? foto.patente!.patente);
          }
        }
      } catch (e: any) {
        onNotify('error', `No se pudo leer ${fuente.nombre}`, e?.message || String(e));
      }
      setCola((c) => c.slice(1));
    }
    if (!tipoManual.current && leidas > 0 && motos > leidas / 2) setTipo('moto');
    setCola([]);
    setProgreso(null);
    if (leidas > 0 && !stopRef.current) setSel((s) => s);
    if (stopRef.current) onNotify('info', 'Lectura detenida', 'Lo que ya se leyó queda en pantalla.');
  };

  const fuentesDeFiles = (files: File[]): FuenteConDatos[] =>
    files.filter(esImagen).map((f) => ({ nombre: f.name, size: f.size, leer: () => aDataUrl(f) }));

  const leer = async () => {
    if (ocupado) return;
    if (!isElectron()) {
      onNotify('info', 'Leer la carpeta', 'Leer la carpeta de Origen funciona en la app instalada. Acá usá «Agregar fotos…».');
      return;
    }
    const r = await listPhotoFiles(originPath);
    if (!r.success) {
      onNotify('error', 'No se pudo leer la carpeta de Origen', r.error);
      return;
    }
    const hechas = new Set(procesadas);
    const fuentes: FuenteConDatos[] = r.files
      .filter((f) => !hechas.has(clavePhoto(f.name, f.size)))
      .map((f) => ({
        nombre: f.name, size: f.size, ruta: f.path,
        leer: async () => {
          const res = await readPhotoFile(f.path);
          if (!res.success || !res.dataUrl) throw new Error(res.error || 'No se pudo abrir la foto.');
          return res.dataUrl;
        },
      }));
    await procesar(fuentes);
  };

  const nuevo = () => {
    if (ocupado) return;
    setFotos([]);
    setPatente('');
    setPatenteExacta(null);
    setSugerencia(null);
    setTipo('auto');
    tipoManual.current = false;
    patenteManual.current = false;
    patenteExactaRef.current = false;
    setSel({ fotoId: null, toma: null });
    setCopiado(null);
    setConfirmando(false);
  };

  // ---------- renombrar y copiar ----------
  const asignadas: FotoAsignada[] = fotos.map((f) => ({ fotoId: f.id, tomas: efectivas(f), nombreOriginal: f.nombre }));
  const limpia = normalizarPatente(patente);
  const plan = useMemo(() => {
    if (limpia.length < 1) return [];
    try { return planDeCopias(limpia, asignadas); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos, tipo, limpia]);

  const filasConfirmar: FilaConfirmar[] = plan.map((c) => {
    const foto = fotos.find((f) => f.id === c.fotoId)!;
    const tomas = efectivas(foto);
    const corta = ladosDe(foto).length > 0 && tomaPorId(c.toma)?.vistaCompleta;
    let aviso: FilaConfirmar['aviso'];
    if (corta) aviso = { tipo: 'corta', texto: 'Corta el vehículo' };
    else if (diagonalDe(foto)) aviso = { tipo: 'diagonal', texto: 'Salió en diagonal, no de perfil' };
    else if (tomas.length > 1) aviso = { tipo: 'copia', texto: c.toma === tomas[0] ? `La misma foto va también como ${tomas.slice(1).map((t) => tomaPorId(t)?.nombre).join(', ')}` : `Copia de ${tomaPorId(tomas[0])?.nombre}` };
    return { copia: c, original: foto.nombre, aviso };
  });

  const abrirConfirmar = () => {
    if (!puedeRenombrar) {
      onNotify('info', 'Todavía no se puede renombrar', fotos.length === 0 ? 'Primero leé o agregá las fotos del vehículo.' : 'Falta la patente o asignar la toma de alguna foto.');
      return;
    }
    if (mismaRuta(salida, originPath)) {
      onNotify('error', 'Carpeta de salida inválida', 'La carpeta de fotos renombradas no puede ser la misma que la de Origen. Cambiala en Configuración → Inspecciones.');
      return;
    }
    setConfirmando(true);
  };

  const ejecutarCopia = async () => {
    setCopiando(true);
    let ok = 0;
    const fallas: string[] = [];
    const hechasOk = new Set<string>();
    const fallo = new Set<string>();
    let ultima: string | undefined;
    for (const c of plan) {
      const foto = fotos.find((f) => f.id === c.fotoId)!;
      const r = await savePhotoToDestination(salida, c.nombre, foto.dataUrl);
      if (r.success) { ok++; ultima = r.path; hechasOk.add(foto.id); } else { fallas.push(`${c.nombre}: ${r.error}`); fallo.add(foto.id); }
    }
    const claves = fotos.filter((f) => hechasOk.has(f.id) && !fallo.has(f.id)).flatMap((f) => [clavePhoto(f.nombre, f.size), ...(f.duplicadas ?? [])]);
    setProcesadas(agregarProcesadas(localStorage, claves));
    setCopiando(false);
    setConfirmando(false);
    if (fallas.length === plan.length) {
      onNotify('error', 'No se pudo copiar', fallas[0]);
      return;
    }
    setCopiado({ archivos: ok, carpeta: salida, ruta: ultima, faltan: faltan.map((t) => tomaPorId(t)!.nombre) });
    onNotify(fallas.length ? 'info' : 'success', fallas.length ? `Se copiaron ${ok} archivos, ${fallas.length} fallaron` : `Listo: ${ok} archivos copiados`, fallas.length ? fallas[0] : `Quedaron en ${salida} como ${limpia}-TOMA.jpg. Las originales no se tocaron.`);
  };

  // ---------- menús ----------
  const abrirMenuFoto = (f: Foto, toma: TomaId | null, x: number, y: number, anchor?: HTMLElement) => {
    const lados = ladosDe(f);
    const def = toma ? tomaPorId(toma) : undefined;
    const items = buildInspFotoMenu(
      { tieneAviso: lados.length > 0 || diagonalDe(f) || f.nitidez < NITIDEZ_MINIMA || (f.tomaDudosa && !f.tomasManual), puedeMostrar: Boolean(f.ruta) && isElectron(), tieneMuestra: Boolean(def && muestraUrl(def.muestra[tipo])) },
      {
        ver: () => setGrande({ src: f.dataUrl, titulo: f.nombre }),
        cambiarToma: () => setModalTomas({ fotoId: f.id, modo: 'cambiar' }),
        tambienToma: () => setModalTomas({ fotoId: f.id, modo: 'tambien' }),
        marcarRevisada: () => setFotos((p) => p.map((x) => (x.id === f.id ? { ...x, revisada: true } : x))),
        verMuestra: () => def && setGrande({ src: muestraUrl(def.muestra[tipo])!, titulo: `Muestra: ${def.nombre}` }),
        mostrarEnCarpeta: () => f.ruta && void showInFolder(f.ruta),
        quitar: () => quitar(f.id),
      }
    );
    setMenuDe(f.id);
    openContextMenu({ x, y, items, anchor: anchor ?? null, onClose: () => setMenuDe(null) });
  };

  const abrirMenuEspacio = (x: number, y: number) => {
    openContextMenu({
      x, y,
      items: buildInspEmptyMenu(
        { ocupado, puedeRenombrar, hayFotos: fotos.length > 0, canOpen: isElectron() },
        { leer: () => void leer(), agregar: () => inputFotos.current?.click(), agregarCarpeta: () => inputCarpeta.current?.click(), renombrar: abrirConfirmar, nuevo, muestras: () => setVerMuestras(true), abrirSalida: () => void abrirSalidaCarpeta() }
      ),
    });
  };

  const abrirSalidaCarpeta = async () => {
    const r = await openFolder(salida);
    if (!r.success) onNotify('error', 'No se pudo abrir la carpeta', r.error || 'Todavía no se copió ninguna foto ahí.');
  };

  const quitar = (id: string) => {
    setFotos((p) => p.filter((x) => x.id !== id));
    setSel((s) => (s.fotoId === id ? { fotoId: null, toma: null } : s));
  };

  useImperativeHandle(ref, () => ({
    leer: () => void leer(),
    agregarFotos: () => inputFotos.current?.click(),
    agregarCarpeta: () => inputCarpeta.current?.click(),
    renombrar: abrirConfirmar,
    nuevo,
    verMuestras: () => setVerMuestras(true),
    abrirSalida: () => void abrirSalidaCarpeta(),
  }));

  // ---------- pieza: tarjeta de una toma ----------
  const renderTarjeta = (celda: Celda) => {
    const { foto, toma } = celda;
    const def: TomaDef | undefined = toma ? tomaPorId(toma) : undefined;
    const elegida = sel.toma === toma && sel.fotoId === (foto?.id ?? null);
    const lados = foto ? ladosDe(foto) : [];
    const diagonal = foto ? diagonalDe(foto) : false;
    const borrosa = foto ? foto.nitidez < NITIDEZ_MINIMA && !foto.revisada : false;
    const dudosa = foto ? foto.tomaDudosa && !foto.revisada && !foto.tomasManual : false;
    const estado: 'ok' | 'corta' | 'diagonal' | 'falta' | 'sin' | 'borrosa' | 'dudosa' = !foto ? 'falta' : lados.length ? 'corta' : diagonal ? 'diagonal' : !toma ? 'sin' : borrosa ? 'borrosa' : dudosa ? 'dudosa' : 'ok';
    const borde =
      estado === 'corta' || estado === 'diagonal' || estado === 'borrosa' || estado === 'sin' || estado === 'dudosa' ? 'border-amber-400 dark:border-amber-500'
      : estado === 'falta' ? 'border-dashed border-red-400 dark:border-red-500'
      : 'border-slate-200 dark:border-slate-700';
    const segunda = foto && toma && efectivas(foto).length > 1 && efectivas(foto)[0] !== toma;
    const nota = estado === 'corta' ? `Cortado por ${lados.map((l) => LADO_TEXTO[l]).join(' y ')}` : estado === 'diagonal' ? 'Sacala de perfil, no en diagonal' : segunda ? `Misma foto que ${tomaPorId(efectivas(foto)[0])?.nombre}` : foto?.nombre ?? 'Sin foto';
    const abrir = (x: number, y: number, anchor?: HTMLElement) => (foto ? abrirMenuFoto(foto, toma, x, y, anchor) : abrirMenuEspacio(x, y));
    return (
      <div
        key={celda.key}
        data-toma={toma ?? 'SIN-TOMA'}
        tabIndex={0}
        onClick={() => setSel({ fotoId: foto?.id ?? null, toma })}
        onDoubleClick={() => foto && setGrande({ src: foto.dataUrl, titulo: foto.nombre })}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSel({ fotoId: foto?.id ?? null, toma });
          abrir(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); abrir(0, 0, e.currentTarget); }
          else if (e.key === 'Enter' && foto) setGrande({ src: foto.dataUrl, titulo: foto.nombre });
          else if (e.key === 'Delete' && foto) quitar(foto.id);
        }}
        className={`sm-focusable ${menuDe === foto?.id ? 'sm-target ' : ''}cursor-pointer rounded-xl border-2 ${borde} ${elegida ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-100 dark:ring-offset-slate-950' : ''} bg-white dark:bg-slate-900 overflow-hidden flex flex-col`}
      >
        <div className="relative aspect-[16/8.2] bg-slate-200 dark:bg-slate-800 overflow-hidden">
          {foto && <img src={foto.miniatura} alt="" className="w-full h-full object-cover" />}
          {lados.map((l) => (
            <div key={l} className={`absolute bg-amber-400 ${l === 'izquierdo' ? 'inset-y-0 left-0 w-2' : l === 'derecho' ? 'inset-y-0 right-0 w-2' : l === 'superior' ? 'inset-x-0 top-0 h-2' : 'inset-x-0 bottom-0 h-2'}`} />
          ))}
          {estado === 'corta' && (
            <span className="absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-300 text-amber-950"><Scissors className="w-3 h-3" />Corta el vehículo</span>
          )}
          {estado === 'diagonal' && (
            <span className="absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-300 text-amber-950"><RotateCw className="w-3 h-3" />En diagonal</span>
          )}
          {estado === 'falta' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-red-600 dark:text-red-300 bg-red-50/70 dark:bg-red-950/30">
              <X className="w-6 h-6" /><span className="text-[11px] font-bold">No llegó esta foto</span>
            </div>
          )}
        </div>
        <div className="px-2 pt-1 pb-1.5 leading-tight">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-[11px] text-slate-900 dark:text-white truncate">{def?.nombre.toUpperCase() ?? 'SIN TOMA'}</span>
            {estado === 'ok' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><Check className="w-3 h-3" />Bien</span>}
            {estado === 'corta' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Revisar</span>}
            {estado === 'diagonal' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Revisar</span>}
            {estado === 'borrosa' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Movida</span>}
            {estado === 'sin' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Elegí la toma</span>}
            {estado === 'dudosa' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Confirmala</span>}
            {estado === 'falta' && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400"><X className="w-3 h-3" />Falta</span>}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">{nota}</div>
        </div>
      </div>
    );
  };


  // ---------- panel de la derecha ----------
  const fotoSel = fotos.find((f) => f.id === sel.fotoId) ?? null;
  const defSel = sel.toma ? tomaPorId(sel.toma) : undefined;
  const muestraSel = defSel ? muestraUrl(defSel.muestra[tipo]) : undefined;
  const ladosSel = fotoSel ? ladosDe(fotoSel) : [];
  const diagonalSel = fotoSel ? diagonalDe(fotoSel) : false;
  const fila = (ok: boolean | 'aviso', k: string, v: string) => (
    <div key={k} className="flex items-start gap-2 py-1 border-t border-slate-100 dark:border-slate-800 first:border-0">
      {ok === true ? <Check className="w-3.5 h-3.5 mt-px text-emerald-600 dark:text-emerald-400 shrink-0" /> : ok === 'aviso' ? <AlertTriangle className="w-3.5 h-3.5 mt-px text-amber-600 dark:text-amber-400 shrink-0" /> : <X className="w-3.5 h-3.5 mt-px text-red-600 dark:text-red-400 shrink-0" />}
      <div className="text-[11px] leading-tight"><span className="font-semibold text-slate-800 dark:text-slate-100">{k}: </span><span className="text-slate-600 dark:text-slate-300">{v}</span></div>
    </div>
  );

  const pct = progreso ? percent(progreso.hecho, progreso.total) : 0;

  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      onDragOver={(e) => { e.preventDefault(); if (!ocupado) setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        if (!ocupado && e.dataTransfer.files.length) void procesar(fuentesDeFiles(Array.from(e.dataTransfer.files)));
      }}
      onContextMenu={(e) => {
        if (e.defaultPrevented) return;
        if ((e.target as HTMLElement).closest('input, textarea, select, .fixed')) return;
        e.preventDefault();
        abrirMenuEspacio(e.clientX, e.clientY);
      }}
    >
      <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" id="insp-file-picker"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const fs: File[] = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fs.length) void procesar(fuentesDeFiles(fs)); }} />
      <input ref={inputCarpeta} type="file" // @ts-ignore
        webkitdirectory="" directory="" multiple className="hidden" id="insp-folder-picker"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const fs: File[] = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fs.length) void procesar(fuentesDeFiles(fs)); }} />

      {/* carpetas y botones de lectura (fijo) */}
      <div className="shrink-0 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] min-w-0">
            <div data-help="insp-origen" className="flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 min-w-0" title={`Carpeta de Origen: ${originPath}`}>
              <FolderInput className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Origen:</span>
              <span className="text-slate-800 dark:text-slate-200 truncate max-w-[220px]">{originPath}</span>
            </div>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <div data-help="insp-salida" className="flex items-center gap-1.5 bg-white dark:bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/80 min-w-0" title={`Fotos renombradas: ${salida}`}>
              <FolderOutput className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-sans font-semibold text-slate-500 dark:text-slate-400">Fotos renombradas:</span>
              <span className="text-slate-800 dark:text-slate-200 truncate max-w-[260px]">{salida}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 font-sans shrink-0">
            <button id="btn-insp-leer" data-help="insp-leer" onClick={() => void leer()} disabled={ocupado} className={btnAzul} title="Lee las fotos de UN vehículo que están en la carpeta de Origen (no se leen solas) — Ctrl+L">
              <ScanSearch className="w-3.5 h-3.5" /><span>Leer fotos nuevas{pendientes ? ` (${pendientes})` : ''}</span>
            </button>
            <button id="btn-insp-agregar" data-help="insp-agregar" onClick={() => inputFotos.current?.click()} disabled={ocupado} className={btnNeutro} title="Elegir fotos con el selector de Windows (Ctrl+O)">
              <ImagePlus className="w-3.5 h-3.5 text-blue-500" /><span>Agregar fotos…</span>
            </button>
            <div data-help="insp-estado" className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{fotos.length} fotos</span>
              {avisos.length > 0 && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold"><span className="w-2 h-2 rounded-full bg-amber-500" />{avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}</span>}
            </div>
            <button onClick={onOpenSettings} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors">
              <Settings className="w-3 h-3" /><span>Configurar</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`flex-1 min-h-0 flex flex-col gap-2 px-4 py-2 ${arrastrando ? 'outline outline-2 outline-dashed outline-blue-500 -outline-offset-4 rounded-xl' : ''}`}>
        {progreso && (
          <div className="shrink-0 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 space-y-1.5" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{progreso.parando ? 'Deteniendo… termina la foto que está leyendo' : progreso.fase === 'modelos' ? 'Preparando el reconocimiento… (la primera vez tarda unos segundos)' : `${progreso.fase === 'patente' ? 'Leyendo la patente' : 'Leyendo fotos'}: ${progreso.hecho} de ${progreso.total} (${pct} %)`}</span>
              </div>
              <button id="btn-insp-detener" data-help="insp-detener" type="button" disabled={progreso.parando}
                onClick={() => { stopRef.current = true; setProgreso((p) => (p ? { ...p, parando: true } : p)); }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-800 text-white shadow-xs disabled:opacity-60 transition-colors">
                <Square className="w-3 h-3 fill-current" /><span>Detener</span>
              </button>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">Ahora: <strong className="text-slate-800 dark:text-slate-200">{progreso.actual}</strong></span>
              <span className="shrink-0">{etaText(Date.now() - progreso.inicio, progreso.hecho, progreso.total)}</span>
            </div>
          </div>
        )}

        {fotos.length === 0 && !progreso ? (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="shrink-0 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-4 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><UploadCloud className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Arrastrá acá las fotos de UN vehículo, o apretá «Leer fotos nuevas»</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Si en la carpeta de Origen hay fotos de otro vehículo, sacalas antes de leer.</p>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Así tienen que ser las fotos (muestras)</p>
              <MuestrasContenido />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex gap-2">
            <section className="min-w-0 flex-1 flex flex-col gap-2">
              <div className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2" data-help="insp-patente">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Patente</span>
                  <input
                    id="insp-patente-input"
                    value={patente}
                    onChange={(e) => { setPatente(e.target.value.toUpperCase()); setPatenteExacta(null); patenteExactaRef.current = false; patenteManual.current = true; }}
                    maxLength={10}
                    disabled={Boolean(copiado)}
                    placeholder="Sin leer"
                    className="field-soft w-36 px-2.5 py-1 rounded-lg font-mono font-bold text-base tracking-wider"
                  />
                </label>
                <div className="flex items-center gap-1.5" data-help="insp-tipo">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tipo</span>
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <button type="button" aria-pressed={tipo === 'auto'} onClick={() => { tipoManual.current = true; setTipo('auto'); }} className={segmento(tipo === 'auto')}>Auto</button>
                    <button type="button" aria-pressed={tipo === 'moto'} onClick={() => { tipoManual.current = true; setTipo('moto'); }} className={segmento(tipo === 'moto')}>Moto</button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs" data-help="insp-fecha">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Fecha</span>
                  {fechaVehiculo ? (
                    <>
                      <strong className="text-slate-900 dark:text-white">{formatoFecha(fechaVehiculo.iso)}</strong>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                        title={fechaVehiculo.origen === 'WhatsApp' ? 'WhatsApp borra la fecha en que se sacó la foto: se usa la fecha en que se envió' : 'Fecha en que se sacó la foto (metadatos)'}>
                        {fechaVehiculo.origen === 'WhatsApp' ? 'WhatsApp' : 'Metadatos'}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">sin fecha</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button id="btn-insp-nuevo" data-help="insp-nuevo-boton" onClick={nuevo} disabled={ocupado} className={copiado ? btnAzul : btnNeutro} title="Limpia la pantalla para empezar con otro vehículo (Ctrl+N)">
                    <RotateCcw className={`w-3.5 h-3.5 ${copiado ? '' : 'text-violet-500'}`} /><span>Nuevo vehículo</span>
                  </button>
                  {!copiado && (
                    <button id="btn-insp-renombrar" data-help="insp-renombrar-boton" onClick={abrirConfirmar} disabled={!puedeRenombrar} className={btnVerde} title="Renombra y copia las fotos a la carpeta de salida (Ctrl+Intro)">
                      <Check className="w-3.5 h-3.5" /><span>Renombrar y copiar {nFotosConToma} {nFotosConToma === 1 ? 'foto' : 'fotos'}</span>
                    </button>
                  )}
                </div>
                <p className="basis-full text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                  {copiado
                    ? `Los ${copiado.archivos} archivos quedaron copiados en ${copiado.carpeta}. Para otro vehículo, apretá «Nuevo vehículo».`
                    : patenteExacta === true ? 'La app leyó la patente de una foto. Revisala y corregila si hace falta antes de renombrar.'
                    : normalizarPatente(patente) ? (patenteExacta === false ? 'La patente viene de una lectura dudosa: revisala con atención antes de renombrar.' : 'Patente escrita a mano.')
                    : sugerencia ? (
                      <>
                        Lectura dudosa: ¿será <strong className="font-mono text-slate-800 dark:text-slate-100">{sugerencia}</strong>?{' '}
                        <button
                          type="button"
                          onClick={() => { setPatente(sugerencia); setPatenteExacta(false); patenteExactaRef.current = false; patenteManual.current = true; setSugerencia(null); }}
                          className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2"
                        >
                          Usar esta
                        </button>
                        . Si no, escribila a mano.
                      </>
                    )
                    : 'No se pudo leer la patente: escribila a mano.'}
                </p>
              </div>

              {copiado ? (
                <div role="status" className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200">
                  <Check className="w-4 h-4 shrink-0" />
                  <span className="flex-1"><strong>Listo:</strong> {copiado.archivos} archivos copiados con el nombre {limpia}-TOMA.jpg.{copiado.faltan.length ? ` Faltó: ${copiado.faltan.join(', ')}.` : ''}</span>
                  {copiado.ruta && isElectron() && (
                    <button type="button" onClick={() => void showInFolder(copiado.ruta!)} className={btnNeutro}><Folder className="w-3.5 h-3.5 text-blue-500" />Ver carpeta</button>
                  )}
                </div>
              ) : avisos.length > 0 && !progreso ? (
                <div role="status" className="shrink-0 flex items-start gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span><strong>{avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}:</strong> {avisos.join(' · ')}. Podés renombrar igual; lo que tiene aviso queda marcado.</span>
                </div>
              ) : null}

              <div id="zona-grilla" data-help="insp-fotos" className="flex-1 min-h-0 overflow-y-auto pr-1">
                <div className={`grid ${celdas.length > 8 ? 'grid-cols-5' : 'grid-cols-4'} gap-2.5`}>
                  {celdas.filter((c) => !(progreso && c.toma && !c.foto)).map((c) => renderTarjeta(c))}
                  {cola.slice(0, 12).map((n) => (
                    <div key={`cola-${n}`} className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="aspect-[16/8.2] bg-slate-200 dark:bg-slate-800 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-[11px] font-semibold">Esperando su turno…</span></div>
                      <div className="px-2 pt-1 pb-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">{n}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside data-help="insp-comparar" className="w-[330px] shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-baseline gap-2">
                <h2 className="font-semibold text-sm text-slate-900 dark:text-white">{progreso ? 'Leyendo…' : defSel ? defSel.nombre : fotoSel ? 'Foto sin toma' : 'Foto elegida'}</h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">tu foto contra la muestra</span>
              </div>
              {progreso ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-semibold p-3 text-center"><Loader2 className="w-7 h-7 animate-spin" />Leyendo las fotos…</div>
              ) : !sel.fotoId && !sel.toma ? (
                <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-slate-500 dark:text-slate-400">Tocá una foto para verla junto a su muestra y ver qué encontró la app.</div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Tu foto</div>
                      <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {fotoSel ? <img src={fotoSel.miniatura} alt="" className="w-full h-full object-contain" /> : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-red-600 dark:text-red-300 bg-red-50/80 dark:bg-red-950/40"><X className="w-6 h-6" /><span className="text-[10px] font-bold">No llegó</span></div>
                        )}
                        {ladosSel.map((l) => (
                          <div key={l} className={`absolute bg-amber-400 ${l === 'izquierdo' ? 'inset-y-0 left-0 w-1.5' : l === 'derecho' ? 'inset-y-0 right-0 w-1.5' : l === 'superior' ? 'inset-x-0 top-0 h-1.5' : 'inset-x-0 bottom-0 h-1.5'}`} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Muestra</div>
                      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {muestraSel ? <img src={muestraSel} alt="" className="w-full h-full object-cover" /> : defSel && (defSel.id === 'CEDULA_FRENTE' || defSel.id === 'CEDULA_DORSO') ? <CedulaDibujo /> : null}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-0.5">
                    {!fotoSel ? (
                      <>
                        {fila(false, "Falta", `${defSel?.nombre}: no llegó ninguna foto con esta toma`)}
                        {fila("aviso", "Qué pedir", "una foto como la muestra de al lado")}
                      </>
                    ) : (
                      <>
                        {fila(efectivas(fotoSel).length > 0 ? true : 'aviso', "Toma", efectivas(fotoSel).length === 0 ? 'sin asignar: elegila con el clic derecho' : fotoSel.tomasManual ? `elegida a mano: ${efectivas(fotoSel).map((t) => tomaPorId(t)?.nombre).join(' y ')}` : `reconocida como ${efectivas(fotoSel).map((t) => tomaPorId(t)?.nombre).join(' y ')}${fotoSel.tomaDudosa && !fotoSel.revisada ? ' (poco segura: confirmala o cambiala)' : ''}`)}
                        {fotoSel.caja
                          ? fila(ladosSel.length ? 'aviso' : true, "Encuadre", ladosSel.length ? `corta el vehículo por ${ladosSel.map((l) => LADO_TEXTO[l]).join(' y ')}` : efectivas(fotoSel).some((t) => tomaPorId(t)?.vistaCompleta) ? 'vehículo completo, sin cortes' : 'no se revisa en esta toma')
                          : fila('aviso', "Encuadre", efectivas(fotoSel).some((t) => tomaPorId(t)?.vistaCompleta) ? 'sin revisar: no se detectó el vehículo en la foto' : 'no se revisa en esta toma')}
                        {efectivas(fotoSel).some((t) => t === 'CONDUCTOR' || t === 'ACOMPANANTE') && tipo === 'auto' && fila(diagonalSel ? 'aviso' : true, "Ángulo", diagonalSel ? 'salió en diagonal: tiene que ser de perfil' : fotoSel.relacion === undefined ? 'sin revisar: no se detectó el vehículo' : 'de perfil')}
                        {fila(fotoSel.nitidez >= NITIDEZ_MINIMA ? true : 'aviso', "Nitidez", fotoSel.nitidez >= NITIDEZ_MINIMA ? 'bien' : 'movida o sin foco')}
                        {fotoSel.fecha && fila(true, "Fecha", `${formatoFecha(fotoSel.fecha.iso)} (${fotoSel.fecha.origen === 'WhatsApp' ? 'de WhatsApp' : 'metadatos'})`)}
                      </>
                    )}
                  </div>
                  {fotoSel && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setGrande({ src: fotoSel.dataUrl, titulo: fotoSel.nombre })} className={btnNeutro}><Eye className="w-3.5 h-3.5 text-blue-500" />Ver grande</button>
                      <button type="button" onClick={() => setModalTomas({ fotoId: fotoSel.id, modo: 'cambiar' })} className={btnNeutro}>Cambiar la toma…</button>
                      {(ladosSel.length > 0 || diagonalSel || fotoSel.nitidez < NITIDEZ_MINIMA || (fotoSel.tomaDudosa && !fotoSel.tomasManual)) && !fotoSel.revisada && (
                        <button type="button" onClick={() => setFotos((p) => p.map((x) => (x.id === fotoSel.id ? { ...x, revisada: true } : x)))} className={btnNeutro}><Check className="w-3.5 h-3.5 text-emerald-500" />Marcar como revisada</button>
                      )}
                    </div>
                  )}
                  {fotos.length > 0 && modeloOk === false && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">No se pudieron cargar los modelos de reconocimiento, así que la toma de cada foto se elige a mano (clic derecho) y no se revisa si corta el vehículo.</p>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {modalTomas && (() => {
        const f = fotos.find((x) => x.id === modalTomas.fotoId);
        if (!f) return null;
        return (
          <TomasModal
            modo={modalTomas.modo}
            tipo={tipo}
            actuales={modalTomas.modo === 'cambiar' ? efectivas(f).slice(0, 1) : efectivas(f)}
            onClose={() => setModalTomas(null)}
            onGuardar={(tomas) => {
              setFotos((p) => p.map((x) => (x.id === f.id ? { ...x, tomasManual: tomas, revisada: false } : x)));
              setSel({ fotoId: f.id, toma: tomas[0] ?? null });
              setModalTomas(null);
            }}
          />
        );
      })()}
      {grande && <FotoGrandeModal src={grande.src} titulo={grande.titulo} onClose={() => setGrande(null)} />}
      {verMuestras && <MuestrasModal onClose={() => setVerMuestras(false)} />}
      {confirmando && (
        <ConfirmarRenombradoModal
          patente={patente}
          onPatente={(v) => { setPatente(v); setPatenteExacta(null); patenteExactaRef.current = false; patenteManual.current = true; }}
          descripcion={`${tipo === 'auto' ? 'Auto' : 'Moto'} · ${fechaVehiculo ? `${formatoFecha(fechaVehiculo.iso)} (${fechaVehiculo.origen === 'WhatsApp' ? 'WhatsApp' : 'metadatos'})` : 'sin fecha'} · ${tomasDe(tipo).length - faltan.length} de ${tomasDe(tipo).length} tomas`}
          filas={filasConfirmar}
          faltan={faltan.map((t) => tomaPorId(t)!.nombre)}
          carpetaSalida={salida}
          enCurso={copiando}
          onConfirmar={() => void ejecutarCopia()}
          onClose={() => { if (!copiando) setConfirmando(false); closeContextMenu(); }}
        />
      )}
    </div>
  );
});
InspeccionesView.displayName = 'InspeccionesView';
