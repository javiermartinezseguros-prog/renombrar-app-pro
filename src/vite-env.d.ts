/// <reference types="vite/client" />

// Vite's `?url` suffix resolves any import to the final asset URL string.
// Used for pdfjs-dist's worker file in src/utils/pdfText.ts and for the
// bundled OCR worker/core in src/utils/ocr.ts.
declare module '*?url' {
  const src: string;
  export default src;
}

// `?bytes` (handled by the inline-bytes plugin in vite.config.ts) embeds a
// binary file in the bundle and exports it as a base64 string. Used for the
// bundled Spanish OCR language data.
declare module '*?bytes' {
  const base64: string;
  export default base64;
}

// Los define vite.config.ts: versión de package.json y novedades de esa versión (release-notes.json).
declare const __APP_VERSION__: string;
declare const __RELEASE_NOTES__: string[];
