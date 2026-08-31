# RenombrarAPP Pro - Organizador y Renombrador de Pólizas de Seguros

Sistema de escritorio y web para la lectura automática, extracción inteligente de datos y renombrado estandarizado de pólizas de seguros en formato PDF.

---

## 📋 Estructura de Nomenclatura Oficial

La aplicación normaliza y estandariza los nombres de archivo bajo la siguiente regla:

- **Frente de Póliza:** `PZA-000000000-00.pdf`
- **Endoso / Suplemento:** `PZA-000000000-01.pdf`
- **Tarjeta de Circulación (RC):** `PZA-000000000-00-Tarjeta de RC.pdf`
- **Cuponera de Pagos:** `PZA-000000000-00-Cuponera.pdf`
- **Certificado de Cobertura:** `PZA-000000000-00-Cobertura.pdf`

*(Donde el número de póliza se completa con ceros a la izquierda a 9 dígitos y el endoso a 2 dígitos)*

---

## 🚀 Guía de Instalación y Ejecución

### Requisitos Previos
- **Node.js** v18 o superior instalado en tu equipo ([Descargar Node.js](https://nodejs.org/)).

---

### Paso 1: Instalar dependencias

Abre una terminal o símbolo del sistema (CMD / PowerShell) en la carpeta del proyecto y ejecuta:

```bash
npm install
```

---

### Paso 2: Ejecutar la Aplicación

#### Opción A: Modo Web / Servidor Local
Para abrir la aplicación directamente en tu navegador:

```bash
npm run dev
```
Luego abre en tu navegador: `http://localhost:3000`

---

#### Opción B: Modo Aplicación de Escritorio (Electron)
Para ejecutar como aplicación nativa de ventana de escritorio:

1. Instala Electron (si aún no lo tienes global):
```bash
npm install --save-dev electron electron-builder
```

2. Compila y lanza la ventana:
```bash
npm run electron:dev
```

---

#### Opción C: Generar el Instalador de Windows (.exe)
Para crear el instalador ejecutable `.exe` portable para Windows:

```bash
npm run electron:build
```
El instalador final se generará en la carpeta `dist/` o `release/`.

---

## 📁 Archivos Principales del Proyecto

- `main.cjs` ➜ Archivo principal de Electron (proceso de ventana de escritorio).
- `src/main.tsx` ➜ Punto de entrada de React en el navegador.
- `src/App.tsx` ➜ Aplicación central con gestión de estados, temas, carpetas y atajos.
- `src/utils/policyExtractor.ts` ➜ Extracción inteligente y OCR con Gemini AI / Heurística.
- `src/utils/naming.ts` ➜ Validador y generador de nombres estandarizados.
- `server.ts` ➜ Backend Express con API para integración server-side de Gemini.
- `vite.config.ts` ➜ Configuración de empaquetado optimizada con `base: './'`.
