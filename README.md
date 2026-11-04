# MY CLOSET — fotos originales, prendas etiquetadas y looks

Álbum privado para fotos de prendas sueltas y outfits completos. Importa hasta 200 imágenes por selección (incluidas HEIC/HEIF), identifica las prendas con IA, busca por tipo/color y pide combinaciones basadas en las fotos reales del armario.

**Cambio de alcance del 4 de noviembre:** el usuario ha cancelado la separación de prendas y el cambio de fondo. La vista principal muestra las fotos originales, llenando las tarjetas con `object-fit: cover`. «Ver foto completa» abre la imagen entera sin recortar el archivo. No se ejecuta ninguna cola de cambio de fondo ni se generan nuevas prendas recortadas. Los originales, etiquetas y derivados anteriores se conservan en disco; estos últimos ya no se usan en la galería.

## Usarlo en el ordenador

Python 3.9+ y curl. Desde el repositorio:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/server.py --env .env.local
```

La clave `OPENAI_API_KEY` se guarda exclusivamente en `.env.local` ignorado por Git mediante aprovisionamiento seguro. Nunca se introduce en la web ni en GitHub Pages. El servidor imprime una URL privada con código de acceso temporal; abre esa dirección. El código no es la clave de OpenAI, permite acceder al álbum y no debe compartirse.

1. Pulsa **+ Añadir fotos**, autoriza guardarlas en tu servidor y selecciona hasta 200 imágenes juntas: ropa individual, prendas sobre una cama, fotos de producto o outfits. Máximo 15 MB por archivo. Los HEIC/HEIF se convierten a JPEG automáticamente.
2. Marca la autorización de OpenAI y pulsa **Identificar prendas con IA**. La cola se conserva en SQLite y muestra progreso. Pausar permite terminar la foto actual. El proceso sigue mientras el servidor esté encendido; no depende de mantener la pestaña abierta.
3. Cada foto tendrá etiquetas de prenda, categoría y color. Corrige las etiquetas con **Revisar prendas** o añádelas manualmente sin consumir API.
4. En **Buscar prendas**, escribe «camisa azul clarito» o «pantalón vaquero». Se muestran las fotos coincidentes y se resaltan las etiquetas pertinentes. La consulta debe coincidir en una misma prenda: no se toma el azul de un pantalón como color de una camisa blanca del mismo outfit.
5. En **Tu estilista**, pide un look. La IA recibe las etiquetas de las fotos coincidentes y de posibles prendas complementarias. Puede combinar una camisa de una foto con un pantalón de otra; cada propuesta muestra las fotos originales como referencia. No genera fotografías nuevas ni inventa piezas disponibles. Si falta ropa complementaria, debe explicarlo.

## Persistencia y privacidad

Los datos están en `data/closet.sqlite3` y las imágenes en `data/media/`. El servidor solo escucha en `127.0.0.1`, exige autorización para datos/imágenes/copias/operaciones y permite únicamente orígenes de navegador configurados. No sirve rutas arbitrarias: backend, modelos, archivos de entorno y SQLite están fuera de la lista pública. El service worker excluye API, imágenes privadas y peticiones autenticadas.

Al importar, el servidor orienta las imágenes, reduce su lado largo a 1600 px y recodifica sin EXIF/GPS. Conserva esa versión con el contenido y fondo originales; no modifica el archivo del dispositivo. La foto completa, incluida cualquier cara y habitación visible, se envía a OpenAI cuando autorizas la identificación. Se usa `store: false`, que no equivale a retención cero del proveedor. [Controles de datos de OpenAI](https://developers.openai.com/api/docs/guides/your-data).

Las propuestas de looks usan etiquetas e IDs internos y no vuelven a enviar las imágenes. Los IDs se validan contra las fotos suministradas y no se presentan en la explicación. Si la IA propone referencias inexistentes o sin una foto coincidente con la búsqueda, se descartan. Las etiquetas pueden contener errores: se pueden corregir. La coincidencia por colores es textual y no una medición calibrada del tejido.

No hay cifrado de archivos dentro de la aplicación; protege el ordenador y las copias. Descargar copia privada incluye SQLite, fotos y etiquetas, nunca la clave de OpenAI. Eliminar una foto borra sus etiquetas, versiones y propuestas locales asociadas; no elimina copias ya descargadas ni datos ya enviados al proveedor. La UI confirma el borrado. No se permite eliminar una foto mientras se está procesando.

## Costes y errores

Una solicitud de IA por foto sin etiquetar y una solicitud por petición de looks con coincidencias. La búsqueda normal y la edición manual de etiquetas no llaman a OpenAI. No se vuelve a analizar una foto ya etiquetada salvo reintento explícito. Las clasificaciones existentes se reaprovechan.

`OPENAI_MODEL` permite configurar el modelo; por defecto `gpt-4.1-mini`. `DAILY_ANALYSIS_LIMIT` limita solicitudes iniciadas por día UTC, 220 por defecto; no es un límite monetario. Una solicitud fallida también reserva contador. Se guardan tokens devueltos por el proveedor para revisar consumo. No hay reintentos automáticos. Un error de identificación pausa la cola pagada y mantiene las fotos. El reintento necesita una acción explícita. Si no hay coincidencias para un look, no se hace una llamada a la IA.

Máximo 200 fotos pendientes del importador y 2000 guardadas en esta primera versión. La subida de un archivo parcialmente transmitido no es reanudable; se selecciona otra vez. Las imágenes idénticas normalizadas se omiten. El importe depende de tokens/tarifas; no se promete un precio fijo. [Tarifas del modelo](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Copia y restauración

Detén el servidor antes de restaurar una copia propia de confianza. Extrae `closet.sqlite3` y `media/` en una carpeta nueva, conserva una copia de los datos actuales y arranca con `--data /ruta/a/esa/carpeta`. Un análisis interrumpido se marca para reintento explícito. La pausa de la cola se conserva. No hay restauración web ni copias automáticas todavía.

## Publicación

Esta versión es local, de un solo propietario. GitHub Pages puede servir la interfaz, pero no ejecuta el backend ni analiza fotos. No hay backend remoto desplegado ni sincronización entre dispositivos. No expongas directamente `http.server` a Internet. Un despliegue remoto requiere HTTPS, autenticación individual, almacenamiento privado persistente, límites por usuario y copias automatizadas. Nunca publiques claves, datos, fotos ni archivos de entorno en GitHub. El antiguo armario IndexedDB sigue accesible desde Inicio, sin migración/sincronización automática con él.

Los módulos de segmentación anteriores se mantienen únicamente para compatibilidad y pruebas de versiones previas. No son necesarios para el flujo actual ni requieren descargar pesos para etiquetar, buscar o pedir looks. Ver THIRD_PARTY.md para su procedencia.

## Validar

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check batch.js
node --check sw.js
```

Las pruebas no llaman a OpenAI ni gastan saldo. Cubren subida, HEIC, persistencia de 200 fotos, autorización, CORS, archivos privados, errores, búsqueda por prenda/color, corrección de etiquetas, referencias verificables y combinaciones entre fotos de prendas individuales. VALIDATION.md recoge los ensayos reales y sus límites.
