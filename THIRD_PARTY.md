# Modelo local de ropa

SegFormer B2 clothes, autor mattmdjaga. Revisión fijada: 584abc1e1d260e23c0fc627c5217a09b2b461046. Se usa el archivo ONNX sin código remoto ni archivos pickle.

Modelo y etiquetas: https://huggingface.co/mattmdjaga/segformer_b2_clothes
Configuración: https://huggingface.co/mattmdjaga/segformer_b2_clothes/blob/584abc1e1d260e23c0fc627c5217a09b2b461046/onnx/preprocessor_config.json
Licencia indicada por el autor: https://github.com/NVlabs/SegFormer/blob/master/LICENSE

Esta integración se prepara para el uso personal local de MY CLOSET. Revisar las condiciones del modelo antes de cualquier distribución o explotación comercial. Los pesos no se incluyen en GitHub ni en la copia del código. Las fotos no se envían a Hugging Face.

El modelo distingue ropa, piel, pelo, fondo y otras clases. No distingue por sí mismo camisa de chaqueta: separar capas por color es una aproximación y se marca como parcial. No reconstruye ropa oculta. Si no puede separar capas con confianza, conserva un recorte marcado para corrección en vez de presentar una máscara de piel o fondo como una prenda.
