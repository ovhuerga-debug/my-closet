'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories=['parte superior','pantalón','falda','vestido','abrigo','calzado','accesorio'];
let base=sessionStorage.getItem('closet-server')||location.origin;
let token=sessionStorage.getItem('closet-token')||'';
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('token')){token=fragment.get('token');sessionStorage.setItem('closet-token',token);history.replaceState(null,'',location.pathname+location.search);}
$('server').value=base;$('token').value=token;
let state=null,connected=false,view='album',limit=24,uploading=false,polling=false,editorId=null,lastSignature='',lastBackground=null;
let searchResult=null,lookResult=null,looking=false;
const cache=new Map(),originals=new Set();
const note=message=>$('notice').textContent=message||'';
async function api(path,options={}){
  const response=await fetch(base+path,{...options,cache:'no-store',headers:{Authorization:'Bearer '+token,...options.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'No se pudo completar la operación.');}
  return response;
}
async function send(path,method,body){return (await api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();}
function clearCache(){for(const p of cache.values())p.then(URL.revokeObjectURL).catch(()=>{});cache.clear();}
async function loadImage(name){
  if(!cache.has(name)){const p=api('/api/images/'+name).then(r=>r.blob()).then(b=>URL.createObjectURL(b));cache.set(name,p);p.catch(()=>cache.delete(name));}
  return cache.get(name);
}
async function loadImages(){
  const nodes=[...document.querySelectorAll('img[data-image]')];
  await Promise.all(Array.from({length:4},async()=>{while(nodes.length){const img=nodes.shift();try{const url=await loadImage(img.dataset.image);if(img.isConnected)img.src=url;}catch{if(img.isConnected)img.alt='No se pudo cargar la foto';}}}));
}
function picture(p){const current=state?.photos.find(x=>x.id===p.id)||p;return current.image_edit&&Object.keys(current.image_edit).length?current.id+'-edit.jpg?v='+current.edit_revision:current.id+'.jpg';}
function tagMarkup(p,matches=[]){return p.tags.map((tag,i)=>`<button class="tag ${matches.includes(i)?'selected':''}" data-tag="${esc(tag.name+' '+tag.color)}">${esc(tag.name)} · ${esc(tag.color)}</button>`).join('');}
function card(p,matches=[]){
  const status=p.index_state==='ready'?'Prendas identificadas':p.index_state==='processing'?'Identificando prendas…':p.index_state==='error'?'Revisar etiquetas':'Foto original';
  return `<article class="card"><img class="photo" data-action="full" data-id="${p.id}" data-image="${picture(p)}" alt="Foto de tu ropa: ${esc(p.tags.map(t=>t.name).join(', ')||p.name)}" loading="lazy"><div class="body"><span class="status">${status} · ${esc(p.season||'Sin estación')}${p.approved?' · Aprobada':''}</span><h3>${esc(p.name)}</h3>${tagMarkup(p,matches)}${p.index_state==='queued'?'<p class="hint">Prendas pendientes de identificar.</p>':''}${p.index_state==='processing'?'<p class="hint">La IA está identificando las prendas…</p>':''}${p.index_error?`<p class="warning">${esc(p.index_error)}</p>`:''}<div class="actions"><button data-action="frame" data-id="${p.id}">Reencuadrar</button><button data-action="full" data-id="${p.id}">Ver foto completa</button><button data-action="approve" data-id="${p.id}">${p.approved?'Quitar favorita':'Guardar favorita'}</button><button data-action="edit" data-id="${p.id}">Revisar prendas</button>${p.index_state==='error'?`<button data-action="retry-index" data-id="${p.id}">Reintentar etiquetas</button>`:''}<button data-action="delete" data-id="${p.id}">Eliminar foto</button></div></div></article>`;
}
function empty(message){return `<p class="empty">${esc(message)}</p>`;}
function switchView(name){view=name;for(const n of ['album','search','looks'])$(n+'View').hidden=n!==name;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));render(true);}
function render(force=false){
  if(!state)return;
  const total=state.photos.length,ready=state.photos.filter(p=>p.visual_state==='ready').length,indexed=state.photos.filter(p=>p.index_state==='ready').length;
  $('photoCount').textContent=total;
  $('progress').max=total||1;$('progress').value=indexed;
  $('progressText').textContent=`${indexed}/${total} fotos con prendas identificadas. ${state.indexRunning?'Identificando prendas.':'Identificación en pausa.'}`;
  $('usage').textContent=`IA hoy: ${state.dailyCalls}/${state.dailyLimit} solicitudes. Puedes corregir las etiquetas de cada foto para mejorar las búsquedas.`;
  $('indexRun').textContent=state.indexRunning?'Pausar identificación':'Identificar prendas con IA';$('indexRun').disabled=!connected||!state.configured||!total;
  if(!force&&($('tagEditor').open||$('cropEditor').open))return;
  const signature=JSON.stringify([view,state.photos,limit,$('galleryFilter').value,[...originals]]);
  if(!force&&signature===lastSignature)return;lastSignature=signature;
  if(view==='album'){
    const filter=$('galleryFilter').value;
    const photos=state.photos.filter(p=>filter==='all'||filter==='ready'&&p.index_state==='ready'||filter==='pending'&&p.index_state!=='ready'||filter==='approved'&&p.approved||filter===p.season||filter==='undated'&&!p.season);
    // Show ready samples first, then the rest of the album.
    photos.sort((a,b)=>(b.index_state==='ready')-(a.index_state==='ready'));
    $('albumGrid').innerHTML=photos.slice(0,limit).map(p=>card(p)).join('')||empty('Tu álbum empieza con una foto de tu ropa.');
    $('more').hidden=photos.length<=limit;
  }
  if(view==='search'&&searchResult)renderSearch();
  if(view==='looks'&&lookResult)renderLooks();
  loadImages();
}
async function refresh(force=false){
  if(polling||!token)return;polling=true;
  try{
    state=await(await api('/api/studio')).json();connected=true;$('connectionState').textContent='· conectado';
    if(lastBackground&&lastBackground!==state.background)clearCache();lastBackground=state.background;
    if(view==='search'&&searchResult)searchResult=await(await api('/api/search?q='+encodeURIComponent(searchResult.query))).json();
    $('backup').disabled=false;$('files').disabled=uploading||!$('uploadConsent').checked;render(force);
    if($('notice').dataset.connectionError){note();delete $('notice').dataset.connectionError;}
  }catch(error){connected=false;$('connectionState').textContent='· sin conexión';$('indexRun').disabled=$('files').disabled=true;note(error.message==='Failed to fetch'?'El servidor local no está disponible. Tus fotos siguen guardadas en el ordenador.':error.message);$('notice').dataset.connectionError='1';}
  finally{polling=false;}
}
$('connectForm').addEventListener('submit',async event=>{
  event.preventDefault();try{const url=new URL($('server').value);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Usa HTTPS para servidores remotos.');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Introduce solo la dirección del servidor.');base=url.origin;token=$('token').value.trim();sessionStorage.setItem('closet-server',base);sessionStorage.setItem('closet-token',token);clearCache();await refresh(true);if(connected)$('connection').open=false;}catch(e){note(e.message);}
});
$('openUpload').onclick=()=>{$('uploadPanel').hidden=false;$('uploadPanel').scrollIntoView({behavior:'smooth'});};$('closeUpload').onclick=()=>$('uploadPanel').hidden=true;
$('uploadConsent').onchange=()=>{$('files').disabled=uploading||!connected||!$('uploadConsent').checked;};
$('files').addEventListener('change',async()=>{
  const files=[...$('files').files];if(!files.length)return;if(files.length>200){note('Selecciona hasta 200 fotos por lote.');$('files').value='';return;}
  uploading=true;$('files').disabled=true;$('uploadErrors').replaceChildren();let saved=0,duplicates=0,failed=0;
  for(let i=0;i<files.length;i++){
    const file=files[i];$('uploadStatus').textContent=`Guardando ${i+1}/${files.length}: ${file.name}`;
    try{if(file.size>15*1024*1024)throw Error('Supera los 15 MB.');if(!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(file.type)&&!/^.*\.(heic|heif|jpe?g|png|webp)$/i.test(file.name))throw Error('Formato no admitido.');const result=await(await api('/api/photos?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file})).json();result.duplicate?duplicates++:saved++;}
    catch(error){failed++;const li=document.createElement('li');li.textContent=file.name+': '+error.message;$('uploadErrors').append(li);}
  }
  uploading=false;$('files').value='';$('uploadStatus').textContent=`${saved} fotos guardadas · ${duplicates} repetidas omitidas · ${failed} con error. Las fotos nuevas seguirán los procesos que tengas activados.`;await refresh(true);
});
$('indexRun').onclick=async()=>{if(!state.indexRunning&&!$('aiConsent').checked){note('Marca la autorización para analizar las fotos con OpenAI.');return;}try{await send('/api/studio/control','POST',{indexRunning:!state.indexRunning});note();await refresh();}catch(e){note(e.message);}};
$('galleryFilter').onchange=()=>{limit=24;render(true);};$('more').onclick=()=>{limit+=24;render(true);};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
function renderSearch(){
  $('searchSummary').textContent=`${searchResult.photos.length} fotos coincidentes · ${searchResult.indexed}/${searchResult.total} fotos etiquetadas. Las prendas coincidentes están resaltadas.`;
  $('searchGrid').innerHTML=searchResult.photos.map(p=>card(p,p.matchedTags)).join('')||empty('Todavía no hay coincidencias entre las fotos etiquetadas. Identifica más fotos o revisa sus colores y prendas.');loadImages();
}
async function search(query){$('query').value=query;switchView('search');$('searchSummary').textContent='Buscando en tus prendas…';try{searchResult=await(await api('/api/search?q='+encodeURIComponent(query))).json();renderSearch();note();}catch(e){note(e.message);}}
$('searchForm').onsubmit=e=>{e.preventDefault();search($('query').value);};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>search(b.dataset.query));
function renderLooks(){
  const byId=new Map((lookResult.suggestion_photos||lookResult.photos).map(p=>[p.id,p]));
  $('lookStatus').textContent=lookResult.message||`${lookResult.suggestions.length} propuestas basadas en ${lookResult.photos.length} fotos de tu armario.`;
  $('lookSuggestions').innerHTML=lookResult.suggestions.map(s=>`<article class="suggestion"><p class="eyebrow">PROPUESTA DE IA · FOTOS REALES DE TU ARMARIO</p><h3>${esc(s.title)}</h3><p>${esc(s.reason)}</p><div class="references">${s.photo_ids.map(id=>{const p=byId.get(id);return `<div class="reference"><img data-image="${picture(p)}" alt="Outfit de referencia"><p class="hint">${esc(p.tags.map(t=>t.name+' '+t.color).join(' · '))}</p></div>`;}).join('')}</div></article>`).join('');
  $('lookMatchesTitle').hidden=!lookResult.photos.length;$('lookMatches').innerHTML=lookResult.photos.map(p=>card(p,p.matchedTags)).join('');loadImages();
}
$('looksForm').onsubmit=async e=>{
  e.preventDefault();if(looking)return;
  if(!$('aiConsent').checked){note('Marca la autorización de OpenAI para pedir propuestas de looks.');return;}
  looking=true;$('askLooks').disabled=true;$('lookStatus').textContent='Preparando propuestas con tus prendas…';
  try{lookResult=await send('/api/studio/looks','POST',{query:$('lookQuery').value||'Hazme un look',season:$('lookSeason').value});renderLooks();note();await refresh();}catch(e){$('lookStatus').textContent=e.message;}finally{looking=false;$('askLooks').disabled=false;}
};
function tagRow(tag={name:'',category:'parte superior',color:''}){return `<div class="tagRow"><input data-field="name" aria-label="Nombre de prenda" maxlength="120" required placeholder="Camisa" value="${esc(tag.name)}"><select data-field="category" aria-label="Categoría">${categories.map(c=>`<option ${tag.category===c?'selected':''}>${c}</option>`).join('')}</select><input data-field="color" aria-label="Color" maxlength="80" required placeholder="Azul claro" value="${esc(tag.color)}"><button type="button" data-remove-tag>Quitar</button></div>`;}
$('closePhoto').onclick=()=>$('photoViewer').close();
$('closeEditor').onclick=()=>$('tagEditor').close();$('addTag').onclick=()=>{if($('tagRows').children.length<20)$('tagRows').insertAdjacentHTML('beforeend',tagRow());};
$('tagsForm').onsubmit=async e=>{e.preventDefault();const tags=[...document.querySelectorAll('.tagRow')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value])));try{await send('/api/studio/photos/'+editorId,'PATCH',{tags,captured_date:$('photoDate').value,season_override:$('photoSeason').value});$('tagEditor').close();searchResult=lookResult=null;await refresh(true);}catch(e){$('editError').textContent=e.message;}};
document.addEventListener('click',async e=>{
  const remove=e.target.closest('[data-remove-tag]');if(remove){remove.closest('.tagRow').remove();return;}
  const tag=e.target.closest('[data-tag]');if(tag){search(tag.dataset.tag);return;}
  const b=e.target.closest('[data-action]');if(!b)return;const {action,id}=b.dataset;const p=state.photos.find(p=>p.id===id);if(!p)return;
  try{
    if(action==='frame'){await openCrop(p);return;}
    if(action==='full'){$('fullPhoto').src=await loadImage(picture(p));$('photoViewer').showModal();return;}
    if(action==='edit'){editorId=id;$('photoDate').value=p.captured_date||'';$('photoSeason').value=p.season_override||'';$('tagRows').innerHTML=p.tags.map(tagRow).join('')||tagRow();$('editError').textContent='';$('tagEditor').showModal();return;}
    if(action==='approve')await send('/api/studio/photos/'+id,'PATCH',{approved:!p.approved});
    if(action==='delete'){if(!confirm('¿Eliminar esta foto, su versión unificada y sus etiquetas del servidor?'))return;await api('/api/photos/'+id,{method:'DELETE'});clearCache();}
    if(action.startsWith('retry-')){const scope=action.slice(6);if(scope==='index'&&(!confirm('Reintentar enviará la foto a OpenAI y puede consumir saldo.')||!$('aiConsent').checked))return;await send('/api/studio/photos/'+id,'PATCH',{retry:scope});}
    await refresh(true);note();
  }catch(error){note(error.message);}
});
$('backup').onclick=async()=>{try{$('backup').disabled=true;const blob=await(await api('/api/backup')).blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='my-closet-album-'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){note(e.message);}finally{$('backup').disabled=false;}};
if(!token)$('connection').open=true;
refresh();setInterval(()=>{if(!uploading&&!document.hidden)refresh();},3000);
window.addEventListener('pagehide',clearCache);

let cropPhoto=null,cropSource=null,cropRotated=null,cropRotation=0,cropDrag=null,cropBox=null;
function rebuildRotated(){
  const canvas=document.createElement('canvas');const swapped=cropRotation%180!==0;
  canvas.width=swapped?cropSource.naturalHeight:cropSource.naturalWidth;
  canvas.height=swapped?cropSource.naturalWidth:cropSource.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(cropRotation*Math.PI/180);ctx.drawImage(cropSource,-cropSource.naturalWidth/2,-cropSource.naturalHeight/2);cropRotated=canvas;
}
function cropGeometry(){
  const W=cropRotated.width,H=cropRotated.height;
  const ratio=$('cropRatio').value==='original'?W/H:Number($('cropRatio').value);
  const bw=W/H>ratio?H*ratio:W,bh=bw/ratio,zoom=Number($('cropZoom').value);
  const w=bw/zoom,h=bh/zoom,x=(W-w)*Number($('cropX').value)/100,y=(H-h)*Number($('cropY').value)/100;
  return {W,H,ratio,x,y,w,h};
}
function paintCrop(){
  if(!cropRotated)return;const box=cropGeometry();cropBox=box;
  const canvas=$('cropCanvas');canvas.width=800;canvas.height=Math.round(800/box.ratio);canvas.style.maxWidth=(50*box.ratio)+'vh';
  const ctx=canvas.getContext('2d');ctx.drawImage(cropRotated,box.x,box.y,box.w,box.h,0,0,canvas.width,canvas.height);
  $('cropZoomValue').textContent=Number($('cropZoom').value).toFixed(2)+'×';
}
async function openCrop(photo){
  cropPhoto=photo;cropRotation=photo.image_edit?.rotation||0;cropDrag=null;cropBox=null;$('cropError').textContent='';$('saveCrop').disabled=true;
  cropSource=new Image();cropSource.src=await loadImage(photo.id+'.jpg');await cropSource.decode();rebuildRotated();
  const saved=photo.image_edit?.crop;
  $('cropRatio').querySelector('[data-saved]')?.remove();
  $('cropRatio').value='0.8';$('cropZoom').value=1;$('cropX').value=$('cropY').value=50;
  if(saved){
    const [x,y,w,h]=saved;const ratio=w*cropRotated.width/(h*cropRotated.height);
    let option=[...$('cropRatio').options].find(o=>o.value!=='original'&&Math.abs(Number(o.value)-ratio)<.001);
    if(!option){option=new Option('Encuadre guardado',String(ratio));option.dataset.saved='1';$('cropRatio').add(option);}
    $('cropRatio').value=option.value;
    const W=cropRotated.width,H=cropRotated.height,bw=W/H>ratio?H*ratio:W;
    $('cropZoom').value=Math.max(1,Math.min(5,bw/(w*W)));
    $('cropX').value=W-w*W>.01?x*W/(W-w*W)*100:50;
    $('cropY').value=H-h*H>.01?y*H/(H-h*H)*100:50;
  }
  $('cropEditor').showModal();paintCrop();$('saveCrop').disabled=false;
}
$('closeCrop').onclick=()=>$('cropEditor').close();
for(const id of ['cropZoom','cropX','cropY','cropRatio'])$(id).addEventListener('input',()=>{cropDrag=null;paintCrop();});
$('cropRotate').onclick=()=>{cropRotation=(cropRotation+90)%360;rebuildRotated();$('cropZoom').value=1;$('cropX').value=$('cropY').value=50;paintCrop();};
$('cropReset').onclick=()=>{$('cropZoom').value=1;$('cropX').value=$('cropY').value=50;paintCrop();};
$('cropCanvas').addEventListener('pointerdown',event=>{if(!cropBox)return;cropDrag={pointer:event.pointerId,px:event.clientX,py:event.clientY,box:{...cropBox}};event.currentTarget.setPointerCapture(event.pointerId);});
$('cropCanvas').addEventListener('pointermove',event=>{
  if(!cropDrag||event.pointerId!==cropDrag.pointer)return;const rect=event.currentTarget.getBoundingClientRect(),b=cropDrag.box;
  const x=Math.max(0,Math.min(b.W-b.w,b.x-(event.clientX-cropDrag.px)*b.w/rect.width));
  const y=Math.max(0,Math.min(b.H-b.h,b.y-(event.clientY-cropDrag.py)*b.h/rect.height));
  $('cropX').value=b.W-b.w>.01?x/(b.W-b.w)*100:50;$('cropY').value=b.H-b.h>.01?y/(b.H-b.h)*100:50;paintCrop();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('cropCanvas').addEventListener(name,()=>{cropDrag=null;});
$('cropForm').onsubmit=async event=>{
  event.preventDefault();if(!cropPhoto||!cropBox)return;$('saveCrop').disabled=true;
  const b=cropGeometry();const edit={rotation:cropRotation,crop:[b.x/b.W,b.y/b.H,b.w/b.W,b.h/b.H]};
  try{await send('/api/studio/photos/'+cropPhoto.id,'PATCH',{image_edit:edit});clearCache();$('cropEditor').close();await refresh(true);note('Encuadre guardado. Puedes restaurar el original desde Reencuadrar.');}
  catch(error){$('cropError').textContent=error.message;}finally{$('saveCrop').disabled=false;}
};
$('restoreOriginal').onclick=async()=>{
  if(!cropPhoto)return;$('restoreOriginal').disabled=true;
  try{await send('/api/studio/photos/'+cropPhoto.id,'PATCH',{image_edit:null});clearCache();$('cropEditor').close();await refresh(true);note('Foto original restaurada.');}
  catch(error){$('cropError').textContent=error.message;}finally{$('restoreOriginal').disabled=false;}
};
