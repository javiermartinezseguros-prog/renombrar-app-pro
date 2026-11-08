/**
 * Menú contextual de Soter (ESTILO_MENUS.md): redondeado, nace en el punto del
 * clic con un resorte suave, y se maneja igual con mouse y teclado.
 * Lo que dice cada menú está en menuModel.ts.
 */
import './context-menu.css';
import { ACCENT_FALLBACK, ICON, MenuEntry, MenuItem, normalizeAccent, onAccentColor, parseLabel } from './menuModel';

const OPEN_MS = 320; // crece de 94 % a 100 % con un poco de rebote
const FADE_MS = 140; // aparece con opacidad
const CLOSE_MS = 100; // se cierra más rápido de lo que abrió, sin rebote
const REDUCED_MS = 120; // movimiento reducido: solo fundido
const SPRING = 'cubic-bezier(.34, 1.45, .5, 1)';

interface Entry {
  it: MenuItem;
  row: HTMLElement;
  letter: string;
}
interface Level {
  el: HTMLElement;
  rows: Entry[];
  active: number;
  isSub: boolean;
  sub: Level | null;
  parentRow: HTMLElement | null;
}

const state = {
  root: null as Level | null,
  levels: [] as Level[],
  onClose: null as null | ((chosen: boolean) => void),
  /** Flecha izquierda/derecha sin submenú que abrir: pasa al menú vecino de la barra. */
  onHorizontal: null as null | ((dir: -1 | 1) => void),
  anchor: null as HTMLElement | null,
  hoverTimer: 0 as number,
  closing: false,
  seq: 0,
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Color de acento de Windows para la fila bajo el mouse; el texto pasa a blanco o negro según el contraste. */
export function setMenuAccent(raw: string | null | undefined): void {
  const hex = normalizeAccent(raw) || ACCENT_FALLBACK;
  const root = document.documentElement;
  root.style.setProperty('--sm-accent', hex);
  root.style.setProperty('--sm-on-accent', onAccentColor(hex));
}

function build(items: MenuEntry[], isSub: boolean): Level {
  const el = document.createElement('div');
  el.className = 'sm-menu';
  el.setAttribute('role', 'menu');
  el.tabIndex = -1;
  const rows: Entry[] = [];
  for (const it of items) {
    if (it === '-') {
      const s = document.createElement('div');
      s.className = 'sm-sep';
      s.setAttribute('role', 'separator');
      el.appendChild(s);
      continue;
    }
    const { before, mnemonic, after, letter } = parseLabel(it.label);
    const row = document.createElement('div');
    row.className = 'sm-row' + (it.danger ? ' sm-danger' : '') + (it.off ? ' sm-off' : '');
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-disabled', it.off ? 'true' : 'false');
    row.id = 'sm-item-' + ++state.seq;
    if (it.checked !== undefined) {
      row.setAttribute('role', 'menuitemradio');
      row.setAttribute('aria-checked', it.checked ? 'true' : 'false');
    }
    if (it.sub) {
      row.setAttribute('aria-haspopup', 'menu');
      row.setAttribute('aria-expanded', 'false');
    }
    if (it.icon) {
      const ico = document.createElement('span');
      ico.className = 'sm-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.textContent = it.icon;
      row.appendChild(ico);
    }
    const label = document.createElement('span');
    label.className = 'sm-label';
    label.append(before);
    if (mnemonic) {
      const u = document.createElement('u');
      u.textContent = mnemonic;
      label.append(u, after);
    }
    row.appendChild(label);
    if (it.checked !== undefined) {
      const c = document.createElement('span');
      c.className = 'sm-check' + (it.checked ? '' : ' sm-check-off');
      c.setAttribute('aria-hidden', 'true');
      c.textContent = ICON.checkMark;
      row.appendChild(c);
    }
    if (it.key) {
      const k = document.createElement('span');
      k.className = 'sm-key';
      k.textContent = it.key;
      row.appendChild(k);
    }
    if (it.sub) {
      const arrow = document.createElement('span');
      arrow.className = 'sm-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '';
      row.appendChild(arrow);
    }
    const entry: Entry = { it, row, letter };
    (row as any)._entry = entry;
    rows.push(entry);
    el.appendChild(row);
  }
  return { el, rows, active: -1, isSub, sub: null, parentRow: null };
}

function place(level: Level, x: number, y: number, anchorLeft: number | null): void {
  const el = level.el;
  document.body.appendChild(el);
  // un menú más alto que la pantalla se desplaza por dentro (norma 2): alto máximo = alto de la ventana − 16 px
  el.style.maxHeight = Math.max(80, window.innerHeight - 16) + 'px';
  const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, pad = 8;
  let left = x, top = y, ox = 'left', oy = 'top';
  // sin lugar a la derecha: se abre hacia la izquierda; sin lugar abajo: hacia arriba (nace siempre en el punto del clic)
  if (left + w > vw - pad) { left = (anchorLeft !== null ? anchorLeft : x) - w; ox = 'right'; }
  if (left < pad) left = pad;
  if (top + h > vh - pad) {
    if (anchorLeft === null && y - h >= pad) { top = y - h; oy = 'bottom'; }
    else top = Math.max(pad, vh - pad - h);
  }
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.transformOrigin = ox + ' ' + oy;
}

function animateIn(el: HTMLElement, fromOpacity: number): void {
  el.getAnimations().forEach((a) => a.cancel());
  if (reducedMotion()) {
    el.animate([{ opacity: fromOpacity }, { opacity: 1 }], { duration: REDUCED_MS, easing: 'ease-out', fill: 'both' });
    return;
  }
  el.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: OPEN_MS, easing: SPRING, fill: 'both' });
  el.animate([{ opacity: fromOpacity }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out', fill: 'both' });
}

function animateOut(el: HTMLElement, done: () => void): void {
  el.getAnimations().forEach((a) => a.cancel());
  const reduced = reducedMotion();
  const frames = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' }];
  el.animate(frames, { duration: reduced ? REDUCED_MS : CLOSE_MS, easing: 'ease-in', fill: 'both' }).onfinish = done;
}

function setActive(level: Level, i: number, keyboard = false): void {
  const prev = level.rows[level.active];
  if (prev) prev.row.classList.remove('sm-hot');
  level.active = i;
  const cur = level.rows[i];
  if (!cur) return;
  cur.row.classList.add('sm-hot');
  if (keyboard) cur.row.scrollIntoView({ block: 'nearest' });
  level.el.setAttribute('aria-activedescendant', cur.row.id);
}

function closeSub(level: Level | undefined): void {
  if (!level || !level.sub) return;
  const sub = level.sub;
  level.sub = null;
  if (sub.sub) closeSub(sub);
  const idx = state.levels.indexOf(sub);
  if (idx >= 0) state.levels.splice(idx, 1);
  sub.parentRow?.setAttribute('aria-expanded', 'false');
  animateOut(sub.el, () => sub.el.remove());
}

const enabled = (e: Entry) => !e.it.off;

function firstEnabled(level: Level, dir: 1 | -1): number {
  const n = level.rows.length;
  if (!n) return -1;
  let i = dir > 0 ? 0 : n - 1;
  for (let c = 0; c < n; c++, i += dir) if (enabled(level.rows[i])) return i;
  return -1;
}

function step(level: Level, dir: 1 | -1): void {
  const n = level.rows.length;
  let i = level.active;
  for (let c = 0; c < n; c++) {
    i = (i + dir + n) % n;
    if (enabled(level.rows[i])) return setActive(level, i, true);
  }
}

/** Re Pág / Av Pág: salta unas cuantas filas (las que entran a la vista) y cae en una opción disponible. */
function pageStep(level: Level, dir: 1 | -1): void {
  const n = level.rows.length;
  if (!n) return;
  const rowH = level.rows[0].row.offsetHeight || 40;
  const per = Math.max(1, Math.floor(level.el.clientHeight / rowH) - 1);
  let i = Math.min(n - 1, Math.max(0, (level.active < 0 ? (dir > 0 ? -1 : n) : level.active) + dir * per));
  for (let c = 0; c < n && !enabled(level.rows[i]); c++) i = Math.min(n - 1, Math.max(0, i - dir));
  if (enabled(level.rows[i])) setActive(level, i, true);
}

function openSub(level: Level, entry: Entry, keyboard = false): void {
  if (level.sub && level.sub.parentRow === entry.row) return;
  closeSub(level);
  const sub = build(entry.it.sub || [], true);
  sub.parentRow = entry.row;
  const r = entry.row.getBoundingClientRect();
  const mr = level.el.getBoundingClientRect();
  // la primera fila del submenú queda alineada con la fila que lo abrió (6 px de margen + 1 px de hilo)
  place(sub, mr.right - 2, r.top - 7, mr.left + 2);
  animateIn(sub.el, 0);
  entry.row.setAttribute('aria-expanded', 'true');
  level.sub = sub;
  state.levels.push(sub);
  wire(sub);
  if (keyboard) setActive(sub, firstEnabled(sub, 1), true);
}

function choose(level: Level, entry: Entry | undefined): void {
  if (!entry || entry.it.off) return;
  if (entry.it.sub) { openSub(level, entry, true); return; }
  const run = entry.it.run;
  close(true);
  if (run) setTimeout(run, 0);
}

function wire(level: Level): void {
  const el = level.el;
  el.addEventListener('mousemove', (e) => {
    const row = (e.target as HTMLElement).closest('.sm-row') as (HTMLElement & { _entry?: Entry }) | null;
    if (!row || !row._entry) return;
    const i = level.rows.indexOf(row._entry);
    if (i !== level.active) {
      setActive(level, i);
      clearTimeout(state.hoverTimer);
      if (row._entry.it.sub && !row._entry.it.off) {
        const entry = row._entry;
        state.hoverTimer = window.setTimeout(() => openSub(level, entry), 120);
      } else if (level.sub) {
        state.hoverTimer = window.setTimeout(() => closeSub(level), 180);
      }
    }
  });
  el.addEventListener('mouseleave', (e) => {
    if (level.sub && level.sub.el.contains(e.relatedTarget as Node)) return;
    if (!level.sub) {
      const prev = level.rows[level.active];
      if (prev) prev.row.classList.remove('sm-hot');
      level.active = -1;
    }
  });
  el.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    const row = (e.target as HTMLElement).closest('.sm-row') as (HTMLElement & { _entry?: Entry }) | null;
    if (row && row._entry) choose(level, row._entry);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onKey(e: KeyboardEvent): void {
  if (!state.root) return;
  const level = state.levels[state.levels.length - 1];
  const k = e.key;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (k === 'Escape') { stop(); if (level.isSub) closeSub(state.levels[state.levels.length - 2]); else close(); return; }
  if (k === 'ArrowDown') { stop(); step(level, 1); return; }
  if (k === 'ArrowUp') { stop(); step(level, -1); return; }
  if (k === 'PageDown') { stop(); pageStep(level, 1); return; }
  if (k === 'PageUp') { stop(); pageStep(level, -1); return; }
  if (k === 'Home') { stop(); setActive(level, firstEnabled(level, 1), true); return; }
  if (k === 'End') { stop(); setActive(level, firstEnabled(level, -1), true); return; }
  if (k === 'ArrowRight') {
    stop();
    const cur = level.rows[level.active];
    if (cur && cur.it.sub && !cur.it.off) openSub(level, cur, true);
    else if (!level.isSub && state.onHorizontal) state.onHorizontal(1);
    return;
  }
  if (k === 'ArrowLeft') {
    stop();
    if (level.isSub) closeSub(state.levels[state.levels.length - 2]);
    else if (state.onHorizontal) state.onHorizontal(-1);
    return;
  }
  if (k === 'Enter' || k === ' ') { stop(); choose(level, level.rows[level.active]); return; }
  if (k === 'Tab') { stop(); return; }
  if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // letra subrayada: elige escribiéndola (si hay dos con la misma letra, recorre)
    const c = k.toLowerCase();
    const hits = level.rows.map((r, i) => [r, i] as const).filter(([r]) => r.letter === c && enabled(r));
    if (!hits.length) return;
    stop();
    const after = hits.find(([, i]) => i > level.active) || hits[0];
    setActive(level, after[1], true);
    if (hits.length === 1) choose(level, after[0]);
  }
}

function onOutside(e: MouseEvent): void {
  if (!state.root) return;
  if (state.levels.some((l) => l.el.contains(e.target as Node))) return;
  if (e.button === 2) return; // otro clic derecho: quien lo atiende mueve el menú al nuevo punto
  close();
}
const onBlur = () => close();
const onWheel = (e: Event) => { if (!state.levels.some((l) => l.el.contains(e.target as Node))) close(); };

function detach(): void {
  clearTimeout(state.hoverTimer);
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onOutside, true);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', onBlur);
  window.removeEventListener('wheel', onWheel, true);
}

function close(chosen = false): void {
  if (!state.root || state.closing) return;
  state.closing = true;
  detach();
  const levels = state.levels.slice(), cb = state.onClose, anchor = state.anchor;
  state.root = null; state.levels = []; state.onClose = null; state.onHorizontal = null; state.anchor = null;
  levels.forEach((l, i) => animateOut(l.el, () => { l.el.remove(); if (i === levels.length - 1) state.closing = false; }));
  if (cb) cb(chosen);
  if (anchor && !chosen) anchor.focus({ preventScroll: true });
}

export interface OpenMenuOptions {
  /** Punto del clic. */
  x: number;
  y: number;
  items: MenuEntry[];
  /** Si se abrió con el teclado: el menú nace debajo de este elemento y se marca la primera opción. */
  anchor?: HTMLElement | null;
  /** Con `anchor`: el menú nace pegado al borde izquierdo y debajo del elemento (botón de la barra de menús). */
  anchorBelow?: boolean;
  /** Con `anchor`: marcar la primera opción al abrir (teclado). Por defecto sí; con el mouse se pasa false. */
  highlightFirst?: boolean;
  /** Flecha izquierda/derecha en el primer nivel: pasar al menú vecino de la barra. */
  onHorizontal?: (dir: -1 | 1) => void;
  onClose?: (chosen: boolean) => void;
}

export function openContextMenu({ x, y, items, anchor = null, anchorBelow = false, highlightFirst = true, onHorizontal, onClose }: OpenMenuOptions): void {
  // un segundo clic derecho lo mueve al nuevo punto, sin esperar a que termine
  let fromOpacity = 0;
  if (state.root) {
    fromOpacity = parseFloat(getComputedStyle(state.root.el).opacity) || 0;
    state.levels.slice(1).forEach((l) => l.el.remove());
    const old = state.root, cb = state.onClose;
    state.onClose = null;
    state.onHorizontal = null;
    if (cb) cb(false);
    old.el.getAnimations().forEach((a) => a.cancel());
    old.el.remove();
    detach();
    state.root = null; state.levels = [];
  }
  state.closing = false;
  const level = build(items, false);
  state.root = level; state.levels = [level]; state.onClose = onClose || null; state.onHorizontal = onHorizontal || null; state.anchor = anchor;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (anchorBelow) { x = r.left; y = r.bottom; } else { x = r.left + 24; y = r.bottom - 4; }
  }
  place(level, x, y, null);
  animateIn(level.el, fromOpacity);
  wire(level);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onBlur);
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  level.el.focus({ preventScroll: true });
  if (anchor && highlightFirst) setActive(level, firstEnabled(level, 1), true);
}

export const closeContextMenu = () => close();
export const isContextMenuOpen = () => !!state.root;
