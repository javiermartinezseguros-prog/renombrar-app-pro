/**
 * Menú del clic derecho para cualquier campo de texto de la app (buscador,
 * rutas, nombre del archivo, observaciones…). Electron no trae uno propio, así
 * que sin esto el clic derecho sobre un campo no hacía nada.
 */
import { closeContextMenu, openContextMenu } from './contextMenu';
import { buildTextMenu } from './menuModel';

type Field = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = ['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'];

async function pasteInto(field: Field): Promise<void> {
  field.focus();
  try {
    const text = await navigator.clipboard.readText();
    if (text) document.execCommand('insertText', false, text);
  } catch {
    document.execCommand('paste');
  }
}

/** Engancha el menú a todos los campos de texto. Devuelve la función que lo quita. */
export function installTextFieldMenu(): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (e.defaultPrevented) return; // una fila o una carpeta ya lo atendió
    const field = (e.target as HTMLElement | null)?.closest?.('input, textarea') as Field | null;
    if (!field || (field instanceof HTMLInputElement && !TEXT_INPUT_TYPES.includes(field.type))) {
      closeContextMenu();
      return;
    }
    e.preventDefault();
    field.focus();
    // Una contraseña no se copia ni se corta.
    const secret = field instanceof HTMLInputElement && field.type === 'password';
    const hasSelection = !secret && (field.selectionStart ?? 0) !== (field.selectionEnd ?? 0);
    const act = (command: string) => () => {
      field.focus();
      document.execCommand(command);
    };
    openContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildTextMenu(
        { hasSelection, readOnly: field.readOnly || field.disabled },
        {
          undo: act('undo'),
          cut: act('cut'),
          copy: act('copy'),
          paste: () => void pasteInto(field),
          selectAll: () => {
            field.focus();
            field.select();
          },
        }
      ),
    });
  };
  document.addEventListener('contextmenu', onContextMenu);
  return () => document.removeEventListener('contextmenu', onContextMenu);
}
