// Recommendations use catalog labels; they do not inspect or alter private images.
export const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const has=(text,pattern)=>pattern.test(text);
export function roleOf(item){
 const category=fold(item.category),text=category+' '+fold(item.name);
 if(has(category,/look|outfit|conjunto completo/))return null;
 if(category==='complementos')return 'accessory';
 if(category==='botas')return 'shoes';
 if(has(text,/calzado|zapato|zapatilla|mocasin|sandalia|alpargata|chancla|botas?\b|botin|sneaker|loafer|shoe/))return 'shoes';
 if(has(text,/abrigo|plumifer|puffer|chaqueta|cazadora|blazer|americana|parka|gabardina|cardigan|chaquet[ao]n|jacket|coat/))return 'outer';
 if(has(text,/vestido|mono\b|jumpsuit|dress/))return 'onepiece';
 if(has(text,/pantalon|vaquero|jeans|bermuda|short|falda|trouser|skirt/))return 'bottom';
 if(has(text,/parte superior|camisa|camiseta|blusa|polo|jersey|sudadera|chaleco|top\b|shirt|sweater|hoodie/))return 'top';
 if(has(text,/accesorio|bolso|cinturon|bufanda|gorra|sombrero|bag\b/))return 'accessory';
 return null;
}
export function palette(item){
 const value=fold([item.color,...(Array.isArray(item.colors)?item.colors:[])].join(' '));
 const colors=[];
 for(const [name,regex] of Object.entries({negro:/negro|black/,blanco:/blanco|white|crudo|marfil/,gris:/gris|grey|gray/,beige:/beige|arena|camel|crema/,marron:/marron|brown|chocolate/,azul:/azul|blue|denim|marino/,verde:/verde|green|oliva/,rojo:/rojo|red|burdeos|granate/,rosa:/rosa|pink/,naranja:/naranja|orange/,amarillo:/amarillo|yellow/,morado:/morado|violeta|purple/}))if(regex.test(value))colors.push(name);
 return colors;
}
const neutrals=new Set(['negro','blanco','gris','beige','marron','azul']);
function details(item){return fold([item.name,item.style,item.description,item.pattern].join(' '))}
export function scoreLook(items,{occasion='daily',weather='mild'}={}){
 let score=40;const colors=[...new Set(items.flatMap(palette))],accents=colors.filter(c=>!neutrals.has(c));
 if(colors.length&&accents.length<=1)score+=12;if(colors.length>4)score-=12;
 const patterns=items.filter(g=>has(fold(g.pattern),/raya|cuadro|floral|estampad|print|lunar/));if(patterns.length<=1)score+=5;else score-=8*(patterns.length-1);
 for(const item of items){const t=details(item);
 if(occasion==='work'&&has(t,/formal|sastr|camisa|mocasin|blazer|americana/))score+=7;
 if(occasion==='work'&&has(t,/deportiv|running|bermuda|chandal/))score-=9;
 if(occasion==='evening'&&has(t,/elegante|vestido|seda|mocasin|blazer/))score+=7;
 if(occasion==='daily'&&has(t,/casual|vaquero|camiseta|zapatilla|polo/))score+=4;
 if(weather==='cold'&&has(t,/lana|abrigo|jersey|bota|acolchado/))score+=7;
 if(weather==='warm'&&has(t,/lino|algodon|liger|sandalia|bermuda/))score+=6;
 }
 const reasons=[];
 if(colors.length&&accents.length===0)reasons.push('Una base de colores fáciles de combinar.');
 else if(accents.length===1)reasons.push('El '+accents[0]+' aporta el toque de color sobre una base neutra.');
 else reasons.push('Una propuesta para probar con las prendas que tienes.');
 if(patterns.length===1)reasons.push('Una sola prenda estampada concentra la atención.');
 if(occasion==='work')reasons.push('Se han priorizado las fichas con detalles de estilo formal.');
 if(occasion==='evening')reasons.push('Se han priorizado los detalles de estilo elegante de tus fichas.');
 if(weather==='cold'&&items.some(g=>roleOf(g)==='outer'))reasons.push('Incluye una capa exterior para el frío.');
 return {score,reasons};
}
export function usable(item,weather){const t=details(item);if(weather==='warm'&&has(t,/plumifer|plumas|acolchad|lana gruesa|termic|abrigo/))return false;if(weather==='cold'&&has(t,/bermuda|short|sandalia|alpargata|chancla|calzado de verano/))return false;return true}
function shuffled(items,rng){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
export function propose(catalog,options={},rng=Math.random){
 const groups={top:[],bottom:[],onepiece:[],shoes:[],outer:[],accessory:[]};
 const unique=new Set();let unclassified=0;
 for(const item of catalog){if(!item.id||!item.image_path)continue;const role=roleOf(item);if(!role){unclassified++;continue}const key=item.image_path;if(unique.has(key))continue;unique.add(key);if(usable(item,options.weather))groups[role].push(item)}
 const anchor=catalog.find(g=>g.id===options.anchorId),anchorRole=anchor&&roleOf(anchor);
 if(anchor&&!anchorRole)return {looks:[],message:'Completa la categoría de la prenda de partida para poder combinarla.',unclassified};
 if(anchor&&!usable(anchor,options.weather))return {looks:[],message:'La prenda de partida no encaja con la temperatura elegida. Cambia la temperatura o la prenda.',unclassified};
 if(anchor){groups[anchorRole]=[anchor]}
 for(const role of Object.keys(groups))groups[role]=shuffled(groups[role],rng);
 const modes=[];if(groups.top.length&&groups.bottom.length&&anchorRole!=='onepiece')modes.push('separates');if(groups.onepiece.length&&!['top','bottom'].includes(anchorRole))modes.push('onepiece');
 if(!modes.length)return {looks:[],message:'Para empezar, añade una parte superior y un pantalón o falda, o un vestido. Revisa las categorías de tus fichas.',unclassified};
 const candidates=new Map();
 const pick=role=>groups[role][Math.floor(rng()*groups[role].length)];
 for(let attempt=0;attempt<300;attempt++){
 const mode=modes[attempt%modes.length];const items=mode==='separates'?[pick('top'),pick('bottom')]:[pick('onepiece')];
 if(groups.shoes.length)items.push(pick('shoes'));
 if(groups.outer.length&&(options.weather==='cold'||anchorRole==='outer'))items.push(pick('outer'));
 if(anchorRole==='accessory')items.push(anchor);
 if(anchor&&!items.some(g=>g.id===anchor.id))continue;
 const key=items.map(g=>g.id).sort().join('|');if(candidates.has(key))continue;
 const warnings=[];if(!items.some(g=>roleOf(g)==='shoes'))warnings.push('Falta añadir calzado a tu armario para completar este look.');
 if(options.weather==='cold'&&!items.some(g=>roleOf(g)==='outer'))warnings.push('Añade una chaqueta o abrigo para el frío.');
 const ranked=scoreLook(items,options);candidates.set(key,{key,items,...ranked,warnings});
 }
 const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score),looks=[];
 // Prefer distinct outfits over small shoe changes when the catalog allows it.
 while(ranked.length&&looks.length<3){let index=ranked.findIndex(candidate=>looks.every(previous=>candidate.items.filter(g=>previous.items.some(p=>p.id===g.id)).length<Math.min(candidate.items.length,previous.items.length)-1));if(index<0)index=0;looks.push(ranked.splice(index,1)[0])}
 return {looks,message:looks.length + (looks.length === 1 ? ' propuesta con tus prendas.' : ' propuestas con tus prendas.'),unclassified};
}
