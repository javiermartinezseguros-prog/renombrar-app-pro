import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Globito de ayuda que aparece al instante al apoyar el mouse (o al enfocar con el teclado).
 * Se dibuja fuera de la tabla, así no lo corta el marco con desplazamiento.
 */
export const FloatTip: React.FC<{ content: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  content,
  children,
  className,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = 340;
    const x = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const above = r.bottom + 140 > window.innerHeight;
    setPos({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };

  return (
    <span
      className={className}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', left: pos.x, top: pos.y, width: 340, transform: pos.above ? 'translateY(-100%)' : undefined }}
            className="z-[60] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-xl p-3 text-xs leading-snug pointer-events-none"
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
};
