# SPEC — Sección «Inspecciones» dentro de RenombrarAPP Pro

Borrador del 08/11/2026 (cambio de enfoque: ya **no** es una app aparte; es una sección de RenombrarAPP). Por eso **no hay nombre ni ícono nuevos**. Estilo: `paleta-botones\GUIA_ESTILO_APPS.md`. **Versión (decidido por Javier 08/11/2026): se suma a la actualización pendiente, la 1.2.0** (sigue sin compilar). Cuando todo esté aprobado y listo, Inspecciones entra en esa misma versión y se compila **una sola vez**; el CHANGELOG 1.2.0 y `release-notes.json` lo anotan.

## Para qué
Javier recibe por WhatsApp las fotos de inspección de vehículos (autos, camionetas, colectivos, motos). La sección revisa cada foto, las agrupa por vehículo, lee la patente y las renombra con el formato de la oficina, igual que RenombrarAPP hace con las pólizas.

## Cómo entra en la app
- **Dos botones fijos, Pólizas | Inspecciones, en su propia fila debajo de la barra de menús** (decidido por Javier 08/11/2026; suma ~34 px). **Pólizas** queda igual que hoy. La barra de menús, esa fila y el pie quedan fijos; cada sección tiene su cuerpo.
- Se reutiliza lo que ya existe: barra de menús y clic derecho, vigilancia de carpeta (chokidar), copia a carpeta de destino, historial con tope de días, Configuración con parámetros, Ayuda (F1) con su prueba, Acerca de/Firma (desarrolla **Pablo Martínez**), progreso con Detener, avisos, tema claro/oscuro y tamaño de letra.
- **No se toca nada de Pólizas** (regla «no perder funciones»).

## Qué entra
- **Una sola carpeta vigilada** (decidido por Javier 08/11/2026): Inspecciones **no tiene vigilancia propia**; usa la carpeta de entrada que RenombrarAPP ya vigila (Descargas). Las fotos que caen ahí se **cuentan** como pendientes («Leer fotos nuevas (12)»), pero **no se analizan solas**: Javier aprieta **«Leer fotos»** (lectura manual). Para fotos escaneadas o que estén en otra carpeta: «Agregar fotos…» / arrastrar, y también «Leer».
- Carpeta de salida **propia de las fotos** (parámetro; de fábrica otra carpeta dentro de Descargas), distinta de la de las pólizas.
- `inspecciones\muestras\`: 16 fotos de referencia (una por toma; son de vehículos distintos: muestran **cómo debe verse** cada toma). Se muestran en la app como guía y se usan para reconocer la toma.

## Qué hace
1. **Un vehículo a la vez** (decidido por Javier 08/11/2026): las fotos que se suben o se leen son de **un solo vehículo**; no hay lista de vehículos ni agrupación automática. Al terminar, «Nuevo vehículo» limpia la pantalla. Como control de seguridad, avisa si la patente leída no coincide entre FRENTE y TRASERA o si las fotos son de días distintos (señal de que se mezclaron dos vehículos).
2. **Reconoce la toma** de cada foto.
3. **Revisa el encuadre**: marca en amarillo si la foto **corta una parte del vehículo** (el vehículo toca el borde), si el ángulo no es el de la muestra o si está movida u oscura. Tomas de detalle (tablero, oblea, chasis, cédula): se ve completa y legible.
4. **Fecha de la foto** (decidido por Javier 08/11/2026): primero los metadatos (EXIF); si no los tiene y viene de WhatsApp, **la fecha de WhatsApp** que trae el nombre del archivo (`IMG-20261108-WA0012`, `WhatsApp Image 2026-11-08 at 14.32.10`), con la etiqueta «WhatsApp» para que se sepa de dónde sale. Sin ninguna de las dos: «sin fecha» (no inventa).
5. **Lee la patente** del frente o de atrás y la valida con los formatos argentinos (ABC123, AB123CD, 123ABC, A123BCD); Javier la confirma o corrige antes de renombrar.
6. **Revisa que estén todas las tomas** del tipo de vehículo (auto o moto) y avisa cuál falta.
7. **Renombra copiando** a la carpeta de salida (también en Descargas), **directo en esa carpeta, sin subcarpetas por patente** (decidido por Javier 08/11/2026): `AB123CD-FRENTE.jpg`. El original no se toca y nunca se pisa un archivo (si existe, se agrega «(2)»).
8. **Compara cada foto con su muestra** en un panel a la derecha (tu foto / muestra / qué encontró: toma, encuadre, ángulo, nitidez).

## Formato del nombre (ejemplo real, `PZA-517418704\FOTOS`)
`PATENTE-TOMA.jpg`: `KNE353-FRENTE`, `-TRASERA`, `-CONDUCTOR`, `-ACOMPAÑANTE`, `-RUEDA`, `-AUXILIO`, `-TABLERO`, `-GNC`, `-OBLEA`, `-CEDULA VERDE FRENTE`, `-CEDULA VERDE DORSO`.
- Una misma foto puede servir para dos tomas (en el ejemplo `AUXILIO` y `GNC` son **el mismo archivo**: baúl con cilindro y rueda de auxilio): se copia con los dos nombres.
- Las del ejemplo no traen fecha de toma (vienen de WhatsApp).

## Cómo se resuelve sin internet (a confirmar con pruebas)
- Todo en la PC, en el proceso de la app, sobre CPU: `onnxruntime-web` (MIT) con modelos chicos incluidos en el instalador. **Antes de elegir cada modelo se comprueba su licencia** (nada AGPL/GPL fuerte, como pide la guía).
- Piezas: detector de vehículo (encuadre cortado), detector de patente + lector de caracteres, y reconocedor de toma por comparación con las muestras (se pueden agregar muestras nuevas sin reprogramar).
- Lectura de fecha: EXIF con una librería chica o lector propio.

## Qué NO entra (por ahora)
Mandar nada por WhatsApp, internet o IA en la nube; armar la carpeta del asegurado o de la póliza.

## Parámetros en Configuración (regla 12), con rango, fábrica, ejemplo y efecto inmediato
Carpeta de origen (la de las pólizas), carpeta de salida de las fotos, margen mínimo al borde para marcar «cortado» (% de la foto, fábrica 0,5, rango 0–15), rigor del aviso «en diagonal» (0–10, fábrica 5, 0 = no avisa) y tomas obligatorias de auto y de moto (interruptores Sí/No, fábrica todas en Sí). Ya **no** hay «pausa entre vehículos» (se lee un vehículo a la vez).

## Pendiente de Javier
- **Tomas de moto (confirmado 08/11/2026):** frente, trasera, conductor, acompañante, **NÚMERO DE CUADRO** (chasis grabado) y **NÚMERO DE MOTOR** (la foto con la etiqueta de la flecha roja), más cédula verde ×2. Nombres propuestos para el archivo: `-CUADRO` y `-MOTOR` (confirmar).
- **Tomas de auto (propuesta, sin objeciones):** frente, trasera, conductor, acompañante, rueda, auxilio, tablero, parabrisas, GNC, oblea, cédula verde ×2. Falta confirmar si PARABRISAS es obligatoria (no estaba en el ejemplo KNE353).

## Riesgo técnico
Sin internet va a haber lecturas de patente y tomas mal reconocidas. Por eso se muestra lo que leyó y no se renombra sola a ciegas. La precisión real se mide con fotos reales de Javier antes de prometerla.

## Estado (09/11/2026)
- **Medido con fotos reales de la oficina (ya nombradas):** reconocimiento 83 % con las 16 muestras → **95 %** con 333 ejemplos reales (`modelos\ejemplos.json`, solo números) y promedio de los 3 parecidos más altos por toma; confirmado con 222 fotos de 54 vehículos que no entraron en los ejemplos (87 % → 95 %). Margen de corte de fábrica 0,5 %. **Aviso «en diagonal»** para conductor y acompañante (ancho/alto del vehículo; rigor 5 detecta 27 de 40 en diagonal y marca 3 de 44 de perfil). Frente y trasera: sin revisar el ángulo (pocos casos, sin regla confiable). Detalle en el CHANGELOG 1.2.0.

## Estado (08/11/2026, noche)
- **Hecho y probado:** pantalla, botones Pólizas | Inspecciones, lectura de carpeta y de fotos elegidas, fecha (metadatos o WhatsApp), patente por OCR (con sugerencia si es dudosa), **reconocimiento automático de la toma y aviso de «corta el vehículo» con modelos locales** (`yolos-tiny` + `dinov2-small`, Apache-2.0, en `modelos\`), tomas que faltan, «renombrar y copiar» sin subcarpetas ni pisar nada, Configuración, Ayuda, menús y clic derecho. 201 pruebas y `tsc` limpios; canales de `main.cjs` probados contra una carpeta de verdad; **probado de punta a punta en la app de escritorio** con las fotos reales de KNE353.
- **Medido:** 8 de 9 tomas bien con fotos reales (TABLERO → PARABRISAS es el error conocido; FRENTE y OBLEA salen «dudosas» y se piden confirmar); cortes: el vehículo cortado de verdad queda a 0–1 % del borde, por eso el margen de fábrica es **1 %** (la maqueta decía 2 %).
- **Límites:** una muestra por toma; el corte no se revisa si el detector no encuentra el vehículo; el aviso de «movida» sin calibrar.
- **Después:** `code-review-and-quality` antes de la versión, actualizar el grafo (`graphify update .`), probar la app **instalada** (`--autoprueba` / instalación de prueba) y una sola compilación de la 1.2.0. Idea para mejorar la precisión: poder sumar muestras propias (fotos bien tomadas) a las 16 que trae la app.
