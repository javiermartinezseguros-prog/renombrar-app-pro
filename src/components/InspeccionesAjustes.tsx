import React from 'react';
import { AlertTriangle, Folder, FolderInput, FolderOutput, Minus, Plus } from 'lucide-react';
import { INSP_PARAM_SPEC, angleError, clampAngle, clampMargin, marginError } from '../utils/inspecciones/config';
import { TipoVehiculo, TomaId, tomasDe } from '../utils/inspecciones/tomas';

const fmt = (n: number) => String(n).replace('.', ',');

interface Props {
  origen: string;
  salida: string;
  salidaEfectiva: string;
  onSalida: (valor: string) => void;
  onElegirSalida: () => void;
  conflicto: boolean;
  margen: string;
  onMargen: (valor: string) => void;
  angulo: string;
  onAngulo: (valor: string) => void;
  requeridasAuto: TomaId[];
  requeridasMoto: TomaId[];
  onAlternar: (tipo: TipoVehiculo, id: TomaId) => void;
  onFabrica: () => void;
}

/** Interruptor Sí/No (norma 18): verde = Sí; siempre dice «Sí» o «No» y lleva ✓ / ✕, nada depende solo del color. */
const Interruptor: React.FC<{ activo: boolean; etiqueta: string; onCambiar: () => void }> = ({ activo, etiqueta, onCambiar }) => (
  <div className="flex items-center justify-between gap-2 py-0.5">
    <span className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer" onClick={onCambiar}>{etiqueta}</span>
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambiar}
      className="inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-blue-500 rounded-full"
    >
      <span className={`text-[11px] font-bold w-5 text-right ${activo ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>{activo ? 'Sí' : 'No'}</span>
      <span className={`relative inline-block w-[34px] h-[19px] rounded-full border transition-colors ${activo ? 'bg-emerald-600 border-emerald-700' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
        <span className={`absolute top-[1px] w-[15px] h-[15px] rounded-full bg-white shadow flex items-center justify-center text-[9px] font-bold transition-all ${activo ? 'left-[16px] text-emerald-700' : 'left-[1px] text-slate-500'}`}>{activo ? '✓' : '✕'}</span>
      </span>
    </button>
  </div>
);

/** Pestaña «Inspecciones» del cuadro de Configuración. */
export const InspeccionesAjustes: React.FC<Props> = ({
  origen, salida, salidaEfectiva, onSalida, onElegirSalida, conflicto, margen, onMargen, angulo, onAngulo, requeridasAuto, requeridasMoto, onAlternar, onFabrica,
}) => {
  const spec = INSP_PARAM_SPEC.marginPct;
  const error = marginError(margen);
  const actual = clampMargin(margen);
  const bump = (dir: 1 | -1) => onMargen(fmt(clampMargin(actual + dir * spec.step)));
  const specA = INSP_PARAM_SPEC.angleRigor;
  const errorA = angleError(angulo);
  const actualA = clampAngle(angulo);
  const bumpA = (dir: 1 | -1) => onAngulo(fmt(clampAngle(actualA + dir * specA.step)));
  return (
    <>
      <div className="space-y-4 min-w-0" data-help="settings-insp-salida">
        <div className="space-y-1.5">
          <div className="block text-xs font-semibold text-slate-700 dark:text-slate-300">📁 Carpeta de Origen (la misma que usan las pólizas)</div>
          <div className="relative">
            <FolderInput className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input readOnly value={origen} aria-label="Carpeta de Origen" className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300" />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Se cambia en la pestaña Pólizas. Las fotos no se leen solas: las leés con «Leer fotos nuevas». Se lee un vehículo a la vez.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cfg-insp-salida" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">📂 Carpeta de fotos renombradas</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOutput className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="cfg-insp-salida"
                type="text"
                value={salida}
                onChange={(e) => onSalida(e.target.value)}
                placeholder={salidaEfectiva}
                className="field-soft w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl"
              />
            </div>
            <button type="button" onClick={onElegirSalida} className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-emerald-500" />
              <span>Examinar</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Las fotos se guardan directo en esta carpeta, sin subcarpetas: <code className="font-mono text-blue-600 dark:text-blue-400">AB123CD-FRENTE.jpg</code>. Vacía = «Inspecciones» dentro del Origen.
          </p>
          {conflicto && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs flex items-start gap-2 text-red-800 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>La carpeta de fotos renombradas no puede ser la misma que la de Origen: las fotos ya copiadas volverían a leerse.</span>
            </div>
          )}
        </div>

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pt-1">Parámetros</h4>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="param-insp-margen" className="text-xs font-bold text-slate-900 dark:text-white">Cuánto se puede acercar al borde</label>
            <div className="flex items-center rounded-xl field-soft overflow-hidden" style={{ padding: 0 }}>
              <button type="button" aria-label="Bajar el margen" onClick={() => bump(-1)} className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"><Minus className="w-4 h-4" /></button>
              <input
                id="param-insp-margen"
                type="text"
                inputMode="decimal"
                value={margen}
                onChange={(e) => onMargen(e.target.value)}
                aria-invalid={Boolean(error)}
                className="w-14 h-8 text-center text-sm font-bold bg-transparent text-slate-900 dark:text-white outline-none"
              />
              <span className="pr-1 text-xs text-slate-500 dark:text-slate-400">%</span>
              <button type="button" aria-label="Subir el margen" onClick={() => bump(1)} className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">Si el vehículo se acerca al borde de la foto más que este porcentaje, avisa «corta el vehículo».</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Ejemplo: 0,5 % de la foto.</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">De {fmt(spec.min)} a {fmt(spec.max)} % · de fábrica {fmt(spec.factory)} %</p>
          {error && <p role="alert" className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="param-insp-angulo" className="text-xs font-bold text-slate-900 dark:text-white">Rigor con las fotos en diagonal</label>
            <div className="flex items-center rounded-xl field-soft overflow-hidden" style={{ padding: 0 }}>
              <button type="button" aria-label="Bajar el rigor" onClick={() => bumpA(-1)} className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"><Minus className="w-4 h-4" /></button>
              <input
                id="param-insp-angulo"
                type="text"
                inputMode="numeric"
                value={angulo}
                onChange={(e) => onAngulo(e.target.value)}
                aria-invalid={Boolean(errorA)}
                className="w-14 h-8 text-center text-sm font-bold bg-transparent text-slate-900 dark:text-white outline-none"
              />
              <button type="button" aria-label="Subir el rigor" onClick={() => bumpA(1)} className="w-8 h-8 flex items-center justify-center text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">Los costados (conductor y acompañante) tienen que salir de perfil. Con más rigor avisa «en diagonal» aunque la foto esté apenas torcida; con 0 no avisa nunca.</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Ejemplo: 5 avisa las fotos claramente en diagonal; 8 también las apenas torcidas.</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">De {specA.min} a {specA.max} · de fábrica {specA.factory}</p>
          {errorA && <p role="alert" className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{errorA}</p>}
        </div>
      </div>

      <div className="space-y-2 min-w-0" data-help="settings-insp-tomas">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tomas obligatorias (si falta una, avisa)</h4>
        <div className="grid grid-cols-2 gap-x-6">
          {(['auto', 'moto'] as TipoVehiculo[]).map((tipo) => (
            <div key={tipo}>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 pb-1 border-b border-slate-200 dark:border-slate-700 mb-1">{tipo === 'auto' ? 'Auto' : 'Moto'}</div>
              {tomasDe(tipo).map((t) => {
                const lista = tipo === 'auto' ? requeridasAuto : requeridasMoto;
                return <Interruptor key={t.id} activo={lista.includes(t.id)} etiqueta={t.nombre} onCambiar={() => onAlternar(tipo, t.id)} />;
              })}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">De fábrica: todas en «Sí». Apagá las que no pidan en tu trabajo.</p>
        <div className="flex items-center justify-between gap-3 text-[11px] pt-1">
          <button type="button" onClick={onFabrica} className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100">
            Volver a los valores de fábrica
          </button>
          <span className="text-slate-500 dark:text-slate-400">Se aplica al guardar, sin reiniciar.</span>
        </div>
      </div>
    </>
  );
};
