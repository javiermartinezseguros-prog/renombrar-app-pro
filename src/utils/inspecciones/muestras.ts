/**
 * Las fotos de muestra (cómo debe verse cada toma) viajan dentro de la app: src/assets/inspecciones.
 * Van como data URL (`?inline`): así se muestran y también se pueden leer sus píxeles para el reconocimiento
 * (una imagen de un archivo de la app instalada marcaría el lienzo como «de otro origen» y no dejaría leerlo).
 */
const urls = import.meta.glob('../../assets/inspecciones/*', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;

export const muestraUrl = (archivo?: string): string | undefined => (archivo ? urls[`../../assets/inspecciones/${archivo}`] : undefined);
