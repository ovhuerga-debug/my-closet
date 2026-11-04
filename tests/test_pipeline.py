import io
import base64
import json
import socket
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from server import Closet, detect, extract, make_handler, normalized_box, prepare_image, open_response


def outfit_bytes():
    image = Image.new('RGB', (400, 600), '#eee9dd')
    draw = ImageDraw.Draw(image)
    draw.polygon([(140,70),(260,70),(320,170),(270,200),(250,140),(250,285),(150,285),(150,140),(130,200),(80,170)], fill='#234b99')
    draw.polygon([(150,300),(250,300),(270,520),(215,520),(200,380),(185,520),(130,520)], fill='#282828')
    output = io.BytesIO()
    image.save(output,'JPEG')
    return output.getvalue()


def detections(*_):
    return [dict(name='Camiseta azul', category='parte superior', color='Azul', confidence=.9,bbox=[190,100,810,490]),dict(name='Pantalón negro', category='pantalón', color='Negro', confidence=.9,bbox=[310,490,690,880])], {'input_tokens':100,'output_tokens':50}


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.closet = Closet(self.temp.name, key='test-only', detector=detections, daily_limit=2)

    def tearDown(self):
        self.temp.cleanup()

    def test_pipeline_persists_and_deduplicates(self):
        raw = outfit_bytes()
        first = self.closet.upload(raw,'outfit.jpg')
        self.assertFalse(first['duplicate'])
        self.assertTrue(self.closet.upload(raw,'renamed.jpg')['duplicate'])
        self.assertFalse(self.closet.process_one())  # Explicit consent/start required.
        self.closet.pause(False)
        self.assertTrue(self.closet.process_one())
        state = self.closet.snapshot()
        self.assertEqual(state['photos'][0]['state'],'review')
        self.assertEqual(len(state['garments']),2)
        self.assertEqual(state['dailyCalls'],1)
        garment = state['garments'][0]
        self.closet.review(garment['id'],dict(state='approved',name='Mi pantalón'))
        reopened = Closet(self.temp.name,key='test-only')
        self.assertEqual(reopened.snapshot()['garments'][0]['name'],'Mi pantalón')
        self.assertEqual(reopened.snapshot()['garments'][0]['state'],'approved')
        archive = zipfile.ZipFile(io.BytesIO(self.closet.backup()))
        self.assertIn('closet.sqlite3', archive.namelist())
        self.assertTrue(any(n.endswith('.png') for n in archive.namelist()))
        self.assertFalse(any('.env' in n for n in archive.namelist()))
        self.closet.delete_photo(first['id'])
        self.assertFalse(self.closet.snapshot()['photos'])
        self.assertFalse(self.closet.snapshot()['garments'])
        self.assertFalse(list(self.closet.media.iterdir()))

    def test_real_segmentation_has_foreground_and_transparency(self):
        image=Image.open(io.BytesIO(outfit_bytes()))
        crop, cutout, phash = extract(image,[190,100,810,490])
        self.assertIsNotNone(cutout)
        alpha=Image.open(io.BytesIO(cutout)).getchannel('A')
        self.assertEqual(alpha.getextrema(),(0,255))
        self.assertEqual(len(phash),64)
        self.assertEqual(Image.open(io.BytesIO(crop)).mode,'RGB')

    def test_failure_pauses_and_does_not_retry_or_charge_in_loop(self):
        self.closet.detector=lambda *_: (_ for _ in ()).throw(RuntimeError('Sin cuota'))
        self.closet.upload(outfit_bytes(),'error.jpg')
        self.closet.pause(False)
        self.closet.process_one()
        self.assertEqual(self.closet.snapshot()['photos'][0]['state'],'error')
        self.assertTrue(self.closet.snapshot()['paused'])
        self.assertFalse(self.closet.process_one())
        self.assertEqual(self.closet.snapshot()['dailyCalls'],1)

    def test_daily_limit(self):
        self.closet.daily_limit=0
        self.closet.upload(outfit_bytes(),'limited.jpg')
        self.closet.pause(False)
        self.assertFalse(self.closet.process_one())
        self.assertEqual(self.closet.snapshot()['dailyCalls'],0)
        self.assertTrue(self.closet.snapshot()['paused'])

    def test_possible_duplicate_requires_approved_target(self):
        pid=self.closet.upload(outfit_bytes(),'one.jpg')['id']
        items,_=detections()
        self.closet.add_garments(pid,items[:1])
        self.closet.add_garments(pid,items[:1])
        newest,original=self.closet.snapshot()['garments']
        self.assertEqual(newest['duplicate_of'],original['id'])
        with self.assertRaises(ValueError):
            self.closet.review(newest['id'],{'state':'duplicate'})
        self.closet.review(original['id'],{'state':'approved'})
        self.closet.review(newest['id'],{'state':'duplicate'})
        self.assertEqual(self.closet.snapshot()['garments'][0]['state'],'duplicate')

    def test_provider_timeout_explains_photo_is_saved(self):
        with patch('server.open_response', side_effect=socket.timeout()):
            with self.assertRaisesRegex(RuntimeError, 'La foto sigue guardada'):
                detect(outfit_bytes(), 'test-only', 'test-model')

    def test_heic_upload_converts_to_jpeg_without_exif(self):
        raw=base64.b64decode((Path(__file__).parent/'fixtures/outfit.heic.b64').read_text())
        converted=prepare_image(raw)
        with Image.open(io.BytesIO(converted)) as image:
            self.assertEqual(image.format,'JPEG')
            self.assertEqual(image.size,(400,600))
            self.assertFalse(image.getexif())
        upload=self.closet.upload(raw,'outfit.HEIC')
        self.assertTrue((self.closet.media/(upload['id']+'.jpg')).is_file())
        self.assertEqual(self.closet.snapshot()['photos'][0]['state'],'queued')
        self.assertTrue(self.closet.upload(raw,'same.heif')['duplicate'])

    def test_exhausted_credit_has_clear_message(self):
        error=urllib.error.HTTPError('https://api.openai.com/v1/responses',429,'quota',{},io.BytesIO(b'{"error":{"code":"credit_balance_exhausted"}}'))
        with patch('server.open_response',side_effect=error):
            with self.assertRaisesRegex(RuntimeError,'Saldo o cuota de OpenAI agotados'):
                detect(outfit_bytes(),'test-only','test-model')

    def test_system_transport_keeps_key_out_of_command_arguments(self):
        request=urllib.request.Request('https://api.openai.com/v1/responses',data=b'{}',headers={'Authorization':'Bearer test-private-value'})
        with patch('subprocess.run',return_value=SimpleNamespace(returncode=0,stdout='{"status":"completed"}\n200')) as run:
            with open_response(request) as response:
                self.assertEqual(json.load(response)['status'],'completed')
        args,kwargs=run.call_args
        self.assertNotIn('test-private-value',' '.join(args[0]))
        self.assertIn('Bearer test-private-value',kwargs['input'])
        self.assertNotIn('shell',kwargs)

    def test_input_validation(self):
        for box in [[1,1,1,1],[float('nan'),0,900,900],['0',0,900,900],None]:
            with self.assertRaises(ValueError): normalized_box(box)
        with self.assertRaises(ValueError): prepare_image(b'not an image')


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.closet=Closet(self.temp.name)
        self.http=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.closet,'private-test-token',{'https://allowed.example'}))
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.thread.start()
        self.base='http://127.0.0.1:'+str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.temp.cleanup()

    def request(self,path,body=None,method=None,auth=True,origin=None):
        headers={'Authorization':'Bearer private-test-token'} if auth else {}
        if origin:headers['Origin']=origin
        req=urllib.request.Request(self.base+path,data=body,method=method,headers=headers)
        return urllib.request.urlopen(req)

    def test_auth_static_allowlist_and_cors(self):
        for path in ['/api/status','/api/backup']:
            with self.assertRaises(urllib.error.HTTPError) as ctx:self.request(path,auth=False)
            self.assertEqual(ctx.exception.code,401)
        for path in ['/.env.local','/backend/server.py','/data/closet.sqlite3','/api/images/..%2F.env.local']:
            with self.assertRaises(urllib.error.HTTPError) as ctx:self.request(path)
            self.assertEqual(ctx.exception.code,404)
        with self.assertRaises(urllib.error.HTTPError) as ctx:self.request('/api/status',origin='https://evil.example')
        self.assertEqual(ctx.exception.code,403)
        response=self.request('/api/status',origin='https://allowed.example')
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.assertEqual(response.headers['Access-Control-Allow-Origin'],'https://allowed.example')
        self.assertNotIn('private-test-token',response.read().decode())

    def test_iphone_install_assets_are_public_but_private_data_stays_protected(self):
        manifest=json.load(self.request('/manifest.webmanifest',auth=False))
        self.assertEqual(manifest['start_url'],'./batch.html')
        self.assertEqual(manifest['display'],'standalone')
        for name,size in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
            response=self.request('/'+name,auth=False)
            self.assertEqual(response.headers['Content-Type'],'image/png')
            image=Image.open(io.BytesIO(response.read()))
            self.assertEqual(image.size,(size,size));self.assertEqual(image.mode,'RGB')
        page=self.request('/batch.html',auth=False).read().decode()
        self.assertIn('apple-mobile-web-app-capable',page)
        self.assertIn('apple-touch-icon.png',page)
        self.assertIn('viewport-fit=cover',page)
        worker=self.request('/sw.js',auth=False).read().decode()
        self.assertIn("url.pathname.includes('/api/')",worker)
        self.assertIn("event.request.headers.has('Authorization')",worker)

    def test_upload_manual_review_delete(self):
        uploaded=json.load(self.request('/api/photos?name=outfit.jpg',outfit_bytes(),'POST'))
        pid=uploaded['id']
        item=detections()[0][0]
        self.request('/api/photos/'+pid+'/manual',json.dumps(item).encode(),'POST').read()
        garment=self.closet.snapshot()['garments'][0]
        self.request('/api/garments/'+garment['id'],json.dumps({'state':'approved'}).encode(),'PATCH').read()
        self.assertEqual(self.closet.snapshot()['garments'][0]['state'],'approved')
        self.request('/api/photos/'+pid,method='DELETE').read()
        self.assertEqual(self.closet.snapshot()['garments'],[])



class BatchCapacityTests(unittest.TestCase):
    def test_200_pending_photos_survive_restart_and_201st_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            closet=Closet(directory)
            for i in range(200):
                image=Image.new('RGB',(80,80),(i,100,180))
                ImageDraw.Draw(image).text((4,4),str(i),fill='white')
                buffer=io.BytesIO();image.save(buffer,'PNG')
                self.assertFalse(closet.upload(buffer.getvalue(),str(i)+'.png')['duplicate'])
            self.assertEqual(len(Closet(directory).snapshot()['photos']),200)
            with self.assertRaises(ValueError):closet.upload(outfit_bytes(),'201.jpg')

if __name__=='__main__':unittest.main()
