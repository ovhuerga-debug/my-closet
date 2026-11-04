import sys
from pathlib import Path
import unittest
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from clothing import garment_mask, masked_extract

class ClothingTests(unittest.TestCase):
    def test_excludes_skin_and_uses_actual_pixels_not_ai_box(self):
        image=Image.new('RGB',(100,100),'white')
        labels=np.zeros((100,100),dtype='uint8')
        labels[30:80,20:70]=6
        labels[30:50,20:40]=14
        item={'category':'pantalón','color':'Azul','bbox':[0,0,1000,1000]}
        mask,_=garment_mask(image,labels,item,[item])
        self.assertEqual(mask[40,30],0)
        self.assertEqual(mask[60,30],255)
        crop,cutout,box=masked_extract(image,mask)
        self.assertEqual(box,[200,300,700,800])
        self.assertEqual(cutout.getchannel('A').getextrema(),(0,255))

    def test_does_not_claim_ambiguous_layers_are_separated(self):
        image=Image.new('RGB',(100,100),'blue')
        labels=np.full((100,100),4)
        first={'category':'parte superior','color':'Azul'}
        second={'category':'abrigo','color':'Azul'}
        mask,warning=garment_mask(image,labels,first,[first,second])
        self.assertIsNone(mask)
        self.assertIn('no se han podido separar',warning)

if __name__=='__main__':unittest.main()
