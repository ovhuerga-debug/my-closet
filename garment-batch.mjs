import {categoryFor, fillCategorySelect} from './closet-catalog.mjs?v=20261112e';

const fields = {
  name: 'gName', category: 'gCategory', color: 'gColors',
  pattern: 'gPattern', style: 'gStyle', description: 'gDescription'
};
const blank = () => Object.fromEntries(Object.keys(fields).map(key => [key, '']));

export function createGarmentBatch({client, compress, analyzePhoto, onSaved}) {
  const $ = id => document.getElementById(id);
  const bucket = client.storage.from('closet-images');
  const form = $('aiForm');
  const select = $('garmentQueue');
  let queue = [];
  let active = null;
  let preview;
  let working = false;
  let generation = 0;
  const report = message => { $('aiStatus').textContent = message; };
  const ready = item => !item.saved && !!item.draft.name.trim() && !!item.draft.category;

  function renderQueue() {
    select.replaceChildren(...queue.map((item, index) => {
      const state = item.saved ? 'Guardada' : ready(item) ? 'Lista para guardar'
        : item.error ? 'Revisar error' : item.analyzed ? 'Revisar ficha' : 'Pendiente';
      return new Option((index + 1) + '. ' + item.file.name + ' · ' + state, item.id);
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
    select.disabled = working;
    for (const id of Object.values(fields)) $(id).disabled = working || !!active?.saved;
  }

  function showActive(item) {
    active = item;
    if (preview) URL.revokeObjectURL(preview);
    preview = item ? URL.createObjectURL(item.file) : undefined;
    if (preview) $('garmentPreview').src = preview;
    else $('garmentPreview').removeAttribute('src');
    form.classList.toggle('hidden', !item);
    if (item) {
      $('garmentStep').textContent = 'Foto ' + (queue.indexOf(item) + 1) + ' de ' + queue.length;
      fillCategorySelect($('gCategory'), item.draft.category);
      for (const [key, id] of Object.entries(fields)) $(id).value = item.draft[key];
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
    for (const file of files) {
      if (queue.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
      queue.push({id: crypto.randomUUID(), file, draft: blank(), analyzed: false, saved: false, error: ''});
    }
    $('garmentFile').value = '';
    showActive(queue[firstNew] || active);
    report(queue.length ? 'Puedes analizar las fotos juntas o completar cada ficha a mano.' : '');
  };

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
    if (version !== generation) return;
    const inferred = {
      name: result.nombre || '',
      category: categoryFor({name: result.nombre, category: result.categoria}),
      color: Array.isArray(result.colores) ? result.colores.join(', ') : result.colores || '',
      pattern: result.estampado || '',
      style: result.estilo || '',
      description: result.descripcion || ''
    };
    for (const key of Object.keys(fields)) {
      if (!item.draft[key].trim()) item.draft[key] = String(inferred[key] || '');
    }
    item.analyzed = true;
  }

  async function save(item, version) {
    const {data:{user}, error} = await client.auth.getUser();
    if (error || !user) throw error || Error('Inicia sesión primero.');
    if (version !== generation) return;
    const path = user.id + '/garments/' + item.id + '.jpg';
    const existing = await client.from('garments').select('id').eq('image_path', path).limit(1);
    if (existing.error) throw existing.error;
    if (!existing.data.length) {
      const blob = await compress(item.file);
      if (version !== generation) return;
      const upload = await bucket.upload(path, blob, {contentType: 'image/jpeg', upsert: false});
      if (upload.error && String(upload.error.statusCode) !== '409' && !/already exists|duplicate/i.test(upload.error.message)) throw upload.error;
      if (version !== generation) return;
      const draft = Object.fromEntries(Object.entries(item.draft).map(([key, value]) => [key, value.trim()]));
      const inserted = await client.from('garments').insert({
        ...draft, user_id: user.id, image_path: path,
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
