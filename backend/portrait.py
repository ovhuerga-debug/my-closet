"""Foreground matting for the complete outfit. ONNX data only, no remote execution."""
from pathlib import Path
import threading
import numpy as np
from PIL import Image
import cv2
from clothing import clothing_labels

MODEL=Path(__file__).resolve().parent.parent/'models/portrait.onnx'
_session=None
_lock=threading.Lock()


def foreground_alpha(image):
    global _session
    if not MODEL.is_file():raise RuntimeError('Falta instalar el modelo local de fondo. El original se conserva.')
    import onnxruntime as ort
    with _lock:
        if _session is None:
            opts=ort.SessionOptions();opts.intra_op_num_threads=2
            _session=ort.InferenceSession(str(MODEL),sess_options=opts,providers=['CPUExecutionProvider'])
        a=np.asarray(image.convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)).astype('float32')
        a=a/max(float(a.max()),1)-.5
        result=_session.run(None,{_session.get_inputs()[0].name:a.transpose(2,0,1)[None]})[0][0,0]
    low,high=float(result.min()),float(result.max())
    if high-low<1e-5:raise RuntimeError('No se pudo distinguir el primer plano. Se conserva el original.')
    mask=Image.fromarray(np.clip((result-low)/(high-low)*255,0,255).astype('uint8'))
    mask=mask.resize(image.size,Image.Resampling.LANCZOS)
    alpha=np.asarray(mask).astype('float32')/255
    alpha=np.clip((alpha-.35)/.65,0,1)
    labels=clothing_labels(image)
    if labels is not None:
        person=(labels>0).astype('uint8')
        core_person=cv2.erode(person,np.ones((3,3),dtype='uint8'))
        alpha=np.maximum(alpha,core_person.astype('float32'))
        support=person
        # Include held objects and soft garment edges near the person, suppress room clutter.
        radius=max(15,round(min(image.size)*.08))
        support=cv2.dilate(support,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1)))
        alpha*=support
    core=cv2.morphologyEx((alpha>.45).astype('uint8'),cv2.MORPH_OPEN,np.ones((11,11),dtype='uint8'))
    alpha*=cv2.dilate(core,np.ones((3,3),dtype='uint8'))
    return Image.fromarray((alpha*255).astype('uint8'))
