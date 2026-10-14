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

export default defineConfig({
  base: './',
  plugins: [inlineBytes(), react(), tailwindcss()],
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
