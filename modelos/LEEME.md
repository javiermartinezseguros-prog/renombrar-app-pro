# Carpeta «modelos»

Lo que usa la sección **Inspecciones** para reconocer fotos sin internet. Ver `LICENCIAS_MODELOS.txt`.

| Archivo | Para qué | Cómo se obtuvo |
|---|---|---|
| `yolos-tiny_cuantizado.onnx` | detectar el vehículo (¿la foto lo corta?) | `https://huggingface.co/Xenova/yolos-tiny/resolve/main/onnx/model_quantized.onnx` |
| `dinov2-small_cuantizado.onnx` | reconocer la toma comparando con las muestras | `https://huggingface.co/Xenova/dinov2-small/resolve/main/onnx/model_quantized.onnx` |
| `ort-wasm-simd-threaded.wasm` | motor de ejecución | copiado de `node_modules/onnxruntime-web/dist/` |
| `ejemplos.json` | 333 ejemplos reales de tomas de auto (solo números del reconocedor, sin fotos, patentes ni nombres) | armado el 09/11/2026 con fotos ya nombradas de la oficina: hasta 40 por toma, de vehículos distintos, guardados como enteros de 8 bits |

- **En desarrollo** (`npm run dev`) el navegador los pide a `/modelos/<archivo>`; en la app de escritorio los lee el proceso principal (`read-model-file` en `main.cjs`, que solo entrega estos tres nombres).
- **En el instalador** van como `extraResources` (fuera del asar): `resources\modelos\`.
- Si se actualiza `onnxruntime-web`, hay que volver a copiar el `.wasm` (una prueba avisa si quedó de otra versión).
- **Rehacer `ejemplos.json`** (si se cambian los modelos o la preparación de la foto, o para sumar más tomas): sacar las características (`caracteristicas()` de `vision.ts`) de fotos ya clasificadas y guardar `{version:1, ejemplos:[{toma, escala, q}]}` con `q` = base64 de 6528 enteros de 8 bits (384 globales + 16×384 de la grilla) y `escala` = máximo absoluto / 127. Leer con `decodificarEjemplos` (`ejemplos.ts`). Las fotos de clientes no se guardan en el proyecto.
- Si se cambian los modelos o cómo se prepara la foto, subir `VERSION_PROTOTIPOS` en `src/utils/inspecciones/modelos.ts` para que se vuelvan a calcular las características de las muestras.
