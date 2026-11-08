import React, { useEffect, useRef, useState } from 'react';
import { closeContextMenu, openContextMenu } from '../utils/contextMenu';
import { BarMenu, parseLabel } from '../utils/menuModel';

interface MenuBarProps {
  menus: BarMenu[];
}

/**
 * Barra de menús de la ventana (Archivo · Ver · Configuración · Ayuda). Cada menú se
 * despliega con el mismo motor que el clic derecho (utils/contextMenu.ts).
 * Teclado: Alt + la letra subrayada, F10 abre el primero, ← → pasan de un menú a otro,
 * Esc cierra. Con el mouse: un clic abre; con uno abierto, pasar por otro lo cambia.
 */
export const MenuBar: React.FC<MenuBarProps> = ({ menus }) => {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const openIndex = useRef<number | null>(null);
  const [openUi, setOpenUi] = useState<number | null>(null);
  // Un clic sobre el menú ya abierto lo cierra: el mousedown que lo cierra no debe volver a abrirlo.
  const lastClosed = useRef({ index: -1, at: 0 });
  const menusRef = useRef(menus);
  menusRef.current = menus;

  const openMenu = (index: number, viaKeyboard: boolean) => {
    const button = buttons.current[index];
    const menu = menusRef.current[index];
    if (!button || !menu) return;
    openContextMenu({
      x: 0,
      y: 0,
      anchor: button,
      anchorBelow: true,
      highlightFirst: viaKeyboard,
      items: menu.items,
      onHorizontal: (dir) => {
        const n = menusRef.current.length;
        openMenu((index + dir + n) % n, true);
      },
      onClose: () => {
        if (openIndex.current === index) {
          openIndex.current = null;
          setOpenUi(null);
        }
        lastClosed.current = { index, at: Date.now() };
      },
    });
    openIndex.current = index;
    setOpenUi(index);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openMenu(0, true);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();
        const at = menusRef.current.findIndex((m) => parseLabel(m.label).letter === letter);
        if (at >= 0) {
          e.preventDefault();
          openMenu(at, true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      closeContextMenu();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav id="app-menu-bar" role="menubar" aria-label="Menús de la aplicación" className="flex items-center gap-0.5">
      {menus.map((menu, index) => {
        const { before, mnemonic, after } = parseLabel(menu.label);
        const isOpen = openUi === index;
        return (
          <button
            key={menu.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            id={`menu-bar-${menu.id}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            type="button"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault(); // el foco lo maneja el menú
              const last = lastClosed.current;
              if (last.index === index && Date.now() - last.at < 400) return; // este mismo clic lo acaba de cerrar
              openMenu(index, false);
            }}
            onMouseEnter={() => {
              if (openIndex.current !== null && openIndex.current !== index) openMenu(index, false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                openMenu(index, true);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const n = menus.length;
                buttons.current[(index + (e.key === 'ArrowRight' ? 1 : -1) + n) % n]?.focus();
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${
              isOpen
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {before}
            {mnemonic && <u className="underline underline-offset-[3px] decoration-1">{mnemonic}</u>}
            {after}
          </button>
        );
      })}
    </nav>
  );
};
