import {categoryFor} from './closet-catalog.mjs?v=20261112e';
import {garmentPhotoURL} from './garment-photos.mjs?v=travel1';

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function colorFamilies(value) {
  const text=fold(value);
  return ['beige|crudo|crema|marfil|blanco roto','blanco','negro|antracita','azul|celeste|marino','verde|caqui|oliva','marron|camel|miel|tostado','rosa','rojo|granate|burdeos','gris','amarillo|mostaza','naranja','morado|violeta']
    .filter(pattern=>new RegExp(pattern).test(text));
}
export function similarGarments(result, catalog) {
  const category = categoryFor({name:result.nombre, category:result.categoria});
  const colors = (Array.isArray(result.colores) ? result.colores : [result.colores]).filter(Boolean).map(fold);
  const words = fold([result.nombre,result.descripcion,result.estampado].join(' ')).split(/[^a-z0-9]+/).filter(word=>word.length>3);
  const families=colorFamilies(colors.join(' '));
  return catalog.filter(item=>categoryFor(item)===category).map(item=>{
    const text = fold([item.name,item.color,item.description,item.pattern].join(' '));
    const itemFamilies=colorFamilies([item.color,...(item.colors||[])].join(' '));
    if(families.length&&!families.some(color=>itemFamilies.includes(color)))return {item,score:0};
    const score = colors.filter(color=>text.includes(color)).length * 8 + new Set(words.filter(word=>text.includes(word))).size;
    return {item,score};
  }).filter(({score})=>score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(({item})=>item);
}

export function createLookGarments({client, getCatalog, analyzePhoto, prepare}) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label','Sacar una prenda del look');
  dialog.style.cssText = 'width:min(94vw,640px);max-height:90dvh;overflow:auto;padding:20px';
  dialog.innerHTML = '<h2>Sacar una prenda</h2><p>Encuadra una prenda visible. Después podrás analizarla, revisar parecidos y preparar su ficha.</p><label>Zona de la foto<select id="lookPieceZone"><option value="top">Parte superior</option><option value="bottom">Pantalón o falda</option><option value="shoes">Calzado</option><option value="whole">Foto completa</option></select></label><canvas aria-label="Recorte de la prenda" style="display:block;max-width:100%;height:auto;max-height:38dvh;margin:12px auto"></canvas><div class="field-grid"></div><p role="status"></p><div class="look-piece-matches"></div><div class="card-actions"><button type="button" data-action="analyze">Analizar prenda</button><button type="button" data-action="prepare" disabled>Preparar ficha en Tu ropa</button><button type="button" data-action="close" class="secondary">Cerrar</button></div>';
  document.body.append(dialog);
  const canvas=dialog.querySelector('canvas');
  const zone=dialog.querySelector('select');
  const status=dialog.querySelector('[role=status]');
  const matches=dialog.querySelector('.look-piece-matches');
  const analyze=dialog.querySelector('[data-action=analyze]');
  const next=dialog.querySelector('[data-action=prepare]');
  const close=dialog.querySelector('[data-action=close]');
  const ranges={};
  for (const [key,label] of [['x','Izquierda'],['y','Arriba'],['w','Ancho'],['h','Alto']]) {
    const wrapper=document.createElement('label');
    wrapper.textContent=label;
    const input=document.createElement('input');
    input.type='range'; input.min=key==='w'||key==='h'?'5':'0'; input.max='100'; input.step='1';
    wrapper.append(input);dialog.querySelector('.field-grid').append(wrapper);
    ranges[key]=input;input.oninput=draw;
  }
  let revision=0, image=null, objectURL=null, row=null, result=null, working=false;
  const presets={top:[15,27,64,42],bottom:[18,62,49,31],shoes:[22,86,45,14],whole:[0,0,100,100]};
  function setBusy(value) {
    working=value;
    analyze.disabled=value||!image;
    next.disabled=value||!result;
    zone.disabled=value;
    Object.values(ranges).forEach(input=>{input.disabled=value;});
  }
  function draw() {
    if (!image || working) return;
    revision++; result=null; next.disabled=true;matches.replaceChildren();status.textContent='';
    const x=Number(ranges.x.value)/100, y=Number(ranges.y.value)/100;
    const w=Math.min(Number(ranges.w.value)/100,1-x), h=Math.min(Number(ranges.h.value)/100,1-y);
    if(w<=0||h<=0){canvas.width=canvas.height=0;analyze.disabled=true;status.textContent='Desplaza el recorte dentro de la foto.';return;}
    const scale=Math.min(1,1000/(image.naturalWidth*w),1000/(image.naturalHeight*h));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*w*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*h*scale));
    canvas.getContext('2d').drawImage(image,image.naturalWidth*x,image.naturalHeight*y,image.naturalWidth*w,image.naturalHeight*h,0,0,canvas.width,canvas.height);
    analyze.disabled=false;
  }
  function selectZone() {
    Object.keys(ranges).forEach((key,index)=>{ranges[key].value=presets[zone.value][index];}); draw();
  }
  zone.onchange=selectZone;
  function blob() {
    return new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('No se pudo preparar el recorte.')),'image/jpeg',.9));
  }
  analyze.onclick=async()=>{
    if(working||!image)return;
    const token=revision;
    setBusy(true);status.textContent='Analizando la prenda…';
    try {
      const analysis=await analyzePhoto(await blob(),()=>dialog.open&&token===revision);
      if(!dialog.open||token!==revision)return;
      result=analysis;matches.replaceChildren();
      const title=document.createElement('p');
      title.textContent=analysis.nombre||'Prenda analizada';matches.append(title);
      const found=similarGarments(analysis,getCatalog());
      const heading=document.createElement('p');
      heading.textContent=found.length?'Parecidos por tipo, color y descripción. Comprueba si ya es una de estas prendas.':'Puedes revisar la ficha antes de guardarla.';
      matches.append(heading);
      for(const garment of found){
        const card=document.createElement('div');card.style.cssText='display:flex;gap:12px;align-items:center;margin:10px 0';
        const img=document.createElement('img');img.alt=garment.name;img.style.cssText='width:68px;height:84px;object-fit:contain';
        garmentPhotoURL(client.storage.from('closet-images'),garment.image_path).then(url=>{if(token===revision&&dialog.open)img.src=url;}).catch(()=>{img.alt='Foto no disponible';});
        const name=document.createElement('span');name.textContent=garment.name;
        const same=document.createElement('button');same.type='button';same.className='secondary';same.textContent='Ya la tengo';
        same.onclick=()=>{status.textContent='Usa la ficha existente de '+garment.name+'.';next.disabled=true;};
        card.append(img,name,same);matches.append(card);
      }
      status.textContent='Análisis listo. Revisa las coincidencias antes de crear una ficha.';
    }catch(error){if(dialog.open&&token===revision)status.textContent=error.message;}
    finally{if(token===revision)setBusy(false);}
  };
  next.onclick=async()=>{
    if(!result||working)return;
    const token=revision, analysis=result;
    setBusy(true);
    try {
      const file=new File([await blob()],'prenda-del-look-'+row.id+'.jpg',{type:'image/jpeg'});
      if(!dialog.open||token!==revision)return;
      prepare(file,analysis,row);
      dialog.close();
    }catch(error){status.textContent=error.message;}finally{if(token===revision)setBusy(false);}
  };
  close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{revision++;image=null;result=null;row=null;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;});
  return {
    async open(outfit) {
      if(dialog.open)return;
      row=outfit;revision++;const token=revision;
      image=null;result=null;matches.replaceChildren();canvas.width=canvas.height=0;
      dialog.showModal();setBusy(true);status.textContent='Abriendo la foto original…';
      try{
        const {data,error}=await client.storage.from('closet-images').download(outfit.image_path);
        if(error)throw error;
        if(!dialog.open||token!==revision)return;
        objectURL=URL.createObjectURL(data);
        const photo=new Image();
        await new Promise((resolve,reject)=>{photo.onload=resolve;photo.onerror=()=>reject(Error('No se pudo abrir la foto.'));photo.src=objectURL;});
        if(!dialog.open||token!==revision)return;
        image=photo;working=false;zone.value='top';selectZone();setBusy(false);
      }catch(error){if(dialog.open&&token===revision){setBusy(false);status.textContent=error.message;}}
    },
    reset(){if(dialog.open)dialog.close();}
  };
}
