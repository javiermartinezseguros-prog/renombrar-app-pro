# RenombrarAPP Pro - Organizador y Renombrador de Pólizas de Seguros

Aplicación de escritorio (y modo web de desarrollo) para la lectura automática, extracción de datos y renombrado estandarizado de pólizas de seguros en formato PDF.

**Todo se lee en tu computadora.** El texto de cada PDF se extrae con pdf.js y, si es un escaneo, con OCR local (el idioma viene incluido en la app: no necesita internet). Ningún documento se envía a servicios externos.

---

## 📋 Estructura de Nomenclatura Oficial

La aplicación normaliza y estandariza los nombres de archivo bajo la siguiente regla:

- **Frente de Póliza:** `PZA-000000000-00.pdf`
- **Endoso / Suplemento:** `PZA-000000000-01.pdf`
- **Tarjeta de Circulación (RC):** `PZA-000000000-00-TARJETA DE RC.pdf`
- **Cuponera de Pagos:** `PZA-000000000-00-CUPONERA.pdf`
- **Certificado de Cobertura:** `PZA-000000000-00-COBERTURA.pdf`

*(Donde el número de póliza se completa con ceros a la izquierda a 9 dígitos y el endoso a 2 dígitos. Si dos documentos distintos calculan el mismo nombre, el segundo se guarda como `... (2).pdf`, `... (3).pdf` y queda marcado para revisión.)*

---

## 🗂️ Carpetas y escaneo automático

- **Origen:** donde caen los PDFs sin procesar. **Destino:** donde se guardan renombrados.
- Origen y destino **deben ser dos carpetas separadas**: una no puede estar dentro de la otra ni ser la misma. Si lo estuvieran, el escaneo automático volvería a procesar (y borraría) los archivos ya renombrados, así que la pantalla de configuración y la app lo rechazan.

## 🕒 Historial de 7 días

El historial conserva **solo los últimos 7 días**. Pasado ese plazo se borra el registro **y la copia del PDF** que la app guardaba para la vista previa, la descarga y la corrección manual (carpeta `pdf-backups` dentro de los datos de la app). Se controla al abrir la app y cada hora mientras está abierta. Los PDFs ya renombrados en la carpeta de destino **no se tocan nunca**.

---

## 🚀 Guía de Instalación y Ejecución

### Requisitos Previos
- **Node.js** v18 o superior instalado en tu equipo ([Descargar Node.js](https://nodejs.org/)). Para correr los tests (`npm test`) se necesita Node 22 o superior.

### Paso 1: Instalar dependencias

```bash
npm install
```

### Paso 2: Ejecutar la Aplicación

#### Opción A: Modo Web (desarrollo)
```bash
npm run dev
```
Luego abre en tu navegador: `http://127.0.0.1:3000`. En este modo no hay acceso a carpetas reales ni copias de PDF en disco (las copias viven solo mientras la pestaña está abierta).

#### Opción B: Aplicación de escritorio (Electron)
```bash
npm run electron:dev
```

#### Opción C: Generar el instalador de Windows (.exe)
```bash
npm run electron:build
```
El instalador se genera en la carpeta `release/`.

### Tests
```bash
npm test
```

---

## 📁 Archivos Principales del Proyecto

- `main.cjs` ➜ Proceso principal de Electron: ventana, escaneo de carpeta, guardado y copias de PDF del historial.
- `preload.cjs` ➜ Puente seguro entre la ventana y el proceso principal.
- `src/main.tsx` ➜ Punto de entrada de React.
- `src/App.tsx` ➜ Aplicación central: estados, temas, carpetas y flujo de procesamiento.
- `src/utils/policyExtractor.ts` ➜ Lee el PDF (texto u OCR) y aplica las reglas por compañía.
- `src/utils/companies/` ➜ Motor de reglas y definiciones por aseguradora.
- `src/utils/ocr.ts` ➜ OCR local (tesseract.js con worker, núcleo e idioma incluidos).
- `src/utils/history.ts` ➜ Regla de retención de 7 días.
- `src/utils/policyFiles.ts` ➜ Copias de los PDF del historial.
- `src/utils/export.ts` ➜ Exportación a ZIP + índice CSV.
- `src/utils/naming.ts` ➜ Generador y validador de nombres estandarizados.
- `tests/` ➜ Tests (`node --test`).
- `vite.config.ts` ➜ Empaquetado con `base: './'`.
