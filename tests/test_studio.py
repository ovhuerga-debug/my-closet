import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from server import Closet, make_handler, capture_date
from studio import Studio, make_portrait, match_tags, render_image_edit, validate_image_edit, season_for_date

TAGS=[{'name':'Camisa de algodón','category':'parte superior','color':'Azul claro'},
      {'name':'Pantalón vaquero','category':'pantalón','color':'Azul oscuro'}]


def photo_bytes():
    output=io.BytesIO();Image.new('RGB',(200,300),'#334455').save(output,'JPEG');return output.getvalue()


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.c=Closet(self.temp.name,key='test-only')
        self.calls=[]
        def ask(prompt,schema,image):
            self.calls.append((prompt,image))
            if image:return {'garments':TAGS},{'input_tokens':100,'output_tokens':20}
            ids=[p['id'] for p in self.s.status()['photos']]
            return {'suggestions':[{'title':'Tu camisa azul','reason':'Camisa azul claro con tu vaquero.','photo_ids':ids[:1]},
                                   {'title':'Inventado','reason':'No debe aparecer','photo_ids':['not-in-wardrobe']}]},{'input_tokens':30,'output_tokens':15}
        self.s=Studio(self.c,ask)
        self.pid=self.c.upload(photo_bytes(),'outfit.heic')['id'];self.s.sync()

    def tearDown(self):self.temp.cleanup()

    def test_seasons_use_capture_date_and_manual_override(self):
        self.assertEqual([season_for_date('2024-'+m+'-15') for m in ('01','04','07','10')],['invierno','primavera','verano','otoño'])
        self.assertEqual(self.s.status()['photos'][0]['season'],'')
        self.s.edit(self.pid,{'tags':TAGS,'captured_date':'2024-07-15'})
        self.assertEqual(len(self.s.search('camisa','verano')['photos']),1)
        self.assertEqual(self.s.search('camisa','invierno')['photos'],[])
        self.s.edit(self.pid,{'season_override':'invierno'})
        self.assertEqual(Studio(self.c,self.s.ask).status()['photos'][0]['season'],'invierno')
        self.assertEqual(self.s.looks('look de verano')['suggestions'],[])
        self.assertEqual(self.calls,[])
        for body in ({'captured_date':'2024-99-01'},{'season_override':'otra'}):
            with self.assertRaises(ValueError):self.s.edit(self.pid,body)
        self.s.edit(self.pid,{'season_override':''})
        self.assertEqual(self.s.status()['photos'][0]['season'],'verano')

    def test_capture_day_preserved_but_exif_removed(self):
        image=Image.new('RGB',(200,300),'red');exif=Image.Exif();exif[36867]='2023:10:07 12:30:45'
        data=io.BytesIO();image.save(data,'JPEG',exif=exif)
        self.assertEqual(capture_date(data.getvalue()),'2023-10-07')
        pid=self.c.upload(data.getvalue(),'dated.jpg')['id'];self.s.sync()
        photo=next(p for p in self.s.status()['photos'] if p['id']==pid)
        self.assertEqual(photo['season'],'otoño')
        with Image.open(self.c.media/(pid+'.jpg')) as saved:self.assertFalse(saved.getexif())

    def test_blue_light_shirt_matches_same_garment_not_other_blue_item(self):
        self.assertEqual(match_tags(TAGS,'camisa azul clarito'),[0])
        self.assertEqual(match_tags(TAGS,'pantalón vaquero'),[1])
        self.assertEqual(match_tags(TAGS,'camisa azul oscuro'),[])
        self.assertEqual(match_tags([{'name':'Camisa blanca','category':'parte superior','color':'Blanca'}],'camisa blanca'),[0])
        self.assertEqual(match_tags([{'name':'Camiseta','category':'parte superior','color':'Azul claro'}],'camisa azul claro'),[])

    def test_portrait_is_whole_outfit_fixed_size_uniform_gray(self):
        image=Image.new('RGB',(200,300),'#334455')
        labels=np.zeros((300,200),dtype='uint8');labels[20:280,70:140]=4;labels[60:90,50:70]=14
        data,flags=make_portrait(image,'gray',labels=labels)
        result=Image.open(io.BytesIO(data))
        self.assertEqual(result.size,(1000,1250))
        self.assertTrue(all(abs(a-b)<3 for a,b in zip(result.getpixel((0,0)),(232,232,230))))
        # The hand remains part of the whole foreground rather than a clothing-only mask.
        self.assertTrue(len(data)>1000)
        self.assertEqual(flags,[])

    def test_index_search_edit_and_persistence_without_garment_extraction(self):
        self.s.index(self.pid)
        self.assertEqual(len(self.calls),1)
        result=self.s.search('camisa azul clarito')
        self.assertEqual(result['photos'][0]['id'],self.pid)
        self.assertEqual(result['photos'][0]['matchedTags'],[0])
        self.assertEqual(self.c.snapshot()['garments'],[])
        self.assertEqual(self.c.snapshot()['photos'][0]['state'],'review')
        self.s.edit(self.pid,{'tags':[{'name':'Camisa','category':'parte superior','color':'Blanco'}]})
        self.assertEqual(self.s.search('camisa azul clarito')['photos'],[])
        reopened=Studio(Closet(self.temp.name),lambda *_:None)
        self.assertEqual(len(reopened.search('camisa blanca')['photos']),1)

    def test_look_suggestions_only_contain_existing_matching_photo_ids(self):
        self.s.index(self.pid)
        result=self.s.looks('hazme un look con camisa azul clarito')
        self.assertEqual(len(result['suggestions']),1)
        self.assertEqual(result['suggestions'][0]['photo_ids'],[self.pid])
        no_matches=self.s.looks('camisa roja')
        self.assertEqual(no_matches['suggestions'],[])
        self.assertEqual(len(self.calls),2) # No paid AI request for no matching evidence.

    def test_visual_does_not_use_paid_ai_and_original_is_unchanged(self):
        original=(self.c.media/(self.pid+'.jpg')).read_bytes()
        with patch('studio.foreground_alpha',return_value=Image.new('L',(200,300),255)):
            # Uniform all-foreground mask still keeps the full source photograph.
            self.s.visual(self.pid)
        self.assertEqual(self.calls,[])
        self.assertEqual((self.c.media/(self.pid+'.jpg')).read_bytes(),original)
        self.assertTrue((self.c.media/(self.pid+'-studio.jpg')).exists())
        state=self.s.status()['photos'][0]
        self.assertEqual(state['visual_state'],'ready')
        self.assertEqual(state['background'],'gray')
        self.s.edit(self.pid,{'approved':True})
        self.s.control({'background':'ivory'})
        state=self.s.status()['photos'][0]
        self.assertEqual(state['visual_state'],'queued')
        self.assertEqual(state['approved'],0)
        self.c.delete_photo(self.pid)
        self.assertEqual(self.s.status()['photos'],[])
        self.assertFalse((self.c.media/(self.pid+'-studio.jpg')).exists())

    def test_single_garment_look_can_use_complementary_photo(self):
        self.s.edit(self.pid,{'tags':[TAGS[0]]})
        buffer=io.BytesIO();Image.new('RGB',(201,300),'black').save(buffer,'JPEG')
        other=self.c.upload(buffer.getvalue(),'pantalon.jpg')['id'];self.s.sync()
        self.s.edit(other,{'tags':[{'name':'Pantalón vaquero','category':'pantalón','color':'Negro'}]})
        self.s.ask=lambda *_:({'suggestions':[{'title':'Camisa y vaquero','reason':'Combina estas dos prendas reales.','photo_ids':[self.pid,other]}]}, {})
        result=self.s.looks('camisa azul clarito')
        self.assertEqual([p['id'] for p in result['photos']],[self.pid])
        self.assertEqual(set(result['suggestions'][0]['photo_ids']),{self.pid,other})
        self.assertEqual({p['id'] for p in result['suggestion_photos']},{self.pid,other})
        self.s.edit(other,{'approved':True})
        self.assertTrue(next(p for p in self.s.status()['photos'] if p['id']==other)['approved'])

    def test_reframing_persists_and_restores_original_without_ai(self):
        original=(self.c.media/(self.pid+'.jpg')).read_bytes()
        edit={'rotation':90,'crop':[.25,0,.5,1]}
        self.s.edit(self.pid,{'image_edit':edit})
        record=self.s.status()['photos'][0]
        self.assertEqual(record['image_edit'],edit)
        self.assertEqual(record['edit_revision'],1)
        with Image.open(self.c.media/(self.pid+'-edit.jpg')) as result:
            self.assertEqual(result.size,(150,200))
        reopened=Studio(Closet(self.temp.name),lambda *_:None)
        self.assertEqual(reopened.status()['photos'][0]['image_edit'],edit)
        self.s.edit(self.pid,{'image_edit':None})
        record=self.s.status()['photos'][0]
        self.assertEqual(record['image_edit'],{})
        self.assertEqual(record['edit_revision'],2)
        self.assertEqual((self.c.media/(self.pid+'.jpg')).read_bytes(),original)
        self.assertEqual(self.calls,[])
        self.c.delete_photo(self.pid)
        self.assertFalse((self.c.media/(self.pid+'-edit.jpg')).exists())

    def test_rotation_and_crop_match_visible_pixels(self):
        image=Image.new('RGB',(200,300),'red')
        image.paste(Image.new('RGB',(200,150),'blue'),(0,150))
        result=Image.open(io.BytesIO(render_image_edit(image,{'rotation':90,'crop':[0,0,.5,1]})))
        self.assertEqual(result.size,(150,200))
        red,green,blue=result.getpixel((70,100))
        self.assertGreater(blue,240)
        self.assertLess(red,15)

    def test_invalid_crop_does_not_change_saved_image(self):
        for edit in [ {'rotation':45,'crop':[0,0,1,1]},
                      {'rotation':0,'crop':[-.1,0,.5,.5]},
                      {'rotation':0,'crop':[.9,0,.5,1]},
                      {'rotation':0,'crop':[0,0,float('nan'),1]},
                      {'rotation':0,'crop':[0,0,.01,.01]} ]:
            with self.assertRaises(ValueError):self.s.edit(self.pid,{'image_edit':edit})
        self.assertEqual(self.s.status()['photos'][0]['image_edit'],{})
        self.assertFalse((self.c.media/(self.pid+'-edit.jpg')).exists())

    def test_index_error_pauses_paid_queue_and_preserves_photo(self):
        self.s.ask=lambda *_:(_ for _ in ()).throw(RuntimeError('No hay saldo'))
        self.s.control({'indexRunning':True});self.s.index(self.pid)
        state=self.s.status()
        self.assertFalse(state['indexRunning'])
        self.assertEqual(state['photos'][0]['index_state'],'error')
        self.assertTrue((self.c.media/(self.pid+'.jpg')).exists())

if __name__=='__main__':unittest.main()
