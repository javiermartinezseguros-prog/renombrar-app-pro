import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// `import data from './file.bin?bytes'` embeds the file in the bundle as a
// base64 string. Used for the OCR language data: the installed app runs from
// file://, where the page can't fetch() a sibling file, so the bytes have to
// travel inside the JavaScript itself (in a lazy chunk, see src/utils/ocr.ts).
function inlineBytes(): Plugin {
  return {
    name: 'inline-bytes',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('?bytes')) return null;
      const file = id.slice(0, -'?bytes'.length);
      this.addWatchFile(file);
      const base64 = (await fs.promises.readFile(file)).toString('base64');
      return `export default ${JSON.stringify(base64)};`;
    },
  };
}

// onnxruntime-web (Inspecciones) trae su motor WebAssembly de 15 MB y Vite lo copiaría a dist/assets. La app lo recibe
// de la carpeta «modelos» (wasmBinary, ver src/utils/inspecciones/modelos.ts), así que esa copia sobra y duplicaría
// el peso del instalador: se cambia la referencia por un texto y Vite no la copia.
function sinWasmDuplicado(): Plugin {
  const referencia = 'new URL("ort-wasm-simd-threaded.wasm",import.meta.url).href';
  return {
    name: 'sin-wasm-duplicado',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('onnxruntime-web') || !code.includes(referencia)) return null;
      return { code: code.split(referencia).join('"ort-wasm-simd-threaded.wasm"'), map: null };
    },
  };
}

// Versión y novedades de esta versión: salen de package.json y release-notes.json, así «Acerca de»,
// la Ayuda y «Novedades» nunca quedan con un número viejo.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const releaseNotes = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'release-notes.json'), 'utf8'));

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __RELEASE_NOTES__: JSON.stringify(Array.isArray(releaseNotes[pkg.version]) ? releaseNotes[pkg.version] : []),
  },
  plugins: [inlineBytes(), sinWasmDuplicado(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // `npm run dev` (and main.cjs's fallback when dist/ doesn't exist yet) expect
  // the dev server on this exact local port; never exposed to the network.
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
});
