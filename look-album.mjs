import {frameValues, seasonFor, seasonNames} from './photo-dates.mjs?v=20261112';

export function createAlbum({client, readAll, removeImage, describeLook, report}) {
  const $ = id => document.getElementById(id);
  const bucket = client.storage.from('closet-images');
  const fields = 'id,image_path,created_at,captured_on,frame,look_description';
  let rows = [];
  let owner = null;
  let selectedSeason = 'all';
  let activeEdit = null;
  let saving = false;
  let generation = 0;
  const links = new Map();
  const dialog = $('frameDialog');
  const descriptionDialog = $('lookDescriptionDialog');
  const descriptionInput = $('lookDescription');
  const descriptionStatus = $('lookDescriptionStatus');
  let descriptionEdit = null;
  function season(row) {
    return /\/look-[^/]+\.jpg$/.test(row.image_path) ? 'generated' : seasonFor(row.captured_on);
  }

  function setFrame(img, frame) {
    const {x, y, zoom} = frameValues(frame);
    img.style.objectPosition = x + '% ' + y + '%';
    img.style.transformOrigin = x + '% ' + y + '%';
    img.style.transform = 'scale(' + zoom + ')';
  }

  async function imageURL(path) {
    const cached = links.get(path);
    if (cached && cached.until > Date.now()) return cached.url;
    const {data, error} = await bucket.createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error || Error('Foto no disponible');
    links.set(path, {url: data.signedUrl, until: Date.now() + 3000000});
    return data.signedUrl;
  }

  function button(label, callback, cls = 'secondary') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = cls;
    el.textContent = label;
    el.onclick = callback;
    return el;
  }

  function render() {
    const token = ++generation;
    const gallery = $('gallery');
    gallery.replaceChildren();
    const counts = {};
    for (const row of rows) counts[season(row)] = (counts[season(row)] || 0) + 1;
    const filters = $('seasonFilters');
    filters.replaceChildren();
    for (const [key, title] of Object.entries({all: 'Todos', ...seasonNames})) {
      const count = key === 'all' ? rows.length - (counts.generated || 0) : counts[key] || 0;
      const chip = button(title + ' · ' + count, () => {
        selectedSeason = key;
        render();
        filters.querySelector('[aria-pressed=true]')?.focus();
      });
      chip.setAttribute('aria-pressed', String(key === selectedSeason));
      filters.append(chip);
    }
    const visible = rows.filter(row => selectedSeason === 'all' ? season(row) !== 'generated' : season(row) === selectedSeason);
    visible.sort((a,b) => (b.captured_on || '').localeCompare(a.captured_on || '') || String(b.created_at).localeCompare(String(a.created_at)));
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-album';
      empty.textContent = rows.length ? 'Todavía no tienes looks en esta vista.' : 'Sube tus primeras fotos de looks.';
      gallery.append(empty);
    }
    // Sign and load images as they approach the viewport, even with a large photo album.
    observer?.disconnect();
    for (const row of visible) {
      const data = row;
      const card = document.createElement('article');
      card.className = 'look-photo-card';
      const frame = document.createElement('div');
      frame.className = 'photo-frame';
      const img = document.createElement('img');
      img.alt = 'Foto del look';
      img.loading = 'lazy';
      setFrame(img, data.frame);
      frame.append(img);
      const show = () => imageURL(row.image_path).then(url => {
        if (token === generation) img.src = url;
      }).catch(() => { if (token === generation) img.alt = 'Foto no disponible'; });
      if (observer) {
        pending.set(img, show);
        observer.observe(img);
      } else {
        show();
      }
      const label = document.createElement('p');
      const date = data.captured_on?.split('-').reverse().join('/');
      label.textContent = seasonNames[season(row)] + (date ? ' · ' + date : '');
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(button('Ajustar', () => edit(row)));
      if (season(row) !== 'generated') {
        actions.append(button(row.look_description ? 'Ver descripción' : '✦ Analizar look', () => openDescription(row)));
      }
      const remove = button('Eliminar', async () => {
        if (!confirm('¿Eliminar esta foto de tu álbum?')) return;
        remove.disabled = true;
        try {
          const result = await client.from('outfits').delete().eq('id', row.id).select('id');
          if (result.error || !result.data?.length) throw result.error || Error('La foto no se ha podido eliminar');
          rows = rows.filter(item => item.id !== row.id);
          $('outfitCount').textContent = rows.length;
          render();
          try { await removeImage(row.image_path); } catch {}
          report('Foto eliminada.');
        } catch (error) {
          report('No se pudo eliminar: ' + error.message);
          remove.disabled = false;
        }
      }, 'quiet-button');
      actions.append(remove);
      card.append(frame, label, actions);
      gallery.append(card);
    }
  }

  const pending = new WeakMap();
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      pending.get(entry.target)?.();
    }
  }, {rootMargin: '240px'}) : null;

  function currentFrame() {
    return frameValues({x: Number($('frameX').value), y: Number($('frameY').value), zoom: Number($('frameZoom').value)});
  }
  function setControls(frame) {
    const {x,y,zoom} = frameValues(frame);
    $('frameX').value = x;
    $('frameY').value = y;
    $('frameZoom').value = zoom;
    setFrame($('frameImage'), {x,y,zoom});
  }

  async function edit(row) {
    if (dialog.open) return;
    const data = row;
    activeEdit = row;
    $('frameImage').removeAttribute('src');
    $('frameDate').value = data.captured_on || '';
    setControls(data.frame);
    $('frameStatus').textContent = '';
    dialog.showModal();
    try {
      const url = await imageURL(row.image_path);
      if (activeEdit === row && dialog.open) $('frameImage').src = url;
    } catch { if (activeEdit === row) $('frameStatus').textContent = 'No se pudo abrir la foto.'; }
  }

  $('frameForm').onsubmit = async event => {
    event.preventDefault();
    if (!activeEdit || saving) return;
    const row = activeEdit;
    const changes = {captured_on: $('frameDate').value || null, frame: currentFrame()};
    saving = true;
    $('saveFrame').disabled = true;
    try {
      const {data, error} = await client.from('outfits').update(changes)
        .eq('id', row.id).eq('user_id', owner).select(fields);
      if (error || !data?.length) throw error || Error('No se pudo actualizar el look en la nube.');
      Object.assign(row, data[0]);
      dialog.close();
      render();
      report('Ajuste guardado en tu cuenta.');
    } catch (error) { $('frameStatus').textContent = 'No se pudo guardar: ' + error.message; }
    finally { saving = false; $('saveFrame').disabled = false; }
  };
  for (const id of ['frameX','frameY','frameZoom']) $(id).oninput = () => setFrame($('frameImage'), currentFrame());
  $('resetFrame').onclick = () => setControls(null);
  $('cancelFrame').onclick = () => { if (!saving) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { activeEdit = null; $('frameImage').removeAttribute('src'); });

  function setDescriptionBusy(busy) {
    descriptionInput.disabled = busy;
    $('generateLookDescription').disabled = busy;
    $('saveLookDescription').disabled = busy;
  }

  function openDescription(row) {
    if (descriptionDialog.open) return;
    descriptionEdit = {id: row.id, owner};
    descriptionInput.value = row.look_description || '';
    descriptionStatus.textContent = '';
    setDescriptionBusy(false);
    descriptionDialog.showModal();
    if (!row.look_description) generateDescription();
  }

  async function generateDescription() {
    const edit = descriptionEdit;
    if (!edit || descriptionInput.disabled) return;
    setDescriptionBusy(true);
    descriptionStatus.textContent = 'Analizando el conjunto…';
    try {
      const description = await describeLook(edit.id);
      if (descriptionEdit !== edit) return;
      descriptionInput.value = description;
      descriptionStatus.textContent = 'Revisa el texto y guarda la descripción.';
    } catch (error) {
      if (descriptionEdit === edit) descriptionStatus.textContent = error.message;
    } finally {
      if (descriptionEdit === edit) setDescriptionBusy(false);
    }
  }

  $('generateLookDescription').onclick = generateDescription;
  $('lookDescriptionForm').onsubmit = async event => {
    event.preventDefault();
    const edit = descriptionEdit;
    const description = descriptionInput.value.trim();
    if (!edit || descriptionInput.disabled) return;
    if (!description) {
      descriptionStatus.textContent = 'Escribe o genera una descripción antes de guardar.';
      return;
    }
    setDescriptionBusy(true);
    descriptionStatus.textContent = 'Guardando descripción…';
    try {
      const {data, error} = await client.from('outfits').update({look_description: description})
        .eq('id', edit.id).eq('user_id', edit.owner).select('id,look_description');
      if (error || !data?.length) throw error || Error('No se pudo guardar la descripción.');
      if (descriptionEdit !== edit) return;
      const row = rows.find(row => row.id === edit.id);
      if (row) row.look_description = data[0].look_description;
      descriptionDialog.close();
      render();
      report('Descripción guardada en tu cuenta.');
    } catch (error) {
      if (descriptionEdit === edit) descriptionStatus.textContent = 'No se pudo guardar: ' + error.message;
    } finally {
      if (descriptionEdit === edit) setDescriptionBusy(false);
    }
  };
  $('closeLookDescription').onclick = () => descriptionDialog.close();
  descriptionDialog.addEventListener('close', () => { descriptionEdit = null; });

  async function load() {
    const {data:{user}} = await client.auth.getUser();
    if (!user) return;
    const previousOwner = owner;
    owner = user.id;
    const data = await readAll('outfits', fields);
    if (owner !== user.id) return;
    if (data.error) throw data.error;
    if (previousOwner && previousOwner !== owner) links.clear();
    rows = data.data;
    $('outfitCount').textContent = rows.length;
    render();
  }

  function reset() {
    owner = null;
    rows = [];
    links.clear();
    observer?.disconnect();
    generation++;
    selectedSeason = 'all';
    if (dialog.open) dialog.close();
    if (descriptionDialog.open) descriptionDialog.close();
    $('gallery').replaceChildren();
  }
  return {load, reset};
}
