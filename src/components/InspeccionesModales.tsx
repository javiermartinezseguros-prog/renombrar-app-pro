import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, AlertTriangle, Info, ArrowRight, Loader2 } from 'lucide-react';
import { CopiaPlan, TipoVehiculo, TomaId, tomaPorId, tomasDe } from '../utils/inspecciones/tomas';
import { esPatenteValida, normalizarPatente } from '../utils/inspecciones/patente';
import { muestraUrl } from '../utils/inspecciones/muestras';

const useEscape = (onClose: () => void) =>
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

const Marco: React.FC<{ ancho?: string; children: React.ReactNode; onClose: () => void; label: string }> = ({ ancho = 'max-w-3xl', children, onClose, label }) => {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 ${ancho} w-full max-h-[calc(100vh-32px)] flex flex-col overflow-hidden`}
      >
        {children}
      </motion.div>
    </div>
  );
};

const Cabecera: React.FC<{ icono: React.ReactNode; titulo: string; sub?: string; onClose: () => void; tono?: string }> = ({ icono, titulo, sub, onClose, tono = 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' }) => (
  <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-xl ${tono}`}>{icono}</div>
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{titulo}</h3>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
    </div>
    <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <X className="w-5 h-5" />
    </button>
  </div>
);

const btnCancelar = 'px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';
const btnVerde = 'px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed';

/** Dibujo de una cédula verde (no hay muestra real de ella). */
export const CedulaDibujo: React.FC = () => (
  <svg viewBox="0 0 160 90" className="w-full h-full" aria-hidden>
    <rect width="160" height="90" fill="#bfe3c6" />
    <rect x="22" y="14" width="116" height="62" rx="5" fill="#e9f6ec" stroke="#2f9e4f" />
    <rect x="32" y="24" width="52" height="6" rx="3" fill="#2f9e4f" />
    <rect x="32" y="38" width="96" height="4" rx="2" fill="#7bbf8e" />
    <rect x="32" y="48" width="80" height="4" rx="2" fill="#7bbf8e" />
  </svg>
);

const GrillaMuestras: React.FC<{ titulo: string; tipo: TipoVehiculo }> = ({ titulo, tipo }) => {
  const tomas = tomasDe(tipo);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 min-w-0">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
        {titulo} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">· {tomas.length} tomas</span>
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {tomas.map((t) => {
          const url = muestraUrl(t.muestra[tipo]);
          return (
            <div key={t.id} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
              <div className="aspect-[16/9] bg-slate-200 dark:bg-slate-800">{url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <CedulaDibujo />}</div>
              <div className="px-1.5 py-1 text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">{t.nombre}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Las dos grillas de muestras: es la guía de cómo tienen que ser las fotos. */
export const MuestrasContenido: React.FC = () => (
  <div className="grid grid-cols-2 gap-2.5">
    <GrillaMuestras titulo="Auto, camioneta, colectivo" tipo="auto" />
    <GrillaMuestras titulo="Moto" tipo="moto" />
  </div>
);

export const MuestrasModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Marco ancho="max-w-5xl" onClose={onClose} label="Muestras">
    <Cabecera icono={<Info className="w-5 h-5" />} titulo="Así tienen que ser las fotos" sub="Una muestra por toma (los vehículos de las fotos son solo de ejemplo)" onClose={onClose} />
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <MuestrasContenido />
    </div>
  </Marco>
);

export const FotoGrandeModal: React.FC<{ src: string; titulo: string; onClose: () => void }> = ({ src, titulo, onClose }) => (
  <Marco ancho="max-w-5xl" onClose={onClose} label={titulo}>
    <Cabecera icono={<Info className="w-5 h-5" />} titulo={titulo} onClose={onClose} />
    <div className="flex-1 min-h-0 overflow-auto bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
      <img src={src} alt={titulo} className="max-w-full max-h-[calc(100vh-140px)] object-contain" />
    </div>
  </Marco>
);

interface TomasModalProps {
  modo: 'cambiar' | 'tambien';
  tipo: TipoVehiculo;
  actuales: TomaId[];
  onGuardar: (tomas: TomaId[]) => void;
  onClose: () => void;
}

/** Elegir la toma de una foto: «cambiar» deja una sola; «también» suma otra (una foto puede valer por dos tomas). */
export const TomasModal: React.FC<TomasModalProps> = ({ modo, tipo, actuales, onGuardar, onClose }) => {
  const [elegidas, setElegidas] = useState<TomaId[]>(actuales);
  const alternar = (id: TomaId) =>
    setElegidas((prev) => (modo === 'cambiar' ? [id] : prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <Marco ancho="max-w-2xl" onClose={onClose} label="Elegir la toma">
      <Cabecera
        icono={<Check className="w-5 h-5" />}
        titulo={modo === 'cambiar' ? 'Cambiar la toma' : 'Usar también como otra toma'}
        sub={modo === 'cambiar' ? 'Elegí qué toma es esta foto' : 'Tildá las tomas para las que sirve esta foto (por ejemplo AUXILIO y GNC)'}
        onClose={onClose}
      />
      <div className="px-6 py-4 grid grid-cols-3 gap-2 overflow-y-auto">
        {tomasDe(tipo).map((t) => {
          const on = elegidas.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => alternar(t.id)}
              aria-pressed={on}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                on ? 'bg-blue-600 border-blue-700 text-white' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-white text-blue-700 border-white' : 'border-slate-400'}`}>{on && <Check className="w-3 h-3" />}</span>
              {t.nombre}
            </button>
          );
        })}
      </div>
      <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={onClose} className={btnCancelar}>Cancelar</button>
        <button type="button" onClick={() => onGuardar(elegidas)} className={btnVerde}>
          <Check className="w-4 h-4" />Guardar
        </button>
      </div>
    </Marco>
  );
};

export interface FilaConfirmar {
  copia: CopiaPlan;
  original: string;
  aviso?: { tipo: 'corta' | 'diagonal' | 'copia'; texto: string };
}

interface ConfirmarProps {
  patente: string;
  onPatente: (valor: string) => void;
  descripcion: string;
  filas: FilaConfirmar[];
  faltan: string[];
  carpetaSalida: string;
  enCurso: boolean;
  onConfirmar: () => void;
  onClose: () => void;
}

/** Último paso antes de copiar: se ve cómo se va a llamar cada foto y se puede corregir la patente. */
export const ConfirmarRenombradoModal: React.FC<ConfirmarProps> = ({ patente, onPatente, descripcion, filas, faltan, carpetaSalida, enCurso, onConfirmar, onClose }) => {
  const limpia = normalizarPatente(patente);
  const formatoRaro = limpia.length > 0 && !esPatenteValida(limpia);
  return (
    <Marco onClose={enCurso ? () => {} : onClose} label="Renombrar y copiar">
      <Cabecera
        icono={<Check className="w-5 h-5" />}
        tono="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
        titulo={`Renombrar y copiar — ${limpia || 'sin patente'}`}
        sub={descripcion}
        onClose={onClose}
      />
      <div className="px-6 pt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="insp-confirm-patente" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Patente</label>
        <input
          id="insp-confirm-patente"
          value={patente}
          onChange={(e) => onPatente(e.target.value.toUpperCase())}
          maxLength={10}
          className="field-soft w-36 px-2.5 py-1 rounded-lg font-mono font-bold tracking-wider"
        />
        <span className="text-[11px] text-slate-500 dark:text-slate-400">Si la corregís acá, cambia el nombre de todas las fotos.</span>
        {formatoRaro && (
          <span role="alert" className="basis-full text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            No parece una patente argentina (ABC123, AB123CD, 123ABC o A123BCD). Revisala antes de copiar.
          </span>
        )}
      </div>
      <div className="px-6 py-3 flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white dark:bg-slate-900 text-[11px] text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-semibold py-1">Foto original</th>
              <th />
              <th className="text-left font-semibold py-1">Nombre nuevo</th>
              <th className="text-left font-semibold py-1">Aviso</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800 h-[27px]">
                <td className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{f.original}</td>
                <td className="px-2 text-slate-400"><ArrowRight className="w-3 h-3" /></td>
                <td className="font-mono font-semibold text-slate-900 dark:text-white">{f.copia.nombre}</td>
                <td>
                  {f.aviso ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${f.aviso.tipo !== 'copia' ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-300'}`}>
                      {f.aviso.tipo !== 'copia' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      {f.aviso.texto}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400"><Check className="w-3 h-3" />Bien</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-6 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
        Se copian a <code className="font-mono text-blue-600 dark:text-blue-400">{carpetaSalida}</code> (sin subcarpetas). Las originales no se tocan y nunca se pisa un archivo (si ya existe, se agrega «(2)»).
        {faltan.length > 0 && <> Falta: {faltan.join(', ')}.</>}
      </div>
      <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={onClose} disabled={enCurso} className={btnCancelar}>Cancelar</button>
        <button type="button" onClick={onConfirmar} disabled={enCurso || limpia.length < 5 || filas.length === 0} className={btnVerde}>
          {enCurso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {enCurso ? 'Copiando…' : `Renombrar y copiar ${filas.length} ${filas.length === 1 ? 'archivo' : 'archivos'}`}
        </button>
      </div>
    </Marco>
  );
};

export const nombreDeToma = (id: TomaId): string => tomaPorId(id)?.nombre ?? id;
