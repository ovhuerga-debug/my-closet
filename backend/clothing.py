"""Local SegFormer clothing masks; no photo leaves this process."""
from pathlib import Path
import threading
import cv2
import numpy as np
from PIL import Image

MODEL = Path(__file__).resolve().parent.parent / 'models/clothes.onnx'
_session = None
_lock = threading.Lock()
LABELS = {'parte superior':[4], 'abrigo':[4], 'pantalón':[6], 'falda':[5], 'vestido':[7], 'calzado':[9,10]}


def clothing_labels(image):
    global _session
    if not MODEL.is_file():
        return None
    import onnxruntime as ort
    with _lock:
        if _session is None:
            options=ort.SessionOptions()
            options.intra_op_num_threads=2
            _session=ort.InferenceSession(str(MODEL),sess_options=options,providers=['CPUExecutionProvider'])
        a=np.asarray(image.convert('RGB').resize((512,512),Image.Resampling.BILINEAR)).astype(np.float32)/255
        mean=np.array([.485,.456,.406],dtype=np.float32)
        std=np.array([.229,.224,.225],dtype=np.float32)
        x=((a-mean)/std).transpose(2,0,1)[None]
        output=_session.run(None,{_session.get_inputs()[0].name:x})[0][0]
    logits=np.stack([cv2.resize(channel,image.size,interpolation=cv2.INTER_LINEAR) for channel in output])
    return logits.argmax(axis=0)


def garment_mask(image, labels, item, items):
    ids=LABELS.get(item['category'])
    if labels is None or not ids:
        return None, 'Sin segmentación especializada para esta prenda. Revisa el recorte.'
    mask=np.isin(labels,ids)
    warning='Conserva solo lo visible; puede faltar ropa tapada o fuera de la foto.'
    if item['category'] in ('parte superior','abrigo'):
        layers=[g for g in items if g['category'] in ('parte superior','abrigo')]
        if len(layers)>1:
            color=item['color'].casefold()
            other_colors=[g['color'].casefold() for g in layers if g is not item]
            hsv=cv2.cvtColor(np.asarray(image.convert('RGB')),cv2.COLOR_RGB2HSV)
            if any(v in color for v in ['blanc','white']) and all('blanc' not in c for c in other_colors):
                mask &= (hsv[:,:,2]>125)&(hsv[:,:,1]<85)
            elif any(v in color for v in ['negro','marino','black']) and any('blanc' in c for c in other_colors):
                mask &= hsv[:,:,2]<110
            else:
                return None, 'Capas de ropa superpuestas: no se han podido separar con fiabilidad. Usa otra foto o corrige manualmente.'
            warning='Prenda parcial: separación por ropa y color; las zonas tapadas no se reconstruyen.'
    n,components,stats,_=cv2.connectedComponentsWithStats(mask.astype('uint8'))
    if n<=1:
        return None, 'No se localizó una máscara fiable. Revisa el recorte.'
    largest=max(stats[1:,4])
    keep=[i for i in range(1,n) if stats[i,4]>=max(40,largest*.04)]
    mask=np.isin(components,keep).astype('uint8')*255
    if np.count_nonzero(mask)<image.width*image.height*.0005:
        return None, 'La zona visible es demasiado pequeña para aislarla.'
    return mask, warning


def masked_extract(image, mask):
    alpha=Image.fromarray(mask)
    bounds=alpha.getbbox()
    crop=image.crop(bounds).convert('RGB')
    cutout=crop.convert('RGBA')
    cutout.putalpha(alpha.crop(bounds))
    x1,y1,x2,y2=bounds
    box=[round(x1*1000/image.width),round(y1*1000/image.height),round(x2*1000/image.width),round(y2*1000/image.height)]
    return crop,cutout,box
