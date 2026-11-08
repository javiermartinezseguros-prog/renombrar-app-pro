/** Versión instalada y sus novedades (las inyecta vite.config.ts al compilar). */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'desarrollo';
export const APP_NOTES: string[] = typeof __RELEASE_NOTES__ !== 'undefined' ? __RELEASE_NOTES__ : [];
