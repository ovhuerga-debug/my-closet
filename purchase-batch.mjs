import {categories} from './closet-catalog.mjs?v=20261112e';
import {productPhoto} from './garment-photos.mjs?v=purchases1';

export function readPurchaseBatch(text) {
  const batch = JSON.parse(text);
  if (batch?.format !== 'my-closet-purchases' || !Array.isArray(batch.items) ||
      !batch.items.length || batch.items.length > 200) {
    throw Error('Selecciona un lote de compras de MY CLOSET de hasta 200 artículos.');
  }
  const items = new Map();
  for (const item of batch.items) {
    const {brand, ref, name, category, colors, description, photo} = item || {};
    const validText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
    if (!['Zara', 'Pull&Bear'].includes(brand) || typeof ref !== 'string' || !/^\d{11}$/.test(ref) ||
        !validText(name, 160) || !categories.includes(category) || !Array.isArray(colors) ||
        colors.length > 8 || !colors.every(color => validText(color, 40)) ||
        !validText(description, 1000) || typeof photo !== 'string' || !productPhoto(photo)) {
      throw Error('Hay una ficha incompleta o con un formato incorrecto.');
    }
    const host = brand === 'Zara' ? 'static.zara.net' : 'static.pullandbear.net';
    const url = new URL(photo);
    if (url.hostname !== host || !url.pathname.split('/').pop().startsWith(ref + '-')) {
      throw Error('La foto no coincide con la referencia ' + ref + '.');
    }
    items.set(brand + ':' + ref, {brand, ref, name, category, colors, description, photo});
  }
  return [...items.values()];
}

function alreadySaved(item, catalog) {
  const ref = new RegExp('\\b' + item.ref + '\\b');
  return catalog.some(garment => garment.image_path === item.photo ||
    (productPhoto(garment.image_path) && ref.test(garment.image_path)) ||
    ref.test(garment.description || ''));
}

async function purchaseId(userId, item) {
  const key = new TextEncoder().encode(['my-closet-purchase', userId, item.brand, item.ref].join(':'));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', key)).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function initPurchaseBatch({client, getCatalog, refresh}) {
  const file = document.getElementById('purchaseFile');
  if (!file) return {reset() {}, isSaving: () => false};
  const list = document.getElementById('purchaseReview');
  const status = document.getElementById('purchaseStatus');
  const save = document.getElementById('savePurchases');
  let selected = [];
  let saving = false;
  let revision = 0;

  function reset() {
    revision++;
    file.value = '';
    selected = [];
    list.replaceChildren();
    status.textContent = '';
    save.disabled = true;
  }

  file.onchange = async () => {
    const current = ++revision;
    const source = file.files[0];
    selected = [];
    list.replaceChildren();
    save.disabled = true;
    status.textContent = '';
    if (!source) return;
    try {
      if (source.size > 1_000_000) throw Error('El lote supera 1 MB.');
      const batch = readPurchaseBatch(await source.text());
      if (current !== revision) return;
      const catalog = getCatalog();
      selected = batch.map(item => {
        const row = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = alreadySaved(item, catalog);
        checkbox.checked = !checkbox.disabled;
        checkbox.onchange = () => { save.disabled = !selected.some(entry => entry.checkbox.checked); };
        label.append(checkbox, ' ' + item.name + ' · ' + item.brand + ' · ' + item.ref +
          (checkbox.disabled ? ' · Ya en el armario' : ''));
        row.append(label);
        list.append(row);
        return {item, checkbox};
      });
      save.disabled = !selected.some(entry => entry.checkbox.checked);
      status.textContent = batch.length + ' fichas en el lote.';
    } catch (error) {
      if (current !== revision) return;
      status.textContent = error instanceof SyntaxError ? 'El archivo no es un lote de MY CLOSET válido.' : error.message;
    }
  };

  save.onclick = async () => {
    if (saving) return;
    const items = selected.filter(entry => entry.checkbox.checked).map(entry => entry.item);
    if (!items.length) return;
    saving = true;
    file.disabled = save.disabled = true;
    status.textContent = 'Guardando compras…';
    try {
      const {data:{user}, error} = await client.auth.getUser();
      if (error || !user) throw error || Error('Inicia sesión para guardar las compras.');
      const pending = items.filter(item => !alreadySaved(item, getCatalog()));
      const rows = await Promise.all(pending.map(async item => ({
        id: await purchaseId(user.id, item),
        user_id: user.id,
        name: item.name.trim(),
        category: item.category,
        color: item.colors.join(', '),
        colors: item.colors,
        description: item.description.trim() + ' ' + item.brand + ' · Ref. ' + item.ref + '.',
        image_path: item.photo
      })));
      let added = 0;
      if (rows.length) {
        const result = await client.from('garments').upsert(rows, {onConflict:'id', ignoreDuplicates:true}).select('id');
        if (result.error) throw result.error;
        added = result.data.length;
      }
      reset();
      status.textContent = added + ' fichas guardadas.' +
        (items.length > added ? ' ' + (items.length - added) + ' ya estaban en el armario.' : '');
      await refresh();
    } catch (error) {
      status.textContent = 'No se pudo completar el guardado. ' + error.message;
      save.disabled = !selected.some(entry => entry.checkbox.checked);
    } finally {
      saving = false;
      file.disabled = false;
    }
  };

  return {reset, isSaving: () => saving};
}
