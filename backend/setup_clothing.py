"""Download pinned clothing model weights for private local use."""
from pathlib import Path
import hashlib
import urllib.request
URL='https://huggingface.co/mattmdjaga/segformer_b2_clothes/resolve/584abc1e1d260e23c0fc627c5217a09b2b461046/onnx/model.onnx'
SHA256='a93a8dac171b5c1fcc53632a8bfc180bfd9759ea69a3e207451bb07f76add54f'
if __name__=='__main__':
    destination=Path(__file__).resolve().parent.parent/'models/clothes.onnx'
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=destination.with_suffix('.download')
    try:
        urllib.request.urlretrieve(URL,temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest()!=SHA256:
            raise RuntimeError('La descarga no coincide con el modelo verificado.')
        temporary.replace(destination)
        print('Modelo de ropa instalado. Reinicia MY CLOSET.')
    finally:
        temporary.unlink(missing_ok=True)
