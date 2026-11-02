# MY CLOSET — importación privada de outfits

PWA existente conservada y nuevo estudio en `batch.html`: hasta 200 fotos por selección, subida secuencial, cola persistente, detección y clasificación con OpenAI en el servidor, extracción con OpenCV GrabCut y aprobación humana antes de incorporar prendas al nuevo catálogo.

## Usarlo ahora en un ordenador

Requiere Python 3.9 o superior. Desde este repositorio:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/server.py --env .env.local
```

La clave se configura **solo en el servidor**, en un archivo `.env.local` ignorado por Git, con la variable `OPENAI_API_KEY`. No se introduce en la web ni en GitHub Pages. La creación segura de la clave se realiza mediante OpenAI Platform. Sin clave funciona el recorte manual, la revisión y el catálogo.

Abre la dirección privada que muestra el servidor. Incluye un código de acceso temporal en el fragmento `#token=…`, que la web elimina de la barra de dirección al abrirse. No compartas esa dirección: da acceso a fotos y catálogo mientras ese servidor siga abierto. El código es diferente de la clave de OpenAI.

1. Marca la autorización de envío y selecciona hasta 200 JPEG/PNG/WebP (15 MB por archivo). Convierte HEIC antes.
2. Espera a que acabe la subida; se muestran errores por archivo y duplicados omitidos. La cola permanece pausada hasta que pulses **Iniciar / continuar análisis**.
3. En **Por revisar**, compara original, recorte y fondo eliminado; corrige nombre, categoría y color. Aprueba o descarta cada propuesta. Para repetir un recorte, usa **Ver original / recortar**, crea la nueva propuesta y descarta la anterior.
4. Los posibles duplicados muestran ambas imágenes. Aprueba primero la prenda de referencia y marca después **Es la misma prenda**. Puedes aprobar ambas si son distintas.
5. Descarga una copia privada ZIP. Las prendas aprobadas aparecen en **Catálogo**.

El ordenador y el servidor deben permanecer encendidos para analizar. Después de subir, cerrar la pestaña no detiene la cola. Pausar deja terminar la foto actual. Tras un reinicio, una foto interrumpida requiere reintento explícito para evitar cobros duplicados automáticos. Las fotos que siguen en cola se conservan. Si la cola estaba en marcha y autorizada, continúa al reiniciar.

## Qué está implementado y sus límites

- **Detección**: una solicitud Responses API con imagen por foto; resultado estructurado con prendas visibles, categorías, colores, confianza y coordenadas. Modelo predeterminado `gpt-4.1-mini`, configurable con `OPENAI_MODEL`. La confianza es una estimación del modelo, no una medida calibrada.
- **Aislamiento real**: GrabCut local calcula una máscara de primer plano por cada región detectada y guarda un PNG con transparencia cuando la máscara supera comprobaciones mínimas. No usa generación de imágenes ni inventa prendas. Es un algoritmo clásico: una camiseta sobre piel o prendas superpuestas pueden segmentarse mal. Una máscara válida numéricamente no garantiza que corresponda a toda la prenda. Si falla, la UI indica **Recorte rectangular · sin aislar** y conserva el recorte. Nunca se presenta ese rectángulo como aislamiento.
- **Deduplicación**: SHA-256 del JPEG normalizado evita subir imágenes idénticas después de quitar metadatos. dHash de recortes, categoría y color sugieren prendas similares; no prueban identidad ni unen automáticamente prendas. Cambios de pose pueden impedir encontrar duplicados; prendas diferentes pueden parecer similares.
- **Persistencia**: SQLite y archivos en `data/`, fuera de los archivos públicos. El catálogo nuevo es independiente del IndexedDB del armario original: las prendas previas no se migran ni sincronizan automáticamente y siguen disponibles desde Inicio. El nuevo catálogo no se sincroniza con los looks del prototipo.
- **Corrección manual**: permite trabajar incluso sin saldo de API: marca dos esquinas en el original, clasifica y revisa el recorte. La eliminación de fondo se intenta también en este modo, sin solicitudes de IA.
- **Errores**: un fallo de IA pausa toda la cola; la foto queda con error. Los reintentos requieren una acción explícita y vuelven a contar como solicitud. Las subidas fallidas se seleccionan de nuevo; no hay subida reanudable de un archivo parcialmente transmitido.

No se ha verificado la calidad sobre las fotos personales del usuario ni se promete segmentación de nivel estudio. Se incluyen pruebas reales de máscara sobre imágenes sintéticas y pruebas del circuito completo con detector simulado. Consulta `VALIDATION.md` para la comprobación de API y navegador de esta versión.

## Costes y límites

Máximo 200 fotos pendientes y 2000 almacenadas en esta primera versión. Una foto puede producir hasta 12 propuestas. Un solo trabajador limita concurrencia y consumo de memoria. No se usa la API Batch de OpenAI: se eligió una cola de solicitudes individuales para revisión inmediata.

`DAILY_ANALYSIS_LIMIT` limita las solicitudes iniciadas por día UTC (220 por defecto); se reserva el contador antes de llamar al proveedor, incluso cuando la llamada falla. No es un límite monetario. No hay reintentos automáticos. La interfaz muestra solicitudes y modelo; el servidor conserva los tokens que devuelve la API. Los costes reales dependen de resolución, tokens y tarifas del modelo. Empieza con 3–5 fotos y comprueba consumo y calidad antes de procesar 200. Configura también los límites y alertas del proyecto en OpenAI Platform; una clave nueva no garantiza saldo disponible.

Referencias oficiales: [entradas de imagen](https://developers.openai.com/api/docs/guides/images-vision), [resultados estructurados](https://developers.openai.com/api/docs/guides/structured-outputs), [tarifas](https://developers.openai.com/api/docs/pricing).

## Privacidad y seguridad

- Escucha únicamente en `127.0.0.1`, sin acceso desde otros dispositivos. Fotos, propuestas, copia y operaciones requieren un código privado de alta entropía. El código se guarda solo en `sessionStorage`; un reinicio del servidor lo rota salvo configuración explícita de `CLOSET_TOKEN`.
- Se rechazan orígenes de navegador ajenos a la lista permitida. Autorización por cabecera Bearer, sin cookies; no se sirven rutas arbitrarias del repositorio. No hay logs con nombres de foto, cabeceras o contenido. La clave no sale al frontend.
- Solo se sirven los archivos públicos explícitamente permitidos. `.env.local`, backend, SQLite, ZIP y carpetas de datos nunca se sirven como estáticos. El service worker excluye `/api/`, peticiones autenticadas e imágenes privadas.
- El servidor reorienta, reduce a 1600 px y recodifica fotos quitando EXIF/GPS. La imagen enviada a OpenAI puede seguir conteniendo cara, habitación y otros datos visibles: la web pide autorización antes de analizar. Se usa `store: false`; esto **no equivale a retención cero** del proveedor. Consulta [controles de datos de OpenAI](https://developers.openai.com/api/docs/guides/your-data).
- Eliminar una foto borra también sus propuestas, prendas aprobadas y archivos del servidor. No borra copias descargadas ni datos ya enviados al proveedor. No hay papelera en esta primera versión: la UI pide confirmación.
- Los archivos locales no están cifrados por la aplicación. Protege la cuenta del ordenador y usa cifrado de disco y copias privadas. La copia ZIP contiene las imágenes, nunca la clave ni el código de acceso.

## Copia y restauración

Descarga la copia ZIP desde la web. Para restaurar una copia propia de confianza, detén el servidor, conserva una copia de `data/` actual y extrae `closet.sqlite3` y `media/` en una nueva carpeta. Arranca con `--data /ruta/a/esa/carpeta`. No mezcles bases de datos ni restaures mientras hay análisis. Se conserva la configuración de pausa del momento de la copia; revisa la cola antes de continuar. El servidor marca cualquier foto que hubiera quedado en análisis como interrumpida. No hay restauración web ni copias automáticas todavía.

## GitHub Pages y siguiente despliegue

GitHub Pages solo aloja los archivos públicos. Publica preferiblemente la carpeta estática preparada en lugar de la raíz completa de un backend. No añadas `OPENAI_API_KEY`, archivos de entorno ni `data/` al repositorio. La vista de lotes en Pages necesita un backend privado accesible: Pages por sí solo **no analiza fotos**.

Esta entrega funciona en el ordenador mediante la dirección local del servidor. No está desplegado un backend remoto y no funciona desde iPhone sin ese despliegue. Un futuro servidor para uso entre dispositivos necesita HTTPS, autenticación individual, límites por usuario y tamaño, almacenamiento de objetos privado, cola duradera con trabajador y copias automatizadas. La versión incluida es de un solo propietario; no debe exponerse directamente a Internet con `http.server`. Para una primera instalación privada remota, mantener el servidor ligado a loopback detrás de un proxy HTTPS autenticado, con volumen persistente, límites de carga y acceso de red restringido. Para varios usuarios, sustituir el código compartido por sesiones individuales y aislar datos por propietario.

`ALLOWED_ORIGINS` permite añadir un origen HTTPS de frontend exacto, separado por comas. No acepta comodines. No convierte este servidor local en un servicio remoto ni evita las restricciones del navegador al conectar una página HTTPS con HTTP local. Para uso inmediato abre la web desde el propio servidor.

## Comprobar

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check batch.js
```

Las pruebas no llaman a OpenAI ni gastan saldo. Verifican máscara real, cola, aprobación, errores sin reintentos, límite diario, duplicados, persistencia, copia, borrado, autorización, CORS y bloqueo de archivos privados.
