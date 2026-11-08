/**
 * Texto de la Ayuda (menú Ayuda → Cómo se usa, tecla F1): norma 16 de la guía de
 * estilo de Soter. Lleva el paso a paso, cada botón y cada menú, cada parámetro de
 * Configuración, los colores, los atajos y qué hacer si algo falla.
 * Una prueba (tests/help.test.ts) comprueba que cada opción de la barra de menús,
 * cada parámetro y cada control marcado con data-help en la pantalla tiene su
 * explicación acá: si se agrega un botón sin ayuda, la prueba falla.
 */
import { SETTING_SPECS, SettingKey } from './settings';

export interface HelpStep {
  title: string;
  text: string;
}

export interface HelpControl {
  /** Igual al `id` de la opción de menú o al `data-help` del botón en la pantalla. */
  id: string;
  name: string;
  text: string;
}

export interface HelpParam {
  key: SettingKey;
  name: string;
  text: string;
  example: string;
}

export const HELP_STEPS: HelpStep[] = [
  {
    title: 'Elegí las carpetas',
    text: 'Menú Configuración → «Carpetas de Origen y Destino…»: de dónde se leen los PDF (Origen) y dónde se dejan los renombrados (Destino). No pueden ser la misma ni una estar dentro de la otra.',
  },
  {
    title: 'Sumá los PDF',
    text: 'Arrastralos a la franja punteada, usá «Seleccionar Archivos PDF» (Ctrl+O) o «Cargar Carpeta Completa». Con «Auto-Procesar Carpeta Origen» la app toma sola todo PDF que aparezca en Origen.',
  },
  {
    title: 'Mirá el resultado',
    text: 'Cada fila muestra el tipo, el asegurado, la póliza, el endoso, la compañía y el nombre final. Doble clic (o Enter) abre la ficha completa; Espacio muestra el PDF.',
  },
  {
    title: 'Corregí lo que diga «Revisión»',
    text: 'Botón del lápiz (Ctrl+E): cambiás los datos o el nombre y el archivo se vuelve a guardar en Destino con el nombre nuevo.',
  },
  {
    title: 'Exportá o buscá en la carpeta',
    text: '«Exportar Renombrados» arma un ZIP; el ícono de carpeta de cada fila muestra el archivo en el Explorador de Windows.',
  },
];

/** Paso a paso de la sección Inspecciones (fotos de vehículos). */
export const HELP_STEPS_INSPECCIONES: HelpStep[] = [
  {
    title: 'Elegí «Inspecciones»',
    text: 'Con el botón «Inspecciones» (debajo de los menús). «Pólizas» vuelve a lo de siempre. Se trabaja con UN vehículo a la vez.',
  },
  {
    title: 'Sumá las fotos del vehículo',
    text: '«Leer fotos nuevas» (Ctrl+L) lee las fotos que hay en la carpeta de Origen —no se leen solas—; «Agregar fotos…» (Ctrl+O) o arrastrarlas sirve para fotos de otra carpeta o escaneadas. Si en Origen hay fotos de otro vehículo, sacalas antes.',
  },
  {
    title: 'Revisá cada toma',
    text: 'La app reconoce sola la toma de cada foto (frente, trasera, conductor, acompañante, rueda…) y la pone en su lugar. Tocá una para verla junto a su muestra: avisa si corta una parte del vehículo, si un costado salió en diagonal (tiene que ser de perfil), si falta una toma o si está movida. Si no está segura de la toma dice «Confirmala». Con el clic derecho cambiás la toma de una foto.',
  },
  {
    title: 'Confirmá la patente',
    text: 'La app la lee de la foto, pero siempre se revisa: si no la leyó o está mal, escribila en el campo «Patente». Si pone «Moto», se piden cuadro y motor en lugar de rueda, tablero y GNC.',
  },
  {
    title: 'Renombrá y copiá',
    text: '«Renombrar y copiar» (Ctrl+Intro) muestra cómo se va a llamar cada foto (PATENTE-TOMA.jpg). Al confirmar se copian a la carpeta de fotos renombradas, sin subcarpetas; las originales no se tocan. Después, «Nuevo vehículo» (Ctrl+N).',
  },
];

export const HELP_CONTROLS: HelpControl[] = [
  // ---- Inspecciones: barra de menús, clic derecho y pantalla ----
  { id: 'insp-leer', name: 'Leer fotos nuevas (Ctrl+L) — Archivo y botón azul', text: 'Lee las fotos (.jpg, .png, .webp) que hay en la carpeta de Origen y todavía no se copiaron. No se leen solas. El número entre paréntesis es cuántas hay esperando. Se leen como si fueran de UN solo vehículo.' },
  { id: 'insp-add-fotos', name: 'Archivo → Agregar fotos… (Ctrl+O)', text: 'Abre el selector de Windows para elegir fotos de cualquier carpeta (también escaneadas). Es lo mismo que el botón «Agregar fotos…».' },
  { id: 'insp-add-carpeta', name: 'Archivo → Cargar carpeta de fotos… (Ctrl+Mayús+O)', text: 'Elegís una carpeta y se leen todas las fotos que tiene, como un solo vehículo.' },
  { id: 'insp-renombrar', name: 'Renombrar y copiar… (Ctrl+Intro)', text: 'Muestra cómo se va a llamar cada foto y, al confirmar, las copia con su nombre nuevo a la carpeta de fotos renombradas. Queda en gris si falta la patente o ninguna foto tiene toma.' },
  { id: 'insp-nuevo', name: 'Nuevo vehículo (Ctrl+N)', text: 'Limpia la pantalla para empezar con otro vehículo. No borra ningún archivo.' },
  { id: 'insp-muestras', name: 'Ver → Ver las muestras', text: 'Muestra una foto de ejemplo de cada toma, para auto y para moto: así tienen que ser las fotos.' },
  { id: 'insp-open-salida', name: 'Ver → Abrir carpeta de fotos renombradas', text: 'Abre en el Explorador la carpeta donde se copian las fotos con el nombre nuevo.' },
  { id: 'insp-foto-ver', name: 'Clic derecho en una foto → Ver la foto grande', text: 'Abre la foto a pantalla grande (también con doble clic o Enter).' },
  { id: 'insp-foto-cambiar', name: 'Clic derecho en una foto → Cambiar la toma…', text: 'Elegís qué toma es la foto. Sirve cuando la app no la reconoció o se equivocó.' },
  { id: 'insp-foto-tambien', name: 'Clic derecho en una foto → Usar también como otra toma…', text: 'Una misma foto puede valer por dos tomas (por ejemplo AUXILIO y GNC, que son el baúl con el cilindro): se copia con los dos nombres.' },
  { id: 'insp-foto-revisada', name: 'Clic derecho en una foto → Marcar el aviso como revisado', text: 'Si viste el aviso («corta el vehículo» o «movida») y la foto igual sirve, la marcás y deja de avisar.' },
  { id: 'insp-foto-muestra', name: 'Clic derecho en una foto → Ver la muestra de esta toma', text: 'Abre la foto de ejemplo de esa toma para comparar.' },
  { id: 'insp-foto-carpeta', name: 'Clic derecho en una foto → Mostrar en la carpeta', text: 'Abre el Explorador con la foto original marcada. Queda en gris si la foto se agregó con «Agregar fotos…».' },
  { id: 'insp-foto-quitar', name: 'Clic derecho en una foto → Quitar de este vehículo', text: 'Saca la foto de la pantalla (Supr). El archivo no se borra.' },
  { id: 'section-buttons', name: 'Botones Pólizas | Inspecciones', text: 'Cambian de sección. El botón azul es la sección en la que estás.' },
  { id: 'insp-origen', name: 'Inspecciones: Origen', text: 'Carpeta de donde se leen las fotos: es la misma que usan las pólizas. Se cambia en Configuración.' },
  { id: 'insp-salida', name: 'Inspecciones: Fotos renombradas', text: 'Carpeta donde se copian las fotos con el nombre nuevo. Se cambia en Configuración → Inspecciones.' },
  { id: 'insp-agregar', name: 'Agregar fotos…', text: 'Igual que Archivo → Agregar fotos…' },
  { id: 'insp-estado', name: 'N fotos · N avisos', text: 'Cuántas fotos hay en pantalla y cuántos avisos tiene el vehículo (corta una parte, falta una toma, patente dudosa…).' },
  { id: 'insp-detener', name: 'Detener (lectura de fotos)', text: 'Corta la lectura de las fotos que faltan. Lo que ya se leyó queda en pantalla.' },
  { id: 'insp-patente', name: 'Campo Patente', text: 'Patente del vehículo. La app la lee de la foto pero siempre se revisa: se puede escribir o corregir. Con la patente cambian los nombres de todas las fotos.' },
  { id: 'insp-tipo', name: 'Tipo: Auto | Moto', text: 'Cambia las tomas que se piden. Auto: frente, trasera, conductor, acompañante, rueda, auxilio, tablero, parabrisas, GNC, oblea y cédula verde. Moto: frente, trasera, conductor, acompañante, número de cuadro, número de motor y cédula verde.' },
  { id: 'insp-fecha', name: 'Fecha', text: 'Fecha de las fotos. Primero se usan los metadatos (cuándo se sacó); si la foto no los tiene —WhatsApp los borra— se usa la fecha en que WhatsApp la envió, y lo dice con la etiqueta «WhatsApp». Si no hay ninguna, dice «sin fecha».' },
  { id: 'insp-nuevo-boton', name: 'Botón Nuevo vehículo', text: 'Igual que el menú Archivo → Nuevo vehículo.' },
  { id: 'insp-renombrar-boton', name: 'Botón Renombrar y copiar N fotos', text: 'Igual que el menú Archivo → Renombrar y copiar.' },
  { id: 'insp-fotos', name: 'Tarjetas de las tomas', text: 'Una tarjeta por toma: la foto, su estado (Bien, Revisar, Confirmala, Falta; «En diagonal» es un costado que salió de tres cuartos y no de perfil) y el nombre del archivo. «Confirmala» es una toma que la app reconoció pero no está segura. Doble clic la abre grande; clic derecho muestra las opciones. «No llegó esta foto» es una toma que falta.' },
  { id: 'insp-comparar', name: 'Panel «tu foto contra la muestra»', text: 'Muestra la foto elegida junto a la muestra de esa toma y lo que encontró la app: toma, encuadre (si corta una parte del vehículo), ángulo (si un costado salió en diagonal), nitidez y fecha.' },
  { id: 'settings-tab-insp', name: 'Configuración: Pólizas | Inspecciones', text: 'Cambia entre los ajustes de las pólizas y los de las fotos de vehículos.' },
  { id: 'settings-insp-salida', name: 'Configuración → Inspecciones: Carpeta de fotos renombradas', text: 'Dónde se copian las fotos con el nombre nuevo, directo en la carpeta (sin subcarpetas). Si queda vacía se usa «Inspecciones» dentro de la carpeta de Origen. No puede ser la misma que Origen.' },
  { id: 'settings-insp-tomas', name: 'Configuración → Inspecciones: Tomas obligatorias', text: 'Un interruptor Sí/No por toma, para auto y para moto. Si una toma obligatoria no llegó, la app avisa. De fábrica, todas en Sí.' },

  // ---- barra de menús ----
  { id: 'add-files', name: 'Archivo → Agregar archivos PDF… (Ctrl+O)', text: 'Abre el selector de Windows para elegir uno o varios PDF. La app los lee, los renombra y los guarda en Destino.' },
  { id: 'add-folder', name: 'Archivo → Cargar carpeta completa… (Ctrl+Mayús+O)', text: 'Elegís una carpeta y se procesan todos los PDF que tiene adentro, de una vez.' },
  { id: 'watch', name: 'Archivo → Activar / Detener el escaneo automático', text: 'Deja la carpeta de Origen vigilada: cada PDF nuevo se lee, se guarda renombrado en Destino y se saca de Origen. Sigue activo aunque cierres y abras la app. Es lo mismo que el botón verde «Auto-Procesar».' },
  { id: 'export-zip', name: 'Archivo → Exportar renombrados (ZIP) (Ctrl+Mayús+E)', text: 'Descarga un ZIP con todos los PDF del historial ya renombrados y un índice CSV. Queda en gris si todavía no hay documentos.' },
  { id: 'exit', name: 'Archivo → Salir (Alt+F4)', text: 'Cierra la app. Si el escaneo automático estaba activo, se retoma la próxima vez que abras.' },
  { id: 'focus-search', name: 'Ver → Ir al buscador (Ctrl+F)', text: 'Lleva el cursor al buscador de la tabla.' },
  { id: 'review-only', name: 'Ver → Solo los pendientes de revisión', text: 'Muestra en la tabla solamente los documentos que dicen «Revisión». Tiene una marca cuando está activo; se saca tocándolo otra vez.' },
  { id: 'show-all', name: 'Ver → Mostrar todos los documentos', text: 'Saca todos los filtros (tipo, compañía y revisión) y muestra la lista entera.' },
  { id: 'open-origin', name: 'Ver → Abrir carpeta de Origen', text: 'Abre la carpeta de Origen en el Explorador de Windows. Queda en gris si la carpeta no existe.' },
  { id: 'open-destination', name: 'Ver → Abrir carpeta de Destino', text: 'Abre la carpeta de Destino en el Explorador de Windows, donde están los PDF renombrados.' },
  { id: 'folders', name: 'Configuración → Carpetas de Origen y Destino…', text: 'Abre Configuración para elegir las dos carpetas con «Examinar» o escribiendo la ruta.' },
  { id: 'zoom', name: 'Configuración → Tamaño de la letra', text: 'Normal, Grande o Muy grande: agranda todos los textos de la app. Se recuerda al cerrar. También están los botones A, A+ y A++ arriba a la derecha.' },
  { id: 'theme', name: 'Configuración → Tema de colores', text: 'Sistema (sigue a Windows), Oscuro, Claro o Alto contraste (más fuerte para ver mejor). Se recuerda al cerrar.' },
  { id: 'settings', name: 'Configuración → Todos los ajustes… (Ctrl+,)', text: 'Abre Configuración: carpetas, opciones y parámetros de la app. Cada parámetro se explica más abajo.' },
  { id: 'help', name: 'Ayuda → Cómo se usa (F1)', text: 'Abre esta ayuda.' },
  { id: 'whats-new', name: 'Ayuda → Novedades de esta versión', text: 'Muestra lo que cambió en la versión instalada.' },
  { id: 'about', name: 'Ayuda → Acerca de RenombrarAPP', text: 'Nombre, versión, quién desarrolla la app y con qué ayuda se creó.' },
  // ---- botones y zonas de la pantalla ----
  { id: 'theme-buttons', name: 'Sistema · Oscuro · Claro · Alto Contraste', text: 'Los mismos temas del menú Configuración, a un clic: el que está en uso aparece resaltado.' },
  { id: 'zoom-buttons', name: 'A · A+ · A++', text: 'Tamaño de la letra: normal, grande y muy grande. Agrandan todo, así que si la ventana no alcanza solo se desplaza la tabla.' },
  { id: 'btn-export-all-zip', name: 'Exportar Renombrados', text: 'Igual que Archivo → Exportar renombrados (ZIP). Aparece cuando hay documentos en el historial.' },
  { id: 'origin-folder-badge', name: 'Origen', text: 'Muestra la carpeta de donde se leen los PDF. Clic derecho: abrir, copiar la ruta o cambiarla.' },
  { id: 'destination-folder-badge', name: 'Destino', text: 'Muestra la carpeta donde se guardan los PDF renombrados. Clic derecho: abrir, copiar la ruta o cambiarla.' },
  { id: 'btn-scan-and-process-folder', name: 'Auto-Procesar Carpeta Origen', text: 'Activa el escaneo automático de Origen. Mientras está activo el botón se pone rojo y dice «Escaneo Automático Activo»: tocalo para detenerlo.' },
  { id: 'folder-counts', name: 'N listos · N revisión', text: 'Cuántos documentos están listos y cuántos esperan que los revises.' },
  { id: 'btn-quick-change-folders', name: 'Configurar', text: 'Abre Configuración.' },
  { id: 'pdf-drag-and-drop-area', name: 'Franja punteada «Arrastrá aquí tus archivos PDF»', text: 'Soltá ahí uno o varios PDF desde el Explorador. Mientras trabaja muestra el avance, el tiempo que falta y el botón Detener.' },
  { id: 'btn-select-individual-files', name: 'Seleccionar Archivos PDF', text: 'Igual que Archivo → Agregar archivos PDF.' },
  { id: 'btn-select-entire-folder', name: 'Cargar Carpeta Completa', text: 'Igual que Archivo → Cargar carpeta completa.' },
  { id: 'btn-stop-processing', name: 'Detener', text: 'Corta la lectura de los PDF que quedaban. Lo que ya se leyó se conserva en el historial; lo que no se leyó se puede volver a agregar.' },
  { id: 'stats-cards', name: 'Tarjetas Total · Pólizas · Endosos · Tarjeta RC · Cuponeras · Coberturas · Revisión', text: 'Cuentan los documentos del historial por tipo. Tocar una tarjeta filtra la tabla por ese tipo; tocar «Total» muestra todos.' },
  { id: 'search-policies-input', name: 'Buscador', text: 'Escribí desde la 2.ª letra: aparecen sugerencias de personas debajo del campo (sin importar mayúsculas, tildes ni el orden de nombre y apellido). Con ↑ ↓ recorrés, Enter elige, Tab completa con la primera y Esc cierra. También busca por N° de póliza, compañía, rubro, patente o nombre de archivo.' },
  { id: 'company-filter', name: 'Todas las Compañías', text: 'Muestra solo los documentos de la compañía elegida.' },
  { id: 'type-pills', name: 'Todos · Pólizas · Endosos · Tarjetas de RC · Cuponeras · Coberturas', text: 'Filtran la tabla por tipo de documento.' },
  { id: 'review-pill', name: 'Pendientes Revisión', text: 'Muestra solo los documentos que dicen «Revisión».' },
  { id: 'select-all', name: 'Casilla de la cabecera y casillas de cada fila', text: 'Tildan filas para actuar sobre varias a la vez (copiar sus números, eliminarlas). Ctrl+A tilda todas.' },
  { id: 'batch-delete', name: 'Eliminar Seleccionados', text: 'Saca del historial las filas tildadas. Los PDF ya guardados en Destino no se tocan.' },
  { id: 'copy-policy', name: 'N° de póliza (clic para copiar)', text: 'Copia el número de 9 dígitos al portapapeles, listo para pegar en tu sistema.' },
  { id: 'row-view', name: 'Ojo — Ver ficha', text: 'Abre la ficha completa del documento (también con doble clic o Enter).' },
  { id: 'row-preview', name: 'Lupa — Previsualizar PDF', text: 'Muestra el PDF original (también con la barra espaciadora).' },
  { id: 'row-edit', name: 'Lápiz — Editar o corregir', text: 'Cambiar compañía, asegurado, póliza, endoso, tipo o el nombre final. Al guardar se reescribe el archivo en Destino.' },
  { id: 'row-folder-download', name: 'Carpeta / Flecha — Mostrar en la carpeta o Descargar', text: 'Si el archivo ya está en Destino abre el Explorador con ese archivo marcado; si no, lo descarga.' },
  { id: 'row-delete', name: 'Papelera — Eliminar del historial', text: 'Saca el documento del historial (Supr). El PDF de Destino no se borra.' },
  { id: 'state-chips', name: 'Etiqueta Estado', text: 'Listo, Revisión o «Póliza de otro doc.»: los colores se explican más abajo. Apoyá el mouse sobre la etiqueta azul para ver de qué documento salió el número.' },
  // ---- cuadros ----
  { id: 'settings-folders', name: 'Configuración: Origen, Destino y Examinar', text: 'Escribí la ruta o usá «Examinar» para elegirla. Si una carpeta está dentro de la otra, avisa y no deja guardar.' },
  { id: 'settings-auto-process', name: 'Configuración: Procesar y extraer datos automáticamente al arrastrar archivos', text: 'Tildada, los PDF que arrastrás se leen en el momento.' },
  { id: 'settings-subfolders', name: 'Configuración: Organizar en subcarpetas por Compañía al exportar ZIP', text: 'Tildada, el ZIP separa los PDF en una carpeta por compañía.' },
  { id: 'settings-reset', name: 'Configuración: Volver a los valores de fábrica', text: 'Deja los parámetros en su valor original (no toca las carpetas). Hay que apretar Guardar para que se aplique.' },
  { id: 'settings-save', name: 'Configuración: Guardar Configuración / Cancelar', text: 'Guardar aplica todo al instante, sin reiniciar. Cancelar cierra sin cambiar nada.' },
];

export const HELP_PARAMS: HelpParam[] = [
  {
    key: 'historyDays',
    name: 'Días que se guarda el historial',
    text: 'Pasado ese plazo se borra el registro de la tabla y la copia del PDF que la app guarda para la vista previa. Los PDF de la carpeta Destino no se tocan nunca. Si ponés menos días que antes, al guardar se borran los registros más viejos (la pantalla te avisa cuántos).',
    example: 'Ejemplo: 7 = una semana (valor de fábrica); 30 = un mes.',
  },
  {
    key: 'fileWaitSeconds',
    name: 'Espera antes de leer un archivo nuevo',
    text: 'Tiempo que el escaneo automático espera a que termine de copiarse un PDF antes de leerlo. Si lo leyera a medio copiar, saldría incompleto. Si tu red o tu disco son lentos, subilo.',
    example: 'Ejemplo: 1,5 s (valor de fábrica); 4 s para PDF grandes que llegan por red.',
  },
];

export interface HelpInspParam {
  key: string;
  name: string;
  text: string;
  example: string;
}

export const HELP_INSP_PARAMS: HelpInspParam[] = [
  {
    key: 'marginPct',
    name: 'Cuánto se puede acercar al borde (Inspecciones)',
    text: 'Si el vehículo llega a menos de este porcentaje del borde de la foto, la app avisa «corta el vehículo». Con 0 solo avisa si toca el borde; con un número más alto avisa antes. Solo cuenta en las tomas del vehículo entero (frente, trasera, conductor y acompañante).',
    example: 'Ejemplo: 0,5 % (valor de fábrica; con fotos reales de la oficina, por debajo de 0,5 % el vehículo toca el borde y casi siempre está cortado; con 1 % ya marcaba de más); 5 % si querés que avise con más aire alrededor.',
  },
  {
    key: 'angleRigor',
    name: 'Rigor con las fotos en diagonal (Inspecciones)',
    text: 'Los costados (conductor y acompañante) de un auto tienen que salir de perfil. La app mide qué tan alargado se ve el vehículo: si se ve más corto de lo que corresponde a un perfil, avisa «en diagonal». Un rigor más alto avisa también las fotos apenas torcidas (y se equivoca más con vehículos cortos); 0 apaga el aviso. No se aplica a motos, al frente ni a la trasera.',
    example: 'Ejemplo: 5 (valor de fábrica; con fotos reales detecta unas 7 de cada 10 en diagonal y marca por error 1 de cada 15 de perfil); 8 si querés que avise también las apenas torcidas.',
  },
];

export const HELP_COLORS: Array<{ label: string; tone: 'ok' | 'warn' | 'blue' | 'bad'; text: string }> = [
  { label: 'Listo', tone: 'ok', text: 'Leído sin dudas.' },
  { label: 'Revisión', tone: 'warn', text: 'Falta o está dudoso algún dato: revisalo con el lápiz.' },
  { label: 'Bien (verde)', tone: 'ok', text: 'Inspecciones: la foto está bien y la toma está completa.' },
  { label: 'Revisar (amarillo)', tone: 'warn', text: 'Inspecciones: la foto corta una parte del vehículo, está movida, no tiene toma asignada o la toma es poco segura («Confirmala»).' },
  { label: 'Falta (rojo)', tone: 'bad', text: 'Inspecciones: no llegó ninguna foto de esa toma obligatoria.' },
  { label: 'Póliza de otro doc.', tone: 'blue', text: 'El OCR no pudo leer el número en este documento y se tomó de otro del mismo asegurado y la misma vigencia. Conviene verificarlo.' },
];

export const HELP_SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+O', 'Agregar PDF'],
  ['Ctrl+Mayús+O', 'Cargar carpeta'],
  ['Ctrl+F', 'Ir al buscador'],
  ['Ctrl+,', 'Configuración'],
  ['F1', 'Esta ayuda'],
  ['F10 o Alt+letra', 'Barra de menús'],
  ['Enter', 'Ficha'],
  ['Espacio', 'Vista previa'],
  ['Ctrl+E', 'Editar'],
  ['Ctrl+C', 'Copiar póliza'],
  ['Ctrl+A', 'Elegir todas'],
  ['Supr', 'Eliminar'],
  ['Ctrl+L', 'Inspecciones: leer fotos nuevas'],
  ['Ctrl+Intro', 'Inspecciones: renombrar y copiar'],
  ['Ctrl+N', 'Inspecciones: nuevo vehículo'],
];

export const HELP_RIGHT_CLICK =
  'Clic derecho (o Shift+F10) en una fila, un campo de texto, una carpeta o un espacio vacío: más opciones. Lo que quita va en rojo, al final.';

export const HELP_TROUBLE: string[] = [
  'Un escaneado sin número legible queda en «Revisión»: corregilo con el lápiz. En ATM la app intenta completarlo sola con otro documento del mismo asegurado.',
  'Si Origen y Destino se pisan, la app avisa y no guarda: elegí dos carpetas separadas.',
  'Si «Abrir carpeta» queda en gris, la carpeta no existe: creala o cambiala en Configuración.',
  'Si un PDF se leyó a medio copiar, subí la «Espera antes de leer un archivo nuevo» y volvé a agregarlo.',
  'El historial guarda los últimos días que indica Configuración; los PDF de Destino quedan para siempre.',
  'Inspecciones: si las fotos que leyó son de dos vehículos, usá «Nuevo vehículo» y sacá de la carpeta de Origen las del otro antes de volver a leer.',
  'Inspecciones: si no leyó la patente (foto de lejos, torcida o sucia), escribila a mano en el campo Patente.',
  'Inspecciones: si una foto quedó «sin toma», tocala con el botón derecho y elegí «Cambiar la toma…».',
  'Inspecciones: si dice «sin fecha», la foto no trae metadatos ni el nombre de WhatsApp; se puede renombrar igual.',
  'Inspecciones: la primera vez que se leen fotos tarda unos segundos más porque prepara el reconocimiento; las siguientes, unos 5 segundos por foto.',
  'Inspecciones: si una foto dice «Confirmala», la app dudó entre dos tomas. Mirala junto a la muestra y, si está bien, tocá «Marcar como revisada»; si no, cambiale la toma. Hay fotos que se confunden (por ejemplo tablero y parabrisas): revisá siempre. «En diagonal» avisa los costados de un auto que no salieron de perfil: se mide con la forma del vehículo, así que a veces se equivoca (una camioneta o un utilitario de perfil pueden marcarse); si la foto está bien, «Marcar como revisada». El frente y la trasera todavía no se revisan.',
  'Inspecciones: «sin revisar: no se detectó el vehículo» pasa con motos vistas de atrás o fotos muy cerradas: mirá a ojo si la foto corta el vehículo.',
  'Inspecciones: si dos archivos son exactamente la misma foto (AUXILIO y GNC), se usa una sola y se copia con los dos nombres.',
  'Inspecciones: si dice que no se pudieron cargar los modelos de reconocimiento, la toma se elige a mano con el clic derecho; avisale a quien instaló la app.',
];

/** Todo lo que la ayuda explica, en minúsculas y sin tildes, para el buscador de la ayuda. */
export function helpSearchIndex(): string {
  return [
    ...HELP_STEPS.map((s) => `${s.title} ${s.text}`),
    ...HELP_STEPS_INSPECCIONES.map((s) => `${s.title} ${s.text}`),
    ...HELP_INSP_PARAMS.map((p) => `${p.name} ${p.text} ${p.example}`),
    ...HELP_CONTROLS.map((c) => `${c.name} ${c.text}`),
    ...HELP_PARAMS.map((p) => `${p.name} ${p.text} ${p.example}`),
    ...HELP_COLORS.map((c) => `${c.label} ${c.text}`),
    ...HELP_TROUBLE,
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export const paramKeysWithHelp = (): SettingKey[] => HELP_PARAMS.map((p) => p.key);
export const allParamKeys = (): SettingKey[] => Object.keys(SETTING_SPECS) as SettingKey[];

/** Información de «Acerca de» (norma 15): quién desarrolla se anota por pedido de Javier, 05/11/2026. */
export const ABOUT = {
  name: 'RenombrarAPP Pro',
  does: 'Extractor y renombrador de pólizas de seguros y revisor de fotos de vehículos (Inspecciones)',
  developer: 'Pablo Martínez',
  data: 'Los documentos y las fotos se leen en esta PC y no se envían a ningún lado.',
  claude: 'Esta app fue creada con la ayuda de Claude (Anthropic)',
};
