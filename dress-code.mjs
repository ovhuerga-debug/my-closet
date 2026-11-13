export const occasions = {
  daily: {code:'casual', hint:'Para el día a día, prendas cómodas y fáciles de combinar.'},
  work: {code:'business', hint:'Por defecto, informal de oficina. Si tu empresa tiene un código, selecciónalo abajo.'},
  evening: {code:'smart', hint:'Para una cena, prioriza prendas arregladas y adapta la propuesta al restaurante.'},
  lunch: {code:'smart', hint:'Para una comida, combina prendas arregladas de día con el nivel que pida el sitio.'},
  walk: {code:'casual', hint:'Para un paseo, prioriza calzado cómodo y capas según la temperatura.'},
  cinema: {code:'casual', hint:'Para el cine, prioriza comodidad y una capa ligera si refresca.'},
  theater: {code:'smart', hint:'Para el teatro, se propone un conjunto arreglado. El código de la sala o la invitación tiene prioridad.'},
  gym: {code:'sport', hint:'Para entrenar, busca prendas deportivas y zapatillas cerradas.'}
};

const neat = /sastr|blazer|americana|camisa\b|vestid|mocasin|vestir|elegante|cuello polo/;
const sporty = /deportiv|running|entren|fitness|chandal|tecnic|mallas|leggings|jogger/;
const veryCasual = /bermuda|short|chancla|sandalia de playa|chandal|rotos|rasgados/;
const gymShoes = /zapatilla|sneaker|running|deportiv|entren/;

export function dressCode(occasion, selected = 'auto') {
  return occasion === 'gym' ? 'sport' : selected === 'auto' ? (occasions[occasion]?.code || 'casual') : selected;
}

export function fitsDressCode(item, role, text, code) {
  if (code === 'sport') {
    if (role === 'shoes') return gymShoes.test(text) && !/sandalia|chancla|botin|mocasin/.test(text);
    if (role === 'bottom') return sporty.test(text) || /bermuda|short/.test(text) && !/vaquer|jeans|sastr/.test(text);
    return role === 'top' && (sporty.test(text) || /camiseta|sudadera|top/.test(text));
  }
  if (code === 'business') return !veryCasual.test(text) && !sporty.test(text);
  if (code === 'formal') {
    if (role === 'shoes') return /vestir|mocasin|zapato|tacon/.test(text) && !/deportiv|zapatilla|sneaker/.test(text);
    if (role === 'bottom') return /sastr|vestir|traje|falda/.test(text) && !/vaquer|jeans|bermuda/.test(text);
    if (role === 'top') return /camisa\b|blusa/.test(text) && !/camiseta|deportiv/.test(text);
    if (role === 'outer') return /americana|blazer|traje|sastr/.test(text);
    return role === 'onepiece' || role === 'accessory';
  }
  return true;
}

export function occasionScore(text, role, occasion, code) {
  let score = 0;
  if (code === 'smart' || code === 'business' || code === 'formal') {
    if (neat.test(text)) score += 9;
    if (sporty.test(text) || veryCasual.test(text)) score -= 16;
  } else if (code === 'sport') {
    if (sporty.test(text)) score += 10;
  } else if (/casual|vaquer|camiseta|zapatilla|polo/.test(text)) {
    score += 4;
  }
  if (occasion === 'walk' && role === 'shoes' && /comod|zapatilla|sneaker/.test(text)) score += 12;
  if (occasion === 'cinema' && /comod|punto|jersey|sudadera/.test(text)) score += 5;
  if (occasion === 'lunch' && /lino|liger|polo|claro/.test(text)) score += 4;
  if (occasion === 'evening' && /elegante|seda|oscuro|mocasin/.test(text)) score += 5;
  if (occasion === 'theater' && /blazer|americana|sastr|vestir/.test(text)) score += 5;
  return score;
}
