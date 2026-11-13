import {extraPhotos, garmentPhotoURL, productPhoto} from './garment-photos.mjs?v=purchases1';
import {initPurchaseBatch} from './purchase-batch.mjs?v=purchases2';
import {createGarmentBatch} from './garment-batch.mjs?v=20261113';
import {createAlbum} from './look-album.mjs?v=20261113d';
import {captureDate} from './photo-dates.mjs?v=20261112';
import {categories, categoryFor, fillCategorySelect} from './closet-catalog.mjs?v=20261112e';
import {initPasswordAccess} from './password-access.mjs';
import {initStylist} from './stylist.mjs?v=purchases1';

import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://tqphpcoqnlhzlxvzilxy.supabase.co','sb_publishable_xX9_VMIhz3C_JLTmhtWoPw_4KpWD73b',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);let busy=false, stop=false, retryFiles=[], garments=[], stateRunning=false;
const album = createAlbum({client: supabase, readAll, removeImage: removeUnusedImage, describeLook, report: message => { $('globalStatus').textContent = message; }});
const stylist=initStylist({client:supabase,getCatalog:()=>garments,getLookReferences:album.getReferences,onSaved:load});
function msg(s){$('status').textContent=s;$('globalStatus').textContent=s}
async function state(){if(stateRunning||busy)return;stateRunning=true;try{const {data:{user},error}=await supabase.auth.getUser();if(error)console.warn(error.message);$('login').classList.toggle('hidden',!!user);$('private').classList.toggle('hidden',!user);if(user){$('who').textContent=user.email||user.id;await Promise.all([load(),loadGarments()])}else{garments=[];garmentBatch.reset();purchaseBatch.reset();album.reset();stylist.reset();$('garmentGallery').replaceChildren()}}catch(e){$('globalStatus').textContent='No se pudo conectar: '+e.message}finally{stateRunning=false}}
const passwordAccess=initPasswordAccess({client:supabase,onSignedIn:state,redirectTo:()=>location.origin+location.pathname});
$('logout').onclick=async()=>{if(garmentBatch.isWorking()||purchaseBatch.isSaving()){aiMsg('Espera a que termine el lote de prendas.');return}try{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;passwordAccess.clear();$('passwordStatus').textContent='';await state()}catch(error){$('globalStatus').textContent='No se pudo cerrar la sesión: '+error.message}};
$('refresh').onclick = load;
function load() {
  return album.load().catch(error => msg('No se pudieron cargar los looks: ' + error.message));
}

async function compressed(file) {
  let image;
  let cleanup = () => {};
  try {
    image = await createImageBitmap(file);
    cleanup = () => image.close();
  } catch {
    const url = URL.createObjectURL(file);
    cleanup = () => URL.revokeObjectURL(url);
    image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { cleanup(); throw Error('El navegador no puede abrir esta foto. Prueba con una copia en JPG.'); }
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('No se pudo preparar la foto')), 'image/jpeg', .86));
  } finally { cleanup(); }
}
async function uploadFiles(files){
 if(busy)return;if(!files.length)return msg('Selecciona fotografías.');
 busy=true;stop=false;retryFiles=[];$('progress').value=0;$('upload').disabled=true;$('logout').disabled=true;$('files').disabled=true;$('stop').disabled=false;$('retry').hidden=true;
 let done=0,skipped=0;const failures=[];
 try {
 const {data:{user}, error} = await supabase.auth.getUser();
 if (error || !user) {
   retryFiles = [...files];
   throw error || Error('Inicia sesión primero.');
 }
 for(let i=0;i<files.length;i++){
 if(stop){retryFiles.push(...files.slice(i));break}
 try{const file=files[i];const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const path=user.id+'/outfits/'+hash+'.jpg';
 const existing=await supabase.from('outfits').select('id,captured_on,frame').eq('image_path',path).limit(1);if(existing.error)throw existing.error;
 const capturedOn = await captureDate(file);
 if (existing.data.length) {
   const row = existing.data[0];
   if (capturedOn && !row.captured_on && !row.frame) {
     const update = await supabase.from('outfits').update({captured_on: capturedOn}).eq('id', row.id).eq('user_id',user.id);
     if (update.error) throw update.error;
   }
   skipped++;
 } else {
 const blob=await compressed(file);const up=await supabase.storage.from('closet-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});
 if (up.error && String(up.error.statusCode) !== '409' && !/already exists|duplicate/i.test(up.error.message)) throw up.error;
 const ins=await supabase.from('outfits').insert({user_id:user.id,image_path:path,captured_on:capturedOn});if(ins.error){if(!up.error)await supabase.storage.from('closet-images').remove([path]);throw ins.error}done++}
 }catch(e){retryFiles.push(files[i]);failures.push(files[i].name+': '+e.message)}
 $('progress').value=Math.round((i+1)/files.length*100);msg((i+1)+' / '+files.length+' revisadas · '+done+' subidas · '+skipped+' ya guardadas · '+failures.length+' errores');
 }}catch(error){failures.push(error.message)}finally{busy=false;$('upload').disabled=false;$('logout').disabled=false;$('files').disabled=false;$('stop').disabled=true;$('retry').hidden=!retryFiles.length;
 msg(done+' subidas · '+skipped+' ya guardadas · '+retryFiles.length+' pendientes.'+(failures.length?' '+failures.join(' | '):''));await load()}}
 $('upload').onclick=()=>uploadFiles([...$('files').files]);$('stop').onclick=()=>{stop=true;$('stop').disabled=true};$('retry').onclick=()=>uploadFiles([...retryFiles]);
 window.addEventListener('beforeunload',e=>{if(busy||garmentBatch.isWorking()){e.preventDefault();e.returnValue=''}});
 let previewURLs=[];
 $('files').onchange=()=>{previewURLs.forEach(URL.revokeObjectURL);previewURLs=[];const files=[...$('files').files];$('selection').replaceChildren();$('upload').disabled=false;msg(files.length+' fotografías seleccionadas. Mantén la app abierta durante la carga.');for(const file of files.slice(0,12)){const img=document.createElement('img');img.src=URL.createObjectURL(file);previewURLs.push(img.src);img.alt=file.name;$('selection').append(img)}};
 
const aiMsg = message => { $('aiStatus').textContent = message; $('globalStatus').textContent = message; };
async function describeLook(outfitId) {
  const {data:{session}, error} = await supabase.auth.getSession();
  if (error || !session) throw Error('Inicia sesión para analizar tu look.');
  const response = await fetch('https://tqphpcoqnlhzlxvzilxy.supabase.co/functions/v1/analyze-look', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'apikey': 'sb_publishable_xX9_VMIhz3C_JLTmhtWoPw_4KpWD73b',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({outfitId})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.description !== 'string' || !result.description.trim()) {
    const message = response.status === 401 ? 'Vuelve a iniciar sesión para analizar tu look.' : result.error;
    throw Object.assign(Error(message || 'No se pudo generar la descripción. Inténtalo de nuevo.'), {status: response.status});
  }
  return result.description;
}
async function analyzeGarmentPhoto(blob, stillActive) {
  const {data:{session},error} = await supabase.auth.getSession();
  if (error || !session) throw error || Error('Inicia sesión primero.');
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (!stillActive()) throw Error('La selección ya no está activa.');
  const response = await fetch('https://tqphpcoqnlhzlxvzilxy.supabase.co/functions/v1/analyze-garment', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + session.access_token, 'apikey': 'sb_publishable_xX9_VMIhz3C_JLTmhtWoPw_4KpWD73b', 'Content-Type': 'application/json'},
    body: JSON.stringify({image})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Error HTTP ' + response.status);
  return result;
}
const garmentBatch = createGarmentBatch({client: supabase, compress: compressed, analyzePhoto: analyzeGarmentPhoto, onSaved: loadGarments});
const purchaseBatch = initPurchaseBatch({client:supabase, getCatalog:() => garments, refresh:loadGarments});
$('refreshGarments').onclick=loadGarments;
async function loadGarments(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data,error}=await readAll('garments','id,name,category,color,colors,pattern,style,description,image_path,extra_image_paths');
  if(error){aiMsg('Error al cargar prendas: '+error.message);return}
  garments=data.map(item => ({...item, category: categories.includes(item.category) ? item.category : categoryFor(item) || item.category}));$('garmentCount').textContent=data.length;fillCategories();renderGarments();stylist.catalogChanged();}
let renderVersion=0;
function renderGarments(){const version=++renderVersion;const data=filteredGarments();const gallery=$('garmentGallery');gallery.replaceChildren();$('count').textContent=data.length+' prenda(s)';renderGarmentCards(data,gallery,version).catch(e=>aiMsg('No se pudieron mostrar las prendas: '+e.message));}
async function renderGarmentCards(data,gallery,version){
  for(const g of data){const photo=await garmentPhotoURL(supabase.storage.from('closet-images'),g.image_path).catch(()=>null);if(version!==renderVersion)return;
    const div=document.createElement('div');div.className='tile';const img=document.createElement('img');if(photo)img.src=photo;else img.hidden=true;img.loading='lazy';img.alt=g.name||'Prenda';
    const label=document.createElement('p');label.textContent=[g.name,g.category,(g.colors?.length?g.colors.join(', '):g.color),g.pattern,g.style,g.description].filter(Boolean).join(' · ');const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ver ficha completa';const info=document.createElement('p');info.textContent=[g.pattern&&'Estampado: '+g.pattern,g.style&&'Estilo: '+g.style,g.description&&'Descripción: '+g.description].filter(Boolean).join(' · ')||'Sin descripción adicional';detail.append(summary,info);const del=document.createElement('button');del.textContent='Eliminar prenda';del.style.background='#9b3030';del.onclick=async()=>{if(!confirm('¿Eliminar esta prenda y su fotografía? Esta acción no se puede deshacer.'))return;del.disabled=true;const {error:dbError,data:deleted}=await supabase.from('garments').delete().eq('id',g.id).select('id');if(dbError||!deleted?.length){aiMsg('No se pudo eliminar: '+(dbError?.message||'Comprueba permisos'));del.disabled=false;return}const results=await Promise.all([g.image_path,...(g.extra_image_paths||[])].map(removeUnusedImage));const storageError=results.find(result=>result.error)?.error;aiMsg(storageError?'Prenda eliminada, pero no se pudo borrar su archivo: '+storageError.message:'Prenda eliminada.');await loadGarments()};const edit=document.createElement('button');edit.textContent='Editar ficha';edit.onclick=()=>{if(div.querySelector('form'))return;const form=document.createElement('form');const fields=[['name','Nombre'],['category','Categoría'],['color','Colores'],['pattern','Estampado'],['style','Estilo'],['description','Descripción']];const inputs={};for(const [key,title] of fields){const wrapper=document.createElement('label');wrapper.textContent=title+' ';const input=document.createElement(key==='description'?'textarea':key==='category'?'select':'input');if(key==='category')fillCategorySelect(input,g.category);input.value=key==='color'?(g.colors?.length?g.colors.join(', '):g.color||''):(g[key]||'');wrapper.append(input);form.append(wrapper,document.createElement('br'));inputs[key]=input}const save=document.createElement('button');save.type='submit';save.textContent='Guardar cambios';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>form.remove();form.append(save,cancel);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const color=inputs.color.value.trim();const changes={name:inputs.name.value.trim(),category:inputs.category.value.trim(),color,colors:color.split(',').map(x=>x.trim()).filter(Boolean),pattern:inputs.pattern.value.trim(),style:inputs.style.value.trim(),description:inputs.description.value.trim()};const result=await supabase.from('garments').update(changes).eq('id',g.id).select('id');if(result.error||!result.data?.length){aiMsg('No se pudieron guardar los cambios: '+(result.error?.message||'Comprueba permisos'));save.disabled=false;return}aiMsg('Ficha actualizada.');await loadGarments()};div.append(form)};div.append(img,label,detail,extraPhotos({garment:g,client:supabase,compress:compressed,refresh:loadGarments,report:aiMsg}));
    if ([...$('anchorItem').options].some(option => option.value === g.id)) {
      const combine = document.createElement('button');
      combine.type = 'button';
      combine.textContent = 'Combinar esta prenda';
      combine.onclick = () => stylist.startWith(g);
      div.append(combine);
    }
    div.append(edit,del);gallery.append(div)}
  if(!data.length)gallery.textContent=garments.length?'No hay prendas con estos filtros.':'Tu armario empieza con una foto. Añade tu primera prenda.';
}

supabase.auth.onAuthStateChange(()=>{setTimeout(state,0)});state();

async function readAll(table,fields){const data=[];for(let offset=0;;){const page=await supabase.from(table).select(fields).order('created_at',{ascending:false}).order('id').range(offset,offset+199);if(page.error)return {data:null,error:page.error};data.push(...page.data);if(!page.data.length)break;offset+=page.data.length;}return {data,error:null}}
function fillCategories(){const select=$('categoryFilter'),value=select.value;select.replaceChildren(new Option('Todas',''));for(const category of new Set([...categories,...garments.map(g=>g.category).filter(Boolean)]))select.add(new Option(category,category));select.value=value}
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function filteredGarments(){const search=normalized($('search').value),category=$('categoryFilter').value;const counts=new Map();for(const g of garments){const key=normalized(g.name)+'|'+normalized(g.category)+'|'+normalized(g.color);counts.set(key,(counts.get(key)||0)+1)}return garments.filter(g=>(!category||g.category===category)&&normalized([g.name,g.category,g.color,g.description,g.style].join(' ')).includes(search)&&(!$('duplicateFilter').value||counts.get(normalized(g.name)+'|'+normalized(g.category)+'|'+normalized(g.color))>1))}
for(const id of ['search','categoryFilter','duplicateFilter'])$(id).addEventListener('input',renderGarments);
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{if($('private').classList.contains('hidden')){$('login').scrollIntoView({behavior:'smooth'});return}document.querySelectorAll('.panel').forEach(panel=>panel.hidden=panel.id!==button.dataset.go);document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.go===button.dataset.go)));$(button.dataset.go).scrollIntoView({behavior:'smooth',block:'start'})});
for (const [button, details, field] of [
  ['openLookUpload', 'lookUpload', 'files'],
  ['openGarmentUpload', 'garmentUpload', 'garmentFile']
]) {
  $(button).onclick = () => { $(details).open = true; $(field).focus(); };
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

async function removeUnusedImage(path){if(productPhoto(path))return {error:null};for(const table of ['garments','outfits']){const result=await supabase.from(table).select('id').eq('image_path',path).limit(1);if(result.error)return {error:result.error};if(result.data.length)return {error:null}}return await supabase.storage.from('closet-images').remove([path])}
