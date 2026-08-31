/// <reference types="vite/client" />

// Vite's `?url` suffix resolves any import to the final asset URL string.
// Used for pdfjs-dist's worker file in src/utils/pdfText.ts.
declare module '*?url' {
  const src: string;
  export default src;
}
