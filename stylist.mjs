import {propose,roleOf,usable,scoreLook} from './combinations.mjs?v=20261112e';

export function initStylist({client,getCatalog,onSaved}){
 const $=id=>document.getElementById(id);
 let current=[],version=0,options={},saved=new Set(),saving=new Set();
 const imageCache=new Map();
 const status=text=>{$('stylistStatus').textContent=text};
 function reset(){version++;current=[];saved.clear();imageCache.clear();$('lookResults').replaceChildren();$('anchorItem').replaceChildren(new Option('Sorpréndeme',''));status('Entra para combinar tus prendas.');}
 function catalogChanged(){const select=$('anchorItem'),selected=select.value;select.replaceChildren(new Option('Sorpréndeme',''));for(const g of getCatalog().filter(g=>roleOf(g)))select.add(new Option(g.name||g.category,g.id));select.value=getCatalog().some(g=>g.id===selected)?selected:'';current=[];version++;$('lookResults').replaceChildren();status(getCatalog().length?'Tu armario está listo. Pulsa Combíname.':'Añade prendas con sus categorías para crear tu primer look.');}
 async function imageURL(item){const cached=imageCache.get(item.image_path);if(cached&&cached.expires>Date.now())return cached.url;const result=await client.storage.from('closet-images').createSignedUrl(item.image_path,3600);if(result.error)throw result.error;if(!result.data?.signedUrl)throw Error('Fotografía no disponible.');imageCache.set(item.image_path,{url:result.data.signedUrl,expires:Date.now()+3000000});return result.data.signedUrl;}
 function action(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=handler;return button}
 async function render(){
 const ticket=++version,container=$('lookResults');container.replaceChildren();
 for(const [index,look] of current.entries()){
 const card=document.createElement('article');card.className='suggested-look';
 const title=document.createElement('h3');title.textContent='Propuesta '+(index+1);
 const images=document.createElement('div');images.className='look-pieces';
 for(const item of look.items){const figure=document.createElement('figure'),img=document.createElement('img'),label=document.createElement('figcaption');img.alt=item.name||'Prenda de tu armario';img.loading='lazy';label.textContent=item.name||item.category;figure.append(img,label);images.append(figure);imageURL(item).then(url=>{if(ticket===version)img.src=url}).catch(()=>{if(ticket===version){img.hidden=true;label.textContent+=' · Foto no disponible'}})}
 const explanation=document.createElement('p');explanation.textContent=look.reasons.join(' ');
 const warnings=document.createElement('p');warnings.className='look-warning';warnings.textContent=look.warnings.join(' ');
 const actions=document.createElement('div');actions.className='look-actions';
 const save=action(saved.has(look.key)?'Guardado en Outfits':'Guardar look',()=>saveLook(look,save));save.disabled=saved.has(look.key)||saving.has(look.key);
 const alternatives=getCatalog().filter(g=>roleOf(g)==='shoes'&&usable(g,options.weather)&&!look.items.some(item=>item.id===g.id));
 const anchor=getCatalog().find(g=>g.id===options.anchorId);
 const swap=action('Cambiar calzado',()=>{const replacement=alternatives[Math.floor(Math.random()*alternatives.length)];if(!replacement)return;look.items=[...look.items.filter(g=>roleOf(g)!=='shoes'),replacement];look.key=look.items.map(g=>g.id).sort().join('|');Object.assign(look,scoreLook(look.items,options));look.warnings=look.warnings.filter(w=>!w.includes('calzado'));render()});swap.className='secondary';swap.disabled=!alternatives.length||roleOf(anchor||{})==='shoes';
 actions.append(save,swap);card.append(title,images,explanation,warnings,actions);container.append(card);
 }
 }
 async function generate(){options={occasion:$('lookOccasion').value,weather:$('lookWeather').value,anchorId:$('anchorItem').value};const result=propose(getCatalog(),options);current=result.looks;status(result.message+(result.unclassified?' Hay '+result.unclassified+' ficha(s) cuya categoría debes completar.':''));await render();}
 function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>{img.src='';reject(Error('La foto tarda demasiado en cargar. Inténtalo de nuevo.'))},20000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(Error('No se pudo cargar una de las fotos del look.'))};img.src=url})}
 async function collage(look){
 const photos=await Promise.all(look.items.map(async item=>loadImage(await imageURL(item))));
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1100;const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f1e8';ctx.fillRect(0,0,1200,1100);ctx.fillStyle='#354333';ctx.font='40px Georgia';ctx.fillText('MY CLOSET · Mi look',48,65);ctx.font='22px sans-serif';ctx.fillText(new Date().toLocaleDateString('es-ES'),48,104);
 const columns=2,rows=Math.ceil(photos.length/columns),height=850/rows;
 photos.forEach((img,index)=>{const x=48+(index%columns)*560,y=150+Math.floor(index/columns)*height,w=536,h=height-62;ctx.fillStyle='#e6e4d9';ctx.fillRect(x,y,w,h);const scale=Math.min(w/img.width,h/img.height);ctx.drawImage(img,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);ctx.fillStyle='#354333';ctx.font='22px sans-serif';const name=look.items[index].name||look.items[index].category;ctx.fillText(name.length>37?name.slice(0,36)+'…':name,x,y+h+30,w)});
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar la imagen del look.')),'image/jpeg',.9));
 }
 async function saveLook(look,button){
 if(saved.has(look.key)||saving.has(look.key))return;
 const snapshot={...look,items:[...look.items]};const key=snapshot.key,ticket=version;saving.add(key);button.disabled=true;button.textContent='Guardando…';status('Preparando la imagen de tu look…');let uploaded=false,path=null;
 try{
 const {data:{user},error:authError}=await client.auth.getUser();if(authError)throw authError;if(!user)throw Error('Inicia sesión para guardar el look.');
 const blob=await collage(snapshot);if(ticket!==version)throw Error('El look ha cambiado. Vuelve a guardarlo.');
 path=user.id+'/outfits/look-'+crypto.randomUUID()+'.jpg';const up=await client.storage.from('closet-images').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;uploaded=true;
 const result=await client.from('outfits').insert({user_id:user.id,image_path:path});if(result.error)throw result.error;
 saved.add(key);status('Look guardado en tus Outfits. Aparecerá también en tus otros dispositivos con la misma cuenta.');button.textContent='Guardado en Outfits';await onSaved().catch(()=>status('Look guardado. Pulsa Actualizar en Outfits para verlo.'));
 }catch(error){if(uploaded&&path&&!saved.has(key))await client.storage.from('closet-images').remove([path]).catch(()=>{});status('No se pudo guardar: '+error.message);button.textContent='Reintentar guardar';button.disabled=false}
 finally{saving.delete(key);await render()}
 }
 $('generateLooks').onclick=()=>generate().catch(e=>status('No se pudieron crear propuestas: '+e.message));
 for (const id of ['lookOccasion', 'lookWeather', 'anchorItem']) {
  $(id).onchange = () => generate().catch(error => status('No se pudieron crear propuestas: ' + error.message));
 }
 return {catalogChanged,reset};
}
