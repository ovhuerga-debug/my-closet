import {categories} from './closet-catalog.mjs?v=20261112e';
import {productPhoto} from './garment-photos.mjs?v=purchases1';
import {purchaseDetails} from './garment-details.mjs?v=entry1';

export function readPurchaseBatch(text) {
  const batch = JSON.parse(text);
  const fromReceipts = batch?.format === 'my-closet-receipt-purchases';
  const yearUpdate = batch?.format === 'my-closet-purchase-year';
  if ((!fromReceipts && !yearUpdate && batch?.format !== 'my-closet-purchases') || !Array.isArray(batch.items) ||
      !batch.items.length || batch.items.length > 200) {
    throw Error('Selecciona un lote de compras de MY CLOSET de hasta 200 artículos.');
  }
  const year = yearUpdate ? purchaseDetails(batch.year, null).entry_year : null;
  if (yearUpdate && !year) throw Error('Indica el año de entrada de las fichas.');
  const items = new Map();
  for (const item of batch.items) {
    const {brand, ref, name, category, colors, description, photo} = item || {};
    const validText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
    if (yearUpdate) {
      if (typeof ref !== 'string' || !/^recibo-[a-f0-9]{24}$/.test(ref) || !validText(name, 160)) {
        throw Error('Falta el nombre o la referencia de una ficha.');
      }
      items.set(ref, {ref, name, year});
      continue;
    }
    if (!validText(brand, 80) || typeof ref !== 'string' ||
        !validText(name, 160) || !categories.includes(category) || !Array.isArray(colors) ||
        colors.length > 8 || !colors.every(color => validText(color, 40)) ||
        !validText(description, 1000) || typeof photo !== 'string') {
      throw Error('Hay una ficha incompleta o con un formato incorrecto.');
    }
    if (fromReceipts) {
      const {size, price, style} = item;
      if (!/^recibo-[a-f0-9]{24}$/.test(ref) || !validText(size, 60) ||
          (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1000000)) ||
          (style !== undefined && !validText(style, 60)) ||
          photo.length > 250000 || !/^\/9j\/[a-z0-9+/]+={0,2}$/i.test(photo)) {
        throw Error('Revisa la talla, el precio o la foto de ' + name + '.');
      }
      items.set(brand + ':' + ref, {brand, ref, name, category, colors, description, photo, size, price, style, fromReceipts});
      continue;
    }
    if (!['Zara', 'Pull&Bear'].includes(brand) || !/^\d{11}$/.test(ref) || !productPhoto(photo)) {
      throw Error('La marca, la referencia o la foto de ' + name + ' no coincide con el recibo.');
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

function receiptGarment(item, catalog) {
  return catalog.find(garment => (garment.image_path || '').endsWith('/' + item.ref + '.jpg'));
}

function alreadySaved(item, catalog) {
  if (item.fromReceipts) {
    return Boolean(receiptGarment(item, catalog)) ||
      catalog.some(garment => garment.name === item.name && garment.category === item.category &&
        (garment.description || '').includes('Talla: ' + item.size + '.'));
  }
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
  const saveLabel = save.textContent;
  const instructions = document.querySelector('#purchaseUpload > p');
  if (instructions) instructions.textContent = 'Carga un lote preparado a partir de pedidos, tickets o capturas. Revisa las prendas antes de guardarlas.';
  let selected = [];
  let saving = false;
  let revision = 0;

  function reset() {
    revision++;
    file.value = '';
    selected = [];
    list.replaceChildren();
    status.textContent = '';
    save.textContent = saveLabel;
    save.disabled = true;
    save.textContent = saveLabel;
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
      if (source.size > 8_000_000) throw Error('El lote supera 8 MB.');
      const batch = readPurchaseBatch(await source.text());
      if (current !== revision) return;
      const catalog = getCatalog();
      if (batch[0].year) save.textContent = 'Actualizar año de entrada';
      selected = batch.map(item => {
        const row = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        const garment = item.year ? receiptGarment(item, catalog) : null;
        checkbox.disabled = item.year ? !garment || garment.entry_year === item.year : alreadySaved(item, catalog);
        checkbox.checked = !checkbox.disabled;
        checkbox.onchange = () => { save.disabled = !selected.some(entry => entry.checkbox.checked); };
        const detail = item.year ? 'Año de entrada ' + item.year : item.fromReceipts
          ? item.size + (item.price === null ? '' : ' · ' + item.price.toFixed(2).replace('.', ',') + ' €')
          : item.brand + ' · ' + item.ref;
        const reason = item.year ? (garment ? 'Año ya guardado' : 'Ficha ausente') : 'Ya en el armario';
        label.append(checkbox, ' ' + item.name + ' · ' + detail + (checkbox.disabled ? ' · ' + reason : ''));
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
      if (items[0].year) {
        const catalog = getCatalog();
        const ids = items.map(item => receiptGarment(item, catalog)?.id).filter(Boolean);
        let updated = 0;
        if (ids.length) {
          const result = await client.from('garments').update({entry_year:items[0].year})
            .eq('user_id', user.id).in('id', ids).select('id');
          if (result.error) throw result.error;
          updated = result.data.length;
        }
        reset();
        status.textContent = updated + ' fichas actualizadas.';
        await refresh();
        return;
      }
      const pending = items.filter(item => !alreadySaved(item, getCatalog()));
      const rows = [];
      const bucket = client.storage.from('closet-images');
      for (const item of pending) {
        const row = {
          id: await purchaseId(user.id, item),
          user_id: user.id,
          name: item.name.trim(),
          category: item.category,
          color: item.colors.join(', '),
          colors: item.colors,
          description: item.description.trim() + ' ' + item.brand + ' · Ref. ' + item.ref + '.',
          image_path: item.photo
        };
        if (item.fromReceipts) {
          status.textContent = 'Subiendo foto ' + (rows.length + 1) + ' de ' + pending.length + '…';
          row.image_path = user.id + '/garments/' + item.ref + '.jpg';
          row.purchase_price_eur = item.price;
          row.style = item.style || null;
          row.description = item.description.trim() + ' Talla: ' + item.size + '.';
          const bytes = Uint8Array.from(atob(item.photo), character => character.charCodeAt(0));
          const {error: uploadError} = await bucket.upload(row.image_path, bytes, {contentType:'image/jpeg'});
          if (uploadError && String(uploadError.statusCode) !== '409' && uploadError.error !== 'Duplicate') throw uploadError;
        }
        rows.push(row);
      }
      let added = 0;
      if (rows.length) {
        const result = await client.from('garments').upsert(rows, {onConflict:'id', ignoreDuplicates:true, defaultToNull:false}).select('id');
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
