# Validación — 2 de noviembre de 2026

- Pruebas automatizadas de servidor: circuito subida → cola → detección simulada → segmentación GrabCut real → revisión → aprobación → persistencia → copia → borrado; máscara PNG con píxeles opacos y transparentes sobre una prenda sintética.
- Validación de autorización de API, CORS con origen exacto, bloqueo de .env/backend/SQLite/rutas de imagen arbitrarias y respuestas privadas no almacenables en caché.
- Errores de proveedor pausan la cola; no hay reintentos automáticos; se verifica límite diario y sugerencias de duplicados con aprobación humana.
- Prueba de capacidad: 200 imágenes únicas pendientes, conservación al reabrir SQLite y rechazo de la foto 201 mientras esas 200 siguen pendientes. No equivale a un ensayo de 200 solicitudes reales ni a una prueba de carga de producción.
- Resultado final: 9 pruebas automatizadas aprobadas. Comprobación de sintaxis JavaScript con Node aprobada.
- Navegador móvil: pantalla conectada al backend local, autorización, selección y subida de una imagen sintética, inicio de análisis y visualización del error del proveedor.
- Solicitud real a OpenAI usando la clave recién creada: respuesta HTTP 429 (cuota o límite de solicitudes). La detección automática no pudo validarse contra el proveedor por ese límite. No se afirma que se hayan detectado ni aislado automáticamente las fotos personales del usuario.
- Navegador: recorte manual de la camiseta sintética, creación de PNG con fondo eliminado, aprobación y aparición en Catálogo comprobados.
- Sin fotos personales disponibles para medir detección, calidad de segmentación o precisión de duplicados. GrabCut no es un modelo especializado en ropa; necesita revisión humana.
