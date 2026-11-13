export function productPhoto(path) {
  return /^https:\/\/static\.(?:zara|pullandbear)\.net\/[a-z0-9/_.-]+\.jpg$/i.test(path || '');
}

export async function garmentPhotoURL(bucket, path) {
  if (productPhoto(path)) return path;
  const {data, error} = await bucket.createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error || Error('Foto no disponible.');
  return data.signedUrl;
}

export function extraPhotos({garment, client, compress, refresh, report}) {
  const details = document.createElement('details');
  const title = document.createElement('summary');
  const paths = garment.extra_image_paths || [];
  title.textContent = paths.length ? 'Más fotos (' + paths.length + ')' : 'Añadir más fotos';
  details.append(title);
  const bucket = client.storage.from('closet-images');
  const gallery = document.createElement('div');
  details.append(gallery);
  details.addEventListener('toggle', () => {
    if (!details.open || gallery.childElementCount) return;
    for (const path of paths) {
      const img = document.createElement('img');
      img.alt = 'Otra vista de ' + garment.name;
      img.loading = 'lazy';
      garmentPhotoURL(bucket, path).then(url => { img.src = url; }).catch(() => { img.alt = 'Foto no disponible'; });
      gallery.append(img);
    }
  });
  const label = document.createElement('label');
  label.textContent = 'Fotos adicionales de esta prenda';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.heic,.heif';
  input.multiple = true;
  label.append(input);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Guardar fotos';
  button.disabled = true;
  input.onchange = () => { button.disabled = !input.files.length; };
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  button.onclick = async () => {
    const files = [...input.files];
    if (!files.length || button.disabled) return;
    input.disabled = button.disabled = true;
    const uploaded = [];
    let committed = false;
    try {
      const {data:{user}, error} = await client.auth.getUser();
      if (error || !user) throw error || Error('Inicia sesión primero.');
      if (paths.length + files.length > 12) throw Error('Puedes guardar hasta 12 fotos adicionales por prenda.');
      for (const [index, file] of files.entries()) {
        status.textContent = 'Subiendo ' + (index + 1) + ' de ' + files.length + '…';
        const path = user.id + '/garments/' + crypto.randomUUID() + '.jpg';
        const result = await bucket.upload(path, await compress(file), {contentType:'image/jpeg'});
        if (result.error) throw result.error;
        uploaded.push(path);
      }
      const result = await client.rpc('append_garment_photos', {garment_id:garment.id, photo_paths:uploaded});
      if (result.error) throw result.error;
      committed = true;
      report('Fotos adicionales guardadas.');
      await refresh();
    } catch (error) {
      if (!committed && uploaded.length && error.code && error.code !== 'PGRST000') {
        await bucket.remove(uploaded).catch(() => {});
      }
      status.textContent = (committed ? 'Fotos guardadas. Actualiza la lista. ' : 'No se pudo completar el guardado. ') + error.message;
    } finally {
      if (committed) input.value = '';
      input.disabled = false;
      button.disabled = !input.files.length;
    }
  };
  details.append(label, button, status);
  return details;
}
