import {fold} from './combinations.mjs?v=20261112';

export const categories = [
  'Cazadora', 'Abrigo largo', 'Plumíferos', 'Camisas', 'Camisa manga corta',
  'Jerseys', 'Sudadera', 'Polos', 'Camisetas', 'Pantalón', 'Vaquero', 'Bermudas',
  'Zapatillas', 'Zapatos', 'Calzado de verano'
];

export function categoryFor(item) {
  const text = fold([item.category, item.name].filter(Boolean).join(' '));
  const rules = [
    ['Plumíferos', /plumifer|plumas|puffer|acolchad/],
    ['Abrigo largo', /abrigo|gabardina|trench|overcoat/],
    ['Sudadera', /\b(?:sudaderas?|hoodies?|sweatshirts?)\b/],
    ['Cazadora', /cazadora|chaqueta|jacket|blazer|americana/],
    ['Calzado de verano', /sandalia|calzado de verano|alpargata|chancla/],
    ['Zapatillas', /zapatilla|sneaker|deportivas/],
    ['Zapatos', /zapato|mocasin|loafer|botas?|botin/],
    ['Bermudas', /bermuda|shorts?|pantalon corto/],
    ['Vaquero', /vaquero|jeans|tejanos/],
    ['Pantalón', /pantalon|trouser|chino/],
    ['Camisa manga corta', /camisa.*manga corta|short.sleeve shirt/],
    ['Camisetas', /camiseta|t-shirt/],
    ['Polos', /\bpolos?\b/],
    ['Jerseys', /jersey|jers[eé]is|sueter|sweater|cardigan/],
    ['Camisas', /camisa|blusa|shirt/]
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

export function fillCategorySelect(select, value = '') {
  select.replaceChildren(new Option('Elige una categoría', ''), ...categories.map(label => new Option(label, label)));
  if (value && !categories.includes(value)) select.add(new Option(value, value));
  select.value = value;
}
