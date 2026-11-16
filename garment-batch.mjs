import {categoryFor, fillCategorySelect} from './closet-catalog.mjs?v=20261112e';
import {purchaseDetails} from './garment-details.mjs?v=entry1';
import {descriptionFromViews} from './garment-photos.mjs?v=travel1';

const fields = {
  name: 'gName', category: 'gCategory', color: 'gColors',
  pattern: 'gPattern', style: 'gStyle', description: 'gDescription'
};
const blank = () => Object.fromEntries(Object.keys(fields).map(key => [key, '']));
const sameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
const maxExtraPhotos = 12;

export function createGarmentBatch({client, compress, analyzePhoto, onSaved}) {
  const controls = Object.fromEntries(Object.entries({
    garmentUploadMode:'select', gExtraFiles:'input', gEntryYear:'input',
    gPurchasePrice:'input', gExtraPreviews:'div'
  }).map(([id,tag])=>[id,document.getElementById(id)||document.createElement(tag)]));
  const $ = id => controls[id] || document.getElementById(id);
  const bucket = client.storage.from('closet-images');
  const form = $('aiForm');
  const select = $('garmentQueue');
  let queue = [];
  let active = null;
  let previews = [];
  let working = false;
  let generation = 0;
  const report = message => { $('aiStatus').textContent = message; };
  const ready = item => !item.saved && !!item.draft.name.trim() && !!item.draft.category;

  function renderQueue() {
    select.replaceChildren(...queue.map((item, index) => {
      const state = item.saved ? 'Guardada' : ready(item) ? 'Lista para guardar'
        : item.error ? 'Revisar error' : item.analyzed ? 'Revisar ficha' : 'Pendiente';
      const total = 1 + item.extra.length;
      return new Option((index + 1) + '. ' + item.file.name + ' · ' + total + (total === 1 ? ' foto · ' : ' fotos · ') + state, item.id);
    }));
    $('garmentQueueControls').hidden = !queue.length;
    select.value = active?.id ?? '';
    const saved = queue.filter(item => item.saved).length;
    $('garmentQueueSummary').textContent = queue.length
      ? saved + ' de ' + queue.length + ' guardadas · ' + queue.filter(ready).length + ' listas'
      : '';
    $('analyzeBatch').disabled = working || !queue.some(item => !item.saved && !item.analyzed);
    $('analyze').disabled = working || !active || active.saved;
    $('saveBatch').disabled = working || !queue.some(ready);
    $('saveGarment').disabled = working || !active || active.saved;
    $('removeGarmentFile').disabled = working || !active;
    $('garmentFile').disabled = working;
    $('garmentUploadMode').disabled = working;
    $('gExtraFiles').disabled = working || !!active?.saved || (active?.extra.length ?? 0) >= maxExtraPhotos;
    for (const id of ['gEntryYear','gPurchasePrice']) $(id).disabled = working || !!active?.saved;
    for (const button of $('gExtraPreviews').querySelectorAll('button')) button.disabled = working || !!active?.saved;
    select.disabled = working;
    for (const id of Object.values(fields)) $(id).disabled = working || !!active?.saved;
  }

  function showActive(item) {
    active = item;
    previews.forEach(URL.revokeObjectURL);
    previews = [];
    $('gExtraPreviews').replaceChildren();
    $('gExtraFiles').value = '';
    if (item) {
      const preview = URL.createObjectURL(item.file);
      previews.push(preview);
      $('garmentPreview').src = preview;
    }
    else $('garmentPreview').removeAttribute('src');
    form.classList.toggle('hidden', !item);
    if (item) {
      $('garmentStep').textContent = 'Prenda ' + (queue.indexOf(item) + 1) + ' de ' + queue.length;
      fillCategorySelect($('gCategory'), item.draft.category);
      for (const [key, id] of Object.entries(fields)) $(id).value = item.draft[key];
      $('gEntryYear').value = item.year;
      $('gPurchasePrice').value = item.price;
      for (const [index, {file}] of item.extra.entries()) {
        const src = URL.createObjectURL(file);
        previews.push(src);
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Foto adicional ' + (index + 1);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'quiet-button';
        remove.textContent = 'Quitar foto ' + (index + 1);
        remove.onclick = () => {
          item.extra.splice(index, 1);
          item.analyzed = false;
          showActive(item);
        };
        figure.append(img, remove);
        $('gExtraPreviews').append(figure);
      }
    }
    renderQueue();
  }

  function reset() {
    generation++;
    queue = [];
    $('garmentFile').value = '';
    report('');
    showActive(null);
  }

  $('garmentFile').onchange = () => {
    const files = [...$('garmentFile').files];
    const firstNew = queue.length;
    const one = $('garmentUploadMode').value === 'one';
    let ignored = 0;
    for (const file of one ? files.slice(0, 1) : files) {
      if (!one && queue.some(item => sameFile(item.file, file))) continue;
      const item = {id: crypto.randomUUID(), file, extra: [], year: '', price: '', draft: blank(), analyzed: false, saved: false, error: ''};
      if (one) ignored = addExtra(item, files.slice(1));
      queue.push(item);
    }
    $('garmentFile').value = '';
    showActive(queue[firstNew] || active);
    report(ignored ? 'Se admiten hasta 12 fotos adicionales por prenda.' :
      queue.length ? 'Puedes analizar las fotos o completar cada ficha a mano.' : '');
  };

  function addExtra(item, files) {
    const distinct = files.filter((file, index) => !sameFile(item.file, file) &&
      !item.extra.some(photo => sameFile(photo.file, file)) &&
      !files.slice(0,index).some(other => sameFile(other,file)));
    const available = maxExtraPhotos - item.extra.length;
    item.extra.push(...distinct.slice(0, available).map(file => ({file,id:crypto.randomUUID()})));
    if (distinct.length && available > 0) item.analyzed = false;
    return Math.max(0, distinct.length - available);
  }

  $('gExtraFiles').onchange = () => {
    if (!active || active.saved || working) return;
    const ignored = addExtra(active, [...$('gExtraFiles').files]);
    showActive(active);
    report(ignored ? 'Se admiten hasta 12 fotos adicionales por prenda.' : '');
  };
  $('gEntryYear').oninput = () => { if (active) active.year = $('gEntryYear').value; };
  $('gPurchasePrice').oninput = () => { if (active) active.price = $('gPurchasePrice').value; };

  select.onchange = () => {
    showActive(queue.find(item => item.id === select.value));
    report(active?.error || '');
  };

  for (const [key, id] of Object.entries(fields)) {
    $(id).oninput = () => {
      if (!active || active.saved) return;
      active.draft[key] = $(id).value;
      renderQueue();
    };
  }

  $('removeGarmentFile').onclick = () => {
    const index = queue.indexOf(active);
    if (index < 0) return;
    queue.splice(index, 1);
    showActive(queue[Math.min(index, queue.length - 1)] || null);
    report(active?.error || '');
  };

  async function run(items, action, verb) {
    if (working || !items.length) return;
    working = true;
    const version = generation;
    renderQueue();
    let failed = 0;
    try {
      for (const [index, item] of items.entries()) {
        if (version !== generation) break;
        report(verb + ' ' + (index + 1) + ' de ' + items.length + '…');
        try {
          await action(item, version);
          item.error = '';
        } catch (error) {
          item.error = error.message || String(error);
          failed++;
        }
      }
      if (version === generation) {
        const completed = items.length - failed;
        const problem = items.find(item => item.error);
        showActive(problem || active);
        report(completed + ' de ' + items.length + ' completadas.' +
          (problem ? ' ' + failed + ' con incidencias. ' + problem.error : ''));
      }
    } finally {
      working = false;
      renderQueue();
    }
  }

  async function analyze(item, version) {
    const result = await analyzePhoto(await compress(item.file), () => version === generation);
    const views = [result];
    for (const {file} of item.extra.slice(0, 2)) {
      if (version !== generation) return;
      try { views.push(await analyzePhoto(await compress(file), () => version === generation)); }
      catch { /* La foto principal sigue siendo utilizable. */ }
    }
    if (version !== generation) return;
    const inferred = {
      name: result.nombre || '',
      category: categoryFor({name: result.nombre, category: result.categoria}),
      color: Array.isArray(result.colores) ? result.colores.join(', ') : result.colores || '',
      pattern: result.estampado || '',
      style: result.estilo || '',
      description: views.some(view => typeof view.descripcion === 'string' && view.descripcion.trim()) ? descriptionFromViews(views) : ''
    };
    for (const key of Object.keys(fields)) {
      if (!item.draft[key].trim()) item.draft[key] = String(inferred[key] || '');
    }
    item.analyzed = true;
  }

  async function save(item, version) {
    const details = purchaseDetails(item.year,item.price);
    const {data:{user}, error} = await client.auth.getUser();
    if (error || !user) throw error || Error('Inicia sesión primero.');
    if (version !== generation) return;
    const path = user.id + '/garments/' + item.id + '.jpg';
    const existing = await client.from('garments').select('id').eq('image_path', path).limit(1);
    if (existing.error) throw existing.error;
    if (!existing.data.length) {
      const extras = item.extra.map(({file,id}) => ({file,path:user.id + '/garments/' + id + '.jpg'}));
      for (const photo of [{file:item.file,path}, ...extras]) {
        const blob = await compress(photo.file);
        if (version !== generation) return;
        const upload = await bucket.upload(photo.path, blob, {contentType: 'image/jpeg', upsert: false});
        if (upload.error && String(upload.error.statusCode) !== '409' && !/already exists|duplicate/i.test(upload.error.message)) throw upload.error;
      }
      if (version !== generation) return;
      const draft = Object.fromEntries(Object.entries(item.draft).map(([key, value]) => [key, value.trim()]));
      const inserted = await client.from('garments').insert({
        ...draft, ...details, user_id: user.id, image_path: path, extra_image_paths: extras.map(photo=>photo.path),
        colors: draft.color.split(',').map(color => color.trim()).filter(Boolean)
      });
      if (inserted.error) throw inserted.error;
    }
    item.saved = true;
  }

  async function saveItems(items) {
    const version = generation;
    await run(items, save, 'Guardando');
    if (version !== generation || !items.some(item => item.saved)) return;
    if (active?.saved) {
      const index = queue.indexOf(active);
      const next = queue.slice(index + 1).find(item => !item.saved)
        || queue.find(item => !item.saved);
      showActive(next || null);
      if (next) {
        report(next.error || 'Ficha guardada. Ya puedes revisar la siguiente.');
        form.focus({preventScroll: true});
        form.scrollIntoView({block: 'start'});
      } else {
        report('Todas las prendas del lote están guardadas.');
      }
    }
    await onSaved();
  }

  $('analyze').onclick = () => run(active && !active.saved ? [active] : [], analyze, 'Analizando');
  $('analyzeBatch').onclick = () => run(queue.filter(item => !item.saved && !item.analyzed), analyze, 'Analizando');
  $('saveBatch').onclick = () => saveItems(queue.filter(ready));
  form.onsubmit = event => {
    event.preventDefault();
    if (!active || !ready(active)) return report('Completa el nombre y la categoría.');
    return saveItems([active]);
  };
  renderQueue();
  return {reset, isWorking: () => working};
}
