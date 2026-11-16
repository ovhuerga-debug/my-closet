const euros = new Intl.NumberFormat('es-ES', {style:'currency', currency:'EUR'});
const madridYear = new Intl.DateTimeFormat('es-ES', {timeZone:'Europe/Madrid', year:'numeric'});

export function purchaseDetails(yearInput, priceInput) {
  const year=String(yearInput??'').trim();
  const price=String(priceInput??'').trim().replace(',', '.');
  if (year && (!/^\d{4}$/.test(year) || Number(year)<1900 || Number(year)>Number(madridYear.format(new Date())))) {
    throw Error('Introduce un año entre 1900 y el actual.');
  }
  if (price && !/^\d{1,8}(?:\.\d{1,2})?$/.test(price)) {
    throw Error('Introduce un precio en euros con un máximo de dos decimales.');
  }
  return {entry_year:year?Number(year):null, purchase_price_eur:price?Number(price):null};
}

export function detailsLabel(item) {
  const year=item.entry_year;
  const price=item.purchase_price_eur;
  return [year?'Año de entrada '+year:'',price==null?'':euros.format(Number(price))].filter(Boolean).join(' · ');
}

export function sortByPrice(items, direction) {
  if (!['asc','desc'].includes(direction)) return items;
  const sign=direction==='asc'?1:-1;
  return [...items].sort((a,b)=>{
    if (a.purchase_price_eur==null) return b.purchase_price_eur==null?0:1;
    if (b.purchase_price_eur==null) return -1;
    return sign*(Number(a.purchase_price_eur)-Number(b.purchase_price_eur));
  });
}
