'use strict';
const $ = id => document.getElementById(id);
const categories = ['parte superior','pantalón','falda','vestido','abrigo','calzado','accesorio'];
const escapeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let base = sessionStorage.getItem('closet-server') || location.origin;
let token = sessionStorage.getItem('closet-token') || '';
const params = new URLSearchParams(location.hash.slice(1));
if (params.has('token')) {
  token = params.get('token');
  history.replaceState(null, '', location.pathname + location.search);
  sessionStorage.setItem('closet-token', token);
}
$('server').value = base;
$('token').value = token;
let snapshot = null, view = 'photos', uploading = false, refreshing = false, manualPhoto = null, point = null, crop = null;
const imageCache = new Map();
const busyActions = new Set();
function notice(message = '') { $('notice').textContent = message; }
async function api(path, options = {}) {
  const response = await fetch(base + path, {...options, cache:'no-store', headers:{Authorization:'Bearer '+token,...options.headers}});
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo completar la operación ('+response.status+').');
  }
  return response;
}
async function json(path, method, body) {
  const response = await api(path, {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return response.json();
}
async function imageURL(name) {
  if (!imageCache.has(name)) {
    const pending = api('/api/images/'+name).then(r=>r.blob()).then(b=>URL.createObjectURL(b));
    imageCache.set(name, pending);
    pending.catch(()=>imageCache.delete(name));
  }
  return imageCache.get(name);
}
async function loadImages() {
  const nodes = Array.from(document.querySelectorAll('img[data-image]'));
  // Keep only four image fetches active, even for a 200-photo gallery.
  await Promise.all(Array.from({length:4}, async()=>{
    while(nodes.length){
      const img = nodes.shift();
      try { const url = await imageURL(img.dataset.image); if(img.isConnected) img.src=url; }
      catch { if(img.isConnected) img.alt='No se pudo cargar la imagen'; }
    }
  }));
}
function clearImages() { for (const p of imageCache.values()) p.then(URL.revokeObjectURL).catch(()=>{}); imageCache.clear(); }
function options(value) { return categories.map(c=>`<option ${value===c?'selected':''}>${escapeText(c)}</option>`).join(''); }
function image(name, alt) { return `<img class="picture" loading="lazy" data-image="${escapeText(name)}" alt="${escapeText(alt)}">`; }
function action(type,id,label,secondary=false) {return `<button data-action="${type}" data-id="${id}" class="${secondary?'secondary':''}">${label}</button>`;}
const stateNames = {queued:'En cola',processing:'Analizando',review:'Lista para revisar',error:'Requiere atención'};
function photoCard(p) {
  return `<article class="card">${image(p.id+'.jpg',p.name)}<div class="body"><span class="badge">${stateNames[p.state]||escapeText(p.state)}</span><h3>${escapeText(p.name)}</h3><p class="hint">${escapeText(p.error)}</p><div class="actions">${p.state==='processing'?'':action('manual',p.id,'Recortar manualmente',true)}${p.state==='error'?action('retry',p.id,'Reintentar IA'):''}${p.state!=='processing'?action('delete',p.id,'Eliminar foto',true):''}</div></div></article>`;
}
function garmentCard(g, review) {
  const target = snapshot.garments.find(x=>x.id===g.duplicate_of);
  return `<article class="card" data-garment="${g.id}">${image(g.id+(g.cutout?'-cutout.png':'-crop.png'),g.name)}<div class="body"><span class="badge">${g.cutout?'Fondo eliminado · revisar':'Recorte rectangular · sin aislar'}</span>${review?`<label>Nombre<input data-field="name" maxlength="150" value="${escapeText(g.name)}"></label><label>Categoría<select data-field="category">${options(g.category)}</select></label><label>Color<input data-field="color" maxlength="60" value="${escapeText(g.color)}"></label>`:`<h3>${escapeText(g.name)}</h3><p>${escapeText(g.category)} · ${escapeText(g.color)}</p>`}<p class="hint">${g.confidence?'Confianza de IA: '+Math.round(g.confidence*100)+'% (orientativa)':'Recorte manual'}</p>${review&&target?`<p class="hint">Posible duplicado: ${escapeText(target.name)}. Compara las imágenes antes de unir.</p>${image(target.id+(target.cutout?'-cutout.png':'-crop.png'),'Posible duplicado: '+target.name)}`:''}<div class="actions">${review?action('approve',g.id,'Aprobar')+action('reject',g.id,'Descartar',true):action('unapprove',g.id,'Volver a revisión',true)}${review&&target&&target.state==='approved'?action('duplicate',g.id,'Es la misma prenda',true):''}${action('original',g.photo_id,'Ver original / recortar',true)}${g.cutout?action('toggle',g.id,'Comparar recorte',true):''}</div></div></article>`;
}
let previousRender = '';
function render(force=false) {
  if (!snapshot) return;
  const pending = snapshot.photos.filter(p=>p.state==='queued').length;
  const processing = snapshot.photos.filter(p=>p.state==='processing').length;
  const complete = snapshot.photos.length - pending - processing;
  const errors = snapshot.photos.filter(p=>p.state==='error').length;
  const review = snapshot.garments.filter(g=>g.state==='review');
  const catalog = snapshot.garments.filter(g=>g.state==='approved');
  $('progress').max = snapshot.photos.length || 1;
  $('progress').value = complete;
  $('progressText').textContent = `${complete} de ${snapshot.photos.length} fotos procesadas · ${pending} en cola · ${processing} en análisis · ${errors} con error. ${snapshot.paused?'Cola pausada.':'Cola en marcha.'}`;
  $('usage').textContent = `Solicitudes de IA hoy (UTC): ${snapshot.dailyCalls}/${snapshot.dailyLimit}. Modelo: ${snapshot.model}. ${snapshot.configured?'El importe depende del uso y las tarifas de OpenAI.':'Sin clave configurada: puedes recortar manualmente.'} ${snapshot.dailyCalls>=snapshot.dailyLimit?'Límite diario alcanzado.':''}`;
  $('run').textContent = snapshot.paused?'Iniciar / continuar análisis':'Pausar tras la foto actual';
  $('run').disabled = !snapshot.configured || (snapshot.paused && (!pending || snapshot.dailyCalls>=snapshot.dailyLimit));
  $('photoCount').textContent = snapshot.photos.length;
  $('reviewCount').textContent = review.length;
  $('catalogCount').textContent = catalog.length;
  for(const name of ['photos','review','catalog']) $(name+'View').hidden = view!==name;
  // Polling must not replace a card while the user edits its classification.
  const signature = JSON.stringify([view,snapshot.photos,snapshot.garments,$('catalogFilter').value]);
  if (!force && (signature===previousRender || document.activeElement?.closest('[data-garment]'))) return;
  previousRender = signature;
  const empty = '<p class="empty">Aquí aparecerán tus fotos. Empieza seleccionando un lote.</p>';
  $('photosGrid').innerHTML = view==='photos'?(snapshot.photos.map(photoCard).join('')||empty):'';
  $('reviewGrid').innerHTML = view==='review'?(review.map(g=>garmentCard(g,true)).join('')||'<p class="empty">No hay prendas pendientes de revisión.</p>'):'';
  $('catalogGrid').innerHTML = view==='catalog'?(catalog.filter(g=>!$('catalogFilter').value||g.category===$('catalogFilter').value).map(g=>garmentCard(g,false)).join('')||'<p class="empty">Aprueba prendas para construir tu catálogo.</p>'):'';
  loadImages();
}
async function refresh(force=false) {
  if (refreshing || !token) return;
  refreshing = true;
  try {
    snapshot = await (await api('/api/status')).json();
    $('connectionState').textContent = '· conectado';
    $('files').disabled = uploading || !$('consent').checked;
    $('backup').disabled = false;
    render(force);
  } catch(error) {
    $('connectionState').textContent='· sin conexión';
    $('files').disabled = $('run').disabled = $('backup').disabled = true;
    notice(error.message==='Failed to fetch'?'No se puede conectar. Comprueba que el servidor privado está abierto y su dirección es correcta.':error.message);
  } finally { refreshing=false; }
}
$('connectForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    const url = new URL($('server').value);
    if (url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('Usa HTTPS para servidores remotos.');
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash) throw new Error('Introduce solo el origen del servidor, sin ruta ni credenciales.');
    base = url.origin;
    token = $('token').value.trim();
    sessionStorage.setItem('closet-server',base);
    sessionStorage.setItem('closet-token',token);
    clearImages(); previousRender=''; notice();
    await refresh(true);
    if(snapshot) $('connection').open=false;
  } catch(error) { notice(error.message); }
});
$('consent').addEventListener('change',()=>{$('files').disabled=!$('consent').checked||uploading||!snapshot;});
$('files').addEventListener('change',async()=>{
  const files = [...$('files').files];
  if(!files.length) return;
  if(files.length>200){notice('Selecciona un máximo de 200 fotos por lote.');$('files').value='';return;}
  if(!snapshot?.paused){notice('Pausa la cola antes de subir otro lote.');$('files').value='';return;}
  uploading=true; $('files').disabled=true; $('run').disabled=true;
  $('uploadErrors').replaceChildren(); notice();
  let uploaded=0, duplicates=0, failed=0;
  for(let i=0;i<files.length;i++){
    const file=files[i];
    $('uploadStatus').textContent=`Subiendo ${i+1}/${files.length}: ${file.name}`;
    try{
      if(file.size>15*1024*1024) throw new Error('Supera 15 MB.');
      if(!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(file.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) throw new Error('Formato no admitido. Usa HEIC, HEIF, JPEG, PNG o WebP.');
      const result=await (await api('/api/photos?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':file.type},body:file})).json();
      if(result.duplicate) duplicates++; else uploaded++;
    }catch(error){failed++;const li=document.createElement('li');li.textContent=file.name+': '+error.message;$('uploadErrors').append(li);}
  }
  uploading=false; $('files').value='';
  $('uploadStatus').textContent=`${uploaded} fotos guardadas · ${duplicates} repetidas omitidas · ${failed} con error. Ya puedes iniciar el análisis.`;
  await refresh(true);
});
$('run').addEventListener('click',async()=>{
  try {
    if(!snapshot.paused || $('consent').checked){await json('/api/pause','POST',{paused:!snapshot.paused});notice();await refresh();}
    else notice('Marca la autorización de envío a OpenAI antes de iniciar el análisis.');
  }catch(error){notice(error.message);}
});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  view=button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  render(true);
}));
$('catalogFilter').insertAdjacentHTML('beforeend',options(''));
$('manualCategory').innerHTML=options('parte superior');
$('catalogFilter').addEventListener('change',()=>render(true));
async function openManual(id){
  manualPhoto=id; point=crop=null; $('cropBox').hidden=true; $('saveCrop').disabled=true;
  $('cropHint').textContent='Marca la primera esquina.';
  $('original').src=await imageURL(id+'.jpg');
  $('editor').showModal();
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button) return;
  const {action:type,id}=button.dataset;
  if(busyActions.has(id)) return;
  busyActions.add(id); button.disabled=true;
  try{
    if(type==='manual'||type==='original') return await openManual(id);
    if(type==='toggle'){
      const img=button.closest('.card').querySelector('img');
      const crop=img.dataset.image.endsWith('-cutout.png');
      img.dataset.image=id+(crop?'-crop.png':'-cutout.png');img.src=await imageURL(img.dataset.image);
      button.textContent=crop?'Ver fondo eliminado':'Comparar recorte';return;
    }
    if(type==='delete'){
      if(!confirm('¿Eliminar esta foto y todas sus prendas del servidor? La copia descargada no se modifica.')) return;
      await api('/api/photos/'+id,{method:'DELETE'});clearImages();
    }else if(type==='retry'){
      if(!confirm('Reintentar hará otra solicitud de IA de pago. ¿Continuar?')) return;
      await json('/api/photos/'+id+'/retry','POST',{});
    }else{
      const card=button.closest('[data-garment]');
      const body={};card.querySelectorAll('[data-field]').forEach(input=>body[input.dataset.field]=input.value);
      body.state={approve:'approved',reject:'rejected',duplicate:'duplicate',unapprove:'review'}[type];
      await json('/api/garments/'+id,'PATCH',body);
    }
    notice(); await refresh(true);
  }catch(error){notice(error.message);}
  finally{busyActions.delete(id);if(button.isConnected)button.disabled=false;}
});
$('closeEditor').addEventListener('click',()=>$('editor').close());
$('cropStage').addEventListener('click',event=>{
  const rect=$('original').getBoundingClientRect();
  const p=[Math.max(0,Math.min(1000,Math.round((event.clientX-rect.left)/rect.width*1000))),Math.max(0,Math.min(1000,Math.round((event.clientY-rect.top)/rect.height*1000)))];
  if(!point){point=p;crop=null;$('saveCrop').disabled=true;$('cropBox').hidden=true;$('cropHint').textContent='Ahora marca la esquina opuesta.';return;}
  crop=[Math.min(point[0],p[0]),Math.min(point[1],p[1]),Math.max(point[0],p[0]),Math.max(point[1],p[1])];point=null;
  const box=$('cropBox');box.hidden=false;box.style.left=crop[0]/10+'%';box.style.top=crop[1]/10+'%';box.style.width=(crop[2]-crop[0])/10+'%';box.style.height=(crop[3]-crop[1])/10+'%';
  $('saveCrop').disabled=crop[2]-crop[0]<15||crop[3]-crop[1]<15;
  $('cropHint').textContent='Recorte marcado. Pulsa de nuevo para empezar otro.';
});
$('manualForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!crop)return;
  $('saveCrop').disabled=true;
  try{
    await json('/api/photos/'+manualPhoto+'/manual','POST',{bbox:crop,name:$('manualName').value,category:$('manualCategory').value,color:$('manualColor').value});
    $('editor').close();view='review';document.querySelector('[data-view=review]').click();notice();await refresh(true);
  }catch(error){$('cropHint').textContent=error.message;}
  finally{$('saveCrop').disabled=false;}
});
$('backup').addEventListener('click',async()=>{
  $('backup').disabled=true;
  try{const blob=await (await api('/api/backup')).blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='my-closet-'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  catch(error){notice(error.message);}finally{$('backup').disabled=false;}
});
if(!token) $('connection').open=true;
refresh();setInterval(()=>{if(!uploading&&!document.hidden)refresh();},2500);
window.addEventListener('pagehide',clearImages);
