
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://tqphpcoqnlhzlxvzilxy.supabase.co','sb_publishable_xX9_VMIhz3C_JLTmhtWoPw_4KpWD73b',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);let busy=false, stop=false, retryFiles=[], garments=[], outfits=[], stateRunning=false;
function msg(s){$('status').textContent=s;$('globalStatus').textContent=s}
async function state(){if(stateRunning||busy)return;stateRunning=true;try{const {data:{user},error}=await supabase.auth.getUser();if(error)console.warn(error.message);$('login').classList.toggle('hidden',!!user);$('private').classList.toggle('hidden',!user);if(user){$('who').textContent=user.email||user.id;await Promise.all([load(),loadGarments()])}else{garments=[];outfits=[];$('gallery').replaceChildren();$('garmentGallery').replaceChildren()}}catch(e){$('globalStatus').textContent='No se pudo conectar: '+e.message}finally{stateRunning=false}}
$('send').onclick=async()=>{let email=$('email').value.trim();if(!email)return;$('send').disabled=true;let {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});$('authMsg').textContent=error?error.message:'Comprueba tu correo y abre el enlace de acceso.';$('send').disabled=false};
$('logout').onclick=async()=>{await supabase.auth.signOut();await state()};
$('refresh').onclick=load;
async function load(){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await readAll('outfits','id,image_path,created_at');if(error){msg('No se pudieron leer los outfits: '+error.message);return}outfits=data;$('outfitCount').textContent=data.length;let gallery=$('gallery');gallery.replaceChildren();for(const row of data){let {data:link,error:e}=await supabase.storage.from('closet-images').createSignedUrl(row.image_path,3600);if(e)continue;let div=document.createElement('div');div.className='tile';let img=document.createElement('img');img.src=link.signedUrl;img.loading='lazy';img.alt='Outfit guardado';let date=document.createElement('small');date.textContent=new Date(row.created_at).toLocaleDateString('es-ES');const del=document.createElement('button');del.textContent='Eliminar outfit';del.onclick=async()=>{if(!confirm('¿Eliminar este outfit?'))return;del.disabled=true;const result=await supabase.from('outfits').delete().eq('id',row.id).select('id');if(result.error||!result.data?.length){msg('No se pudo eliminar el outfit: '+(result.error?.message||'Comprueba permisos'));del.disabled=false;return}await removeUnusedImage(row.image_path);msg('Outfit eliminado.');await load()};div.append(img,date,del);gallery.append(div)}if(!data.length)gallery.textContent='Aún no hay outfits en tu armario en la nube.'}
async function compressed(file){const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo comprimir')),'image/jpeg',.8))}
async function uploadFiles(files){
 if(busy)return;if(!files.length)return msg('Selecciona fotografías.');if(files.length>200)return msg('Máximo 200 por lote.');
 const {data:{user}}=await supabase.auth.getUser();if(!user)return msg('Inicia sesión primero.');
 busy=true;stop=false;retryFiles=[];$('upload').disabled=true;$('logout').disabled=true;$('files').disabled=true;$('stop').disabled=false;$('retry').hidden=true;
 let done=0,skipped=0;const failures=[];
 try{for(let i=0;i<files.length;i++){
 if(stop){retryFiles.push(...files.slice(i));break}
 try{const file=files[i];const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const path=user.id+'/outfits/'+hash+'.jpg';
 const existing=await supabase.from('outfits').select('id').eq('image_path',path).limit(1);if(existing.error)throw existing.error;
 if(existing.data.length){skipped++}else{
 const blob=await compressed(file);const up=await supabase.storage.from('closet-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});
 if(up.error&&String(up.error.statusCode)!=='409')throw up.error;
 const ins=await supabase.from('outfits').insert({user_id:user.id,image_path:path});if(ins.error){if(!up.error)await supabase.storage.from('closet-images').remove([path]);throw ins.error}done++}
 }catch(e){retryFiles.push(files[i]);failures.push(files[i].name+': '+e.message)}
 $('progress').value=Math.round((i+1)/files.length*100);msg((i+1)+' / '+files.length+' revisadas · '+done+' subidas · '+skipped+' ya guardadas · '+failures.length+' errores');
 }}finally{busy=false;$('upload').disabled=false;$('logout').disabled=false;$('files').disabled=false;$('stop').disabled=true;$('retry').hidden=!retryFiles.length;
 msg(done+' subidas · '+skipped+' ya guardadas · '+retryFiles.length+' pendientes.'+(failures.length?' '+failures.join(' | '):''));await load()}}
 $('upload').onclick=()=>uploadFiles([...$('files').files]);$('stop').onclick=()=>{stop=true;$('stop').disabled=true};$('retry').onclick=()=>uploadFiles([...retryFiles]);
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
 let previewURLs=[];
 $('files').onchange=()=>{previewURLs.forEach(URL.revokeObjectURL);previewURLs=[];const files=[...$('files').files];$('selection').replaceChildren();if(files.length>200){msg('Máximo 200 fotografías. Selecciona un lote más pequeño.');$('upload').disabled=true;return}$('upload').disabled=false;msg(files.length+' fotografías seleccionadas. Mantén la app abierta durante la carga.');for(const file of files.slice(0,12)){const img=document.createElement('img');img.src=URL.createObjectURL(file);previewURLs.push(img.src);img.alt=file.name;$('selection').append(img)}};
 
 let garmentBlob=null,garmentData=null,garmentSaving=false;
const aiMsg=s=>{$('aiStatus').textContent=s;$('globalStatus').textContent=s};
async function makeGarmentBlob(file){return await compressed(file)}
$('analyze').onclick=async()=>{
  const file=$('garmentFile').files[0];if(!file)return aiMsg('Selecciona una foto de una prenda.');
  const {data:{session}}=await supabase.auth.getSession();if(!session)return aiMsg('Inicia sesión primero.');
  $('analyze').disabled=true;$('aiForm').classList.add('hidden');aiMsg('Analizando fotografía...');
  try{
    garmentBlob=await makeGarmentBlob(file);
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(garmentBlob)});
    const response=await fetch('https://tqphpcoqnlhzlxvzilxy.supabase.co/functions/v1/analyze-garment',{
      method:'POST',headers:{'Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_xX9_VMIhz3C_JLTmhtWoPw_4KpWD73b','Content-Type':'application/json'},body:JSON.stringify({image:base64})
    });
    const result=await response.json();if(!response.ok)throw Error(result.error||'Error HTTP '+response.status);
    garmentData=result;
    $('gName').value=result.nombre||'';$('gCategory').value=result.categoria||'';$('gColors').value=Array.isArray(result.colores)?result.colores.join(', '):result.colores||'';
    $('gPattern').value=result.estampado||'';$('gStyle').value=result.estilo||'';$('gDescription').value=result.descripcion||'';
    $('garmentPreview').src=URL.createObjectURL(garmentBlob);
    $('aiForm').classList.remove('hidden');aiMsg('Análisis terminado. Revisa y corrige los campos antes de guardar.');
  }catch(e){aiMsg('No se pudo analizar: '+e.message)}finally{$('analyze').disabled=false}
};
$('saveGarment').onclick=async()=>{
  if(garmentSaving)return;
  if(!garmentBlob)return aiMsg('Primero analiza una fotografía.');
  const {data:{user}}=await supabase.auth.getUser();if(!user)return aiMsg('Inicia sesión primero.');
  garmentSaving=true;$('saveGarment').disabled=true;aiMsg('Guardando prenda...');
  const path=user.id+'/garments/'+crypto.randomUUID()+'.jpg';
  try{
    const up=await supabase.storage.from('closet-images').upload(path,garmentBlob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
    const description=$('gDescription').value.trim();
    const ins=await supabase.from('garments').insert({user_id:user.id,name:$('gName').value.trim()||'Prenda sin nombre',category:$('gCategory').value.trim(),color:$('gColors').value.trim(),colors:$('gColors').value.split(',').map(x=>x.trim()).filter(Boolean),pattern:$('gPattern').value.trim(),style:$('gStyle').value.trim(),description,image_path:path});
    if(ins.error){await supabase.storage.from('closet-images').remove([path]);throw ins.error}
    aiMsg('Prenda y descripción completa guardadas en la nube.');$('aiForm').classList.add('hidden');garmentBlob=null;await loadGarments();
  }catch(e){aiMsg('No se pudo guardar: '+e.message)}finally{garmentSaving=false;$('saveGarment').disabled=false}
};
$('refreshGarments').onclick=loadGarments;
async function loadGarments(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data,error}=await readAll('garments','id,name,category,color,colors,pattern,style,description,image_path');
  if(error){aiMsg('Error al cargar prendas: '+error.message);return}
  garments=data;$('garmentCount').textContent=data.length;fillCategories();renderGarments();}
let renderVersion=0;
function renderGarments(){const version=++renderVersion;const data=filteredGarments();const gallery=$('garmentGallery');gallery.replaceChildren();$('count').textContent=data.length+' prenda(s)';renderGarmentCards(data,gallery,version).catch(e=>aiMsg('No se pudieron mostrar las prendas: '+e.message));}
async function renderGarmentCards(data,gallery,version){
  for(const g of data){const {data:link,error:e}=await supabase.storage.from('closet-images').createSignedUrl(g.image_path,3600);if(version!==renderVersion)return;if(e)continue;
    const div=document.createElement('div');div.className='tile';const img=document.createElement('img');img.src=link.signedUrl;img.loading='lazy';img.alt=g.name||'Prenda';
    const label=document.createElement('p');label.textContent=[g.name,g.category,(g.colors?.length?g.colors.join(', '):g.color),g.pattern,g.style,g.description].filter(Boolean).join(' · ');const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ver ficha completa';const info=document.createElement('p');info.textContent=[g.pattern&&'Estampado: '+g.pattern,g.style&&'Estilo: '+g.style,g.description&&'Descripción: '+g.description].filter(Boolean).join(' · ')||'Sin descripción adicional';detail.append(summary,info);const del=document.createElement('button');del.textContent='Eliminar prenda';del.style.background='#9b3030';del.onclick=async()=>{if(!confirm('¿Eliminar esta prenda y su fotografía? Esta acción no se puede deshacer.'))return;del.disabled=true;const {error:dbError,data:deleted}=await supabase.from('garments').delete().eq('id',g.id).select('id');if(dbError||!deleted?.length){aiMsg('No se pudo eliminar: '+(dbError?.message||'Comprueba permisos'));del.disabled=false;return}const {error:storageError}=await removeUnusedImage(g.image_path);aiMsg(storageError?'Prenda eliminada, pero no se pudo borrar su archivo: '+storageError.message:'Prenda eliminada.');await loadGarments()};const edit=document.createElement('button');edit.textContent='Editar ficha';edit.onclick=()=>{if(div.querySelector('form'))return;const form=document.createElement('form');const fields=[['name','Nombre'],['category','Categoría'],['color','Colores'],['pattern','Estampado'],['style','Estilo'],['description','Descripción']];const inputs={};for(const [key,title] of fields){const wrapper=document.createElement('label');wrapper.textContent=title+' ';const input=key==='description'?document.createElement('textarea'):document.createElement('input');input.value=key==='color'?(g.colors?.length?g.colors.join(', '):g.color||''):(g[key]||'');wrapper.append(input);form.append(wrapper,document.createElement('br'));inputs[key]=input}const save=document.createElement('button');save.type='submit';save.textContent='Guardar cambios';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>form.remove();form.append(save,cancel);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const color=inputs.color.value.trim();const changes={name:inputs.name.value.trim(),category:inputs.category.value.trim(),color,colors:color.split(',').map(x=>x.trim()).filter(Boolean),pattern:inputs.pattern.value.trim(),style:inputs.style.value.trim(),description:inputs.description.value.trim()};const result=await supabase.from('garments').update(changes).eq('id',g.id).select('id');if(result.error||!result.data?.length){aiMsg('No se pudieron guardar los cambios: '+(result.error?.message||'Comprueba permisos'));save.disabled=false;return}aiMsg('Ficha actualizada.');await loadGarments()};div.append(form)};div.append(img,label,detail,edit,del);gallery.append(div)}
  if(!data.length)gallery.textContent=garments.length?'No hay prendas con estos filtros.':'Tu armario empieza con una foto. Añade tu primera prenda.';
}

supabase.auth.onAuthStateChange(()=>{setTimeout(state,0)});state();

async function readAll(table,fields){const data=[];for(let offset=0;;){const page=await supabase.from(table).select(fields).order('created_at',{ascending:false}).order('id').range(offset,offset+199);if(page.error)return {data:null,error:page.error};data.push(...page.data);if(!page.data.length)break;offset+=page.data.length;}return {data,error:null}}
function fillCategories(){const select=$('categoryFilter'),value=select.value;select.replaceChildren(new Option('Todas',''));for(const category of [...new Set(garments.map(g=>g.category).filter(Boolean))].sort())select.add(new Option(category,category));select.value=value}
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function filteredGarments(){const search=normalized($('search').value),category=$('categoryFilter').value;const counts=new Map();for(const g of garments){const key=normalized(g.name)+'|'+normalized(g.category)+'|'+normalized(g.color);counts.set(key,(counts.get(key)||0)+1)}return garments.filter(g=>(!category||g.category===category)&&normalized([g.name,g.category,g.color,g.description,g.style].join(' ')).includes(search)&&(!$('duplicateFilter').value||counts.get(normalized(g.name)+'|'+normalized(g.category)+'|'+normalized(g.color))>1))}
for(const id of ['search','categoryFilter','duplicateFilter'])$(id).addEventListener('input',renderGarments);
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{if($('private').classList.contains('hidden')){$('login').scrollIntoView({behavior:'smooth'});return}document.querySelectorAll('.panel').forEach(panel=>panel.hidden=panel.id!==button.dataset.go);document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.go===button.dataset.go)));$(button.dataset.go).scrollIntoView({behavior:'smooth',block:'start'})});
$('manual').onclick=async()=>{const file=$('garmentFile').files[0];if(!file)return aiMsg('Selecciona una fotografía.');try{garmentBlob=await compressed(file);for(const id of ['gName','gCategory','gColors','gPattern','gStyle','gDescription'])$(id).value='';$('garmentPreview').src=URL.createObjectURL(garmentBlob);$('aiForm').classList.remove('hidden');aiMsg('Completa la ficha antes de guardar.')}catch(e){aiMsg(e.message)}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

async function removeUnusedImage(path){for(const table of ['garments','outfits']){const result=await supabase.from(table).select('id').eq('image_path',path).limit(1);if(result.error)return {error:result.error};if(result.data.length)return {error:null}}return await supabase.storage.from('closet-images').remove([path])}
