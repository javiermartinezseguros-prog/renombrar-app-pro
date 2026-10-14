/**
 * Client-side PDF text extraction using pdf.js. Runs entirely in the
 * browser/Electron renderer — no server round-trip, no API cost, and the
 * document never leaves the computer.
 *
 * Every processed PDF gets its real text extracted here and handed to
 * `utils/companies` for the rule-based extraction. Pages with no text layer
 * (scans, vector-outlined fonts) fall back to local OCR (see ocr.ts).
 *
 * pdf.js is loaded via a dynamic import so it doesn't bloat the initial
 * bundle — it's only pulled in when a file is actually being processed.
 */

import { recognizeText } from './ocr';

// Per the user: the fields that matter (compañía, asegurado, póliza, endoso,
// vigencia) are always on the first few pages — later pages are legal
// clauses, anexos, coverage tables and beneficiary listings. Confirmed via a
// real bug: page 9 of a 10-page Suplemento Adicional had an unrelated "ANEXO
// DE PÓLIZA" section whose own policy/endoso numbering got matched instead
// of the real one on page 1. Keeping this small also bounds processing time
// on the (occasionally huge) bundled legal-terms PDFs some insurers send.
const MAX_PAGES_TO_READ = 3;
const LINE_Y_TOLERANCE = 3; // points; items within this vertical distance are treated as the same visual line
// Below this many characters, the text layer is treated as "not really
// there" and OCR takes over. Confirmed real case: some PDF generators draw
// the visible text as vector paths/outlined fonts rather than real font
// glyphs — pdf.js's text layer comes back completely empty (0 items) even
// though the page renders perfectly, so there's nothing for the rule engine
// to read unless we OCR the rendered page image instead.
const OCR_FALLBACK_THRESHOLD = 40;
const MAX_OCR_PAGES = 3; // OCR is much slower than text extraction; matches MAX_PAGES_TO_READ since the fields that matter are always on the first few pages

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }
  return pdfjsLib;
}

// A gap this wide between two words on the same visual line is treated as a
// column boundary (a table gutter) rather than normal word spacing.
const COLUMN_GAP_THRESHOLD = 10; // points
// Header cells in these boxed key-value tables are short field names; a
// "cell" longer than this is almost certainly flowing paragraph text, not a
// table header, so the row-pairing heuristic below leaves it alone.
const MAX_HEADER_CELL_LENGTH = 40;
// How far two rows' cell start-positions may drift and still be considered
// the same table (accounts for slightly different column widths between a
// short header word and a longer value below it).
const COLUMN_ALIGN_TOLERANCE = 15; // points

interface PositionedItem {
  x: number;
  x1: number;
  str: string;
}

interface Cell {
  x0: number;
  text: string;
}

interface Row {
  y: number;
  items: PositionedItem[];
  cells: Cell[];
}

/** Groups same-line items into "cells" wherever a column-sized gap separates them. */
function clusterCellsByGap(sortedItems: PositionedItem[]): Cell[] {
  const cells: Cell[] = [];
  let current: { x0: number; x1: number; parts: string[] } | null = null;

  for (const item of sortedItems) {
    if (current && item.x - current.x1 <= COLUMN_GAP_THRESHOLD) {
      current.parts.push(item.str);
      current.x1 = Math.max(current.x1, item.x1);
    } else {
      if (current) cells.push({ x0: current.x0, text: current.parts.join(' ').trim() });
      current = { x0: item.x, x1: item.x1, parts: [item.str] };
    }
  }
  if (current) cells.push({ x0: current.x0, text: current.parts.join(' ').trim() });
  return cells;
}

/**
 * Groups a row's raw items into cells using another row's already-known
 * column start positions, instead of re-detecting gaps independently.
 * Needed because gap-based clustering alone can merge two cells that should
 * stay separate: confirmed real case — "ZARATE CHAMORRO MARIO ULISES" (the
 * insured's name, in the first column) is long enough that it runs up to
 * within a few points of "AUTOMOTORES" (the rubro, starting the *next*
 * column), so gap clustering fused them into one cell and the header/value
 * pairing below rejected the row for having the wrong cell count. Bucketing
 * each item under the nearest column boundary at or before its x position
 * survives that, since "AUTOMOTORES" still starts at (essentially) the
 * rubro column's own boundary regardless of how far the name to its left
 * extends.
 */
function clusterCellsByBoundaries(sortedItems: PositionedItem[], boundaries: number[]): Cell[] {
  const buckets: { x0: number; parts: string[] }[] = boundaries.map((x0) => ({ x0, parts: [] }));
  for (const item of sortedItems) {
    let bucketIdx = 0;
    for (let b = 0; b < boundaries.length; b++) {
      if (item.x >= boundaries[b] - COLUMN_ALIGN_TOLERANCE) bucketIdx = b;
    }
    buckets[bucketIdx].parts.push(item.str);
  }
  return buckets
    .filter((b) => b.parts.length > 0)
    .map((b) => ({ x0: b.x0, text: b.parts.join(' ').trim() }));
}

/**
 * Some PDF generators lay out "Información de Póliza"-style panels as an
 * actual table: a row of field labels ("N° PÓLIZA", "ENDOSO", "VIGENCIA
 * DESDE"...) with the corresponding values printed on the *next* row, at
 * the same column positions — not immediately after the label the way a
 * plain "Label: value" sentence would read. Confirmed directly against real
 * San Cristóbal documents (and their box-style layout isn't unique to them).
 * A naive left-to-right line join turns that into two long, useless lines;
 * this pairs a header row with the value row beneath it into "Label: Value"
 * segments instead, which is what the label-proximity search in
 * `utils/companies` actually needs.
 */
function pairHeaderValueRows(rows: Row[]): string[] {
  const lines: string[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];
    const next = rows[i + 1];

    // A real field-label row (TOMADOR, N° PÓLIZA, ENDOSO, VIGENCIA DESDE...)
    // is never purely numeric — confirmed false-positive otherwise: a
    // document's own title/metadata line ("ACCIDENTES PERSONALES 004397064
    // 000016") coincidentally had the same cell count as the unrelated data
    // line below it and got wrongly paired as if it were a labeled table.
    const looksLikeHeaderRow =
      row.cells.length >= 2 &&
      row.cells.every((c) => c.text.length <= MAX_HEADER_CELL_LENGTH && !/^\d+$/.test(c.text));

    if (looksLikeHeaderRow && next) {
      // Try the value row's own gap-based cells first; if it's short by
      // EXACTLY one cell, a long value likely fused two adjacent cells
      // together, so re-bucket its raw items using the header's own column
      // boundaries instead. Deliberately narrow: boundary-bucketing always
      // finds *some* grouping (it has no notion of "no gap here"), so using
      // it as a catch-all for any mismatch started forcing false pairings
      // between rows that only coincidentally shared a cell count — e.g. a
      // document's title line and an unrelated data line below it. Requiring
      // the gap-based count to be off by exactly one keeps it to the actual
      // known failure mode (one merge), not "try harder until it fits".
      const nextCells =
        next.cells.length === row.cells.length
          ? next.cells
          : next.cells.length === row.cells.length - 1
            ? clusterCellsByBoundaries(
                next.items,
                row.cells.map((c) => c.x0)
              )
            : next.cells;

      const columnsAlign =
        nextCells.length === row.cells.length &&
        row.cells.every((c, idx) => Math.abs(c.x0 - nextCells[idx].x0) <= COLUMN_ALIGN_TOLERANCE);

      if (columnsAlign) {
        lines.push(row.cells.map((c, idx) => `${c.text}: ${nextCells[idx].text}`).join(' | '));
        i += 2;
        continue;
      }
    }

    lines.push(row.cells.map((c) => c.text).join(' '));
    i += 1;
  }

  return lines;
}

/**
 * Reassembles a page's text items into reading order using their actual
 * (x, y) position, instead of pdf.js's raw content-stream order.
 *
 * This matters more than it sounds: some PDF generators draw a static
 * "template" layer (field labels) and a dynamic "data" layer (the filled-in
 * values) as separate operations, so in the raw stream a whole page's worth
 * of labels can come out before — or well after — the values that visually
 * sit right next to them on the page. Grouping items into lines by y and
 * sorting left-to-right by x recovers what's actually on the page
 * regardless of the order it was drawn in — and pairHeaderValueRows() above
 * further recovers actual table structure, which position alone doesn't fix
 * since a header row and its value row are still two separate lines.
 */
function reconstructReadingOrder(items: Array<{ str: string; width?: number; transform: number[] }>): string {
  const rowsByY: { y: number; parts: PositionedItem[] }[] = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const width = item.width ?? item.str.length * 4; // rough fallback if width is missing
    let row = rowsByY.find((r) => Math.abs(r.y - y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rowsByY.push(row);
    }
    row.parts.push({ x, x1: x + width, str: item.str });
  }

  // Larger y = higher up the page in PDF coordinate space, so descending
  // order is top-to-bottom reading order.
  rowsByY.sort((a, b) => b.y - a.y);

  const rows: Row[] = rowsByY.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    return { y: r.y, items: r.parts, cells: clusterCellsByGap(r.parts) };
  });

  return pairHeaderValueRows(rows).join('\n');
}

/** Renders a PDF page to a canvas at the given scale (higher = better OCR accuracy, slower). */
async function renderPageToCanvas(page: any, scale = 2.5): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

/**
 * OCR fallback for PDFs with no usable text layer (confirmed real case:
 * some PDF generators draw text as vector paths, not font glyphs — pdf.js's
 * `getTextContent()` then returns nothing at all, no matter how the page is
 * rendered). Runs entirely client-side via tesseract.js (see ocr.ts), no
 * server needed; loaded on demand since it's a sizeable, rarely-needed library.
 */
async function ocrPdfPages(pdf: any, pagesToRead: number, fileName: string): Promise<string> {
  try {
    const ocrPageCount = Math.min(pagesToRead, MAX_OCR_PAGES);
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= ocrPageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const canvas = await renderPageToCanvas(page);
      pageTexts.push(await recognizeText(canvas));
    }
    return pageTexts.join('\n').replace(/[ \t]+/g, ' ').trim();
  } catch (err) {
    console.warn(`OCR falló para "${fileName}":`, err);
    return '';
  }
}

/**
 * Extracts plain text from a PDF File. Returns '' (never throws) if the file
 * can't be parsed at all — callers should treat empty text as "extraction
 * unavailable", not as an error.
 *
 * Falls back to OCR (see ocrPdfPages) when the normal text layer comes back
 * empty or nearly empty — confirmed necessary for at least one real insurer's
 * PDF generator (Intégrity), whose pages have zero extractable text objects
 * despite rendering as crisp, readable forms.
 */
export async function extractPdfText(file: File): Promise<string> {
  let pdf: any;
  try {
    const pdfjsLib = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pagesToRead = Math.min(pdf.numPages, MAX_PAGES_TO_READ);
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      pageTexts.push(reconstructReadingOrder(content.items as any[]));
    }

    const text = pageTexts.join('\n').replace(/[ \t]+/g, ' ').trim();
    if (text.length >= OCR_FALLBACK_THRESHOLD) return text;

    console.warn(`"${file.name}" no tiene capa de texto útil (${text.length} caracteres) — usando OCR.`);
    return await ocrPdfPages(pdf, pagesToRead, file.name);
  } catch (err) {
    console.warn(`No se pudo extraer texto del PDF "${file.name}" (posiblemente escaneado):`, err);
    return pdf ? await ocrPdfPages(pdf, Math.min(pdf.numPages, MAX_PAGES_TO_READ), file.name).catch(() => '') : '';
  }
}
