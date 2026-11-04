# Validación — 2 de noviembre de 2026

- Pruebas automatizadas de servidor: circuito subida → cola → detección simulada → segmentación GrabCut real → revisión → aprobación → persistencia → copia → borrado; máscara PNG con píxeles opacos y transparentes sobre una prenda sintética.
- Validación de autorización de API, CORS con origen exacto, bloqueo de .env/backend/SQLite/rutas de imagen arbitrarias y respuestas privadas no almacenables en caché.
- Errores de proveedor pausan la cola; no hay reintentos automáticos; se verifica límite diario y sugerencias de duplicados con aprobación humana.
- Prueba de capacidad: 200 imágenes únicas pendientes, conservación al reabrir SQLite y rechazo de la foto 201 mientras esas 200 siguen pendientes. No equivale a un ensayo de 200 solicitudes reales ni a una prueba de carga de producción.
- Resultado final: 15 pruebas automatizadas aprobadas. Comprobación de sintaxis JavaScript con Node aprobada.
- Navegador móvil: pantalla conectada al backend local, autorización, selección y subida de una imagen sintética, inicio de análisis y visualización del error del proveedor.
- Solicitud real a OpenAI usando la clave recién creada: respuesta HTTP 429 (cuota o límite de solicitudes). La detección automática no pudo validarse contra el proveedor por ese límite. No se afirma que se hayan detectado ni aislado automáticamente las fotos personales del usuario.
- Navegador: recorte manual de la camiseta sintética, creación de PNG con fondo eliminado, aprobación y aparición en Catálogo comprobados.
- Sin fotos personales disponibles para medir detección, calidad de segmentación o precisión de duplicados. GrabCut no es un modelo especializado en ropa; necesita revisión humana.

Seguimiento de subida: la imagen del usuario llegó al servidor, pero el análisis agotó el tiempo de espera. Se corrige la captura de socket.timeout en Python 3.9 para mostrar que la foto sigue guardada. Se añade prueba específica de ese error; no se afirma que la conexión del proveedor esté resuelta.

3 de noviembre: conversión de HEIC creado con macOS a JPEG sin EXIF y subida a cola comprobadas. Se incluye fixture sintética en base64; no hay fotos personales en el repositorio. La conversión no usa IA.

4 de noviembre: saldo de API verificado con respuesta 200. Primera muestra real reveló coordenadas erróneas y máscaras GrabCut inadecuadas. Esas propuestas se retiraron de revisión, conservando su historial. Se añade segmentación semántica local, se revisa visualmente pantalón y parte superior, y se marcan los recortes de prendas superpuestas como parciales. El lote permanece pausado para revisión; no se afirma separación perfecta. La ropa tapada no puede recuperarse fielmente de esa foto.

## Alcance final — 4 de noviembre de 2026

El usuario canceló tanto la separación de prendas como el cambio de fondo. El nuevo álbum muestra las fotos con su fondo original, rellenando las tarjetas; se comprueba la apertura del original completo en un visor. La cola de transformación visual queda desactivada. Se mantienen carga de HEIC y lotes, etiquetas editables, búsqueda por prenda/color y propuestas de looks con fotos de referencia, incluidas prendas individuales de distintas fotos.

22 pruebas locales aprobadas. La búsqueda evita confundir el azul de un pantalón con una camisa blanca y distingue camisa de camiseta. Se prueban persistencia de etiquetas, errores que pausan la cola pagada, IDs inexistentes descartados y combinaciones con prendas complementarias en fotos distintas. Ninguna prueba automatizada hace solicitudes reales a OpenAI.

Pruebas reales de esta iteración: tres fotos etiquetadas con Responses API y una petición de looks completada; cuatro fotos indexadas en total al validar la primera muestra. Búsqueda de pantalón vaquero y referencias de looks verificadas en navegador. Las clasificaciones pueden estar equivocadas y el usuario puede corregirlas. No se afirma que todas las fotos del lote estén ya etiquetadas ni que las recomendaciones sean una valoración objetiva de estilo.
