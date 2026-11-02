# MY CLOSET — Prototipo 1

Web PWA sin dependencias. Funciones: inicio, subir imágenes de prendas y outfits, catálogo con filtros y eliminación, combinaciones aleatorias de partes superiores + pantalones + calzado. Las imágenes se comprimen y guardan en IndexedDB del navegador.

## Probar en ordenador

Desde esta carpeta ejecuta `python3 -m http.server 8000` y abre `http://localhost:8000`.

## Publicar en GitHub Pages

Crea un repositorio (por ejemplo `my-closet`), sube los cuatro archivos de esta carpeta a la raíz y habilita Settings → Pages → Deploy from a branch → main / root. Abre la URL HTTPS publicada en Safari de iPhone, pulsa Compartir → Añadir a pantalla de inicio.

## Limitaciones actuales

La detección y recorte automáticos con IA todavía NO están implementados. Las prendas se catalogan manualmente. Las fotos de espejo se guardan como look completo y no se descomponen en prendas. Los datos están en el navegador local: borrar los datos de Safari puede eliminarlos y no se sincronizan entre dispositivos. Antes de uso habitual conviene añadir exportación/importación y una base de datos sincronizada.
