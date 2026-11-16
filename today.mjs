import {fold, propose, prepareLookReferences, roleOf} from './combinations.mjs?v=travel1';
import {garmentPhotoURL} from './garment-photos.mjs?v=travel1';

const timeZone = 'Europe/Madrid';
const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});
const longDate = new Intl.DateTimeFormat('es-ES', {timeZone, weekday:'long', day:'numeric', month:'long'});
const forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=40.35&longitude=-3.83&daily=temperature_2m_min,temperature_2m_max&hourly=apparent_temperature&timezone=Europe%2FMadrid&forecast_days=1';

export const agendaOptions = {
  work: ['Reunión de trabajo', 'work', 'auto'],
  lunch: ['Comida', 'lunch', 'auto'],
  evening: ['Cena', 'evening', 'auto'],
  theater: ['Teatro o concierto', 'theater', 'auto'],
  cinema: ['Cine', 'cinema', 'auto'],
  formal: ['Ceremonia o gala', 'evening', 'formal'],
  smart: ['Evento de hoy', 'evening', 'smart']
};

export function madridDay(now = new Date()) {
  const p = Object.fromEntries(clock.formatToParts(now).map(part => [part.type, part.value]));
  const date = p.year + '-' + p.month + '-' + p.day;
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  return {date, weekend: weekday === 0 || weekday === 6, ready: Number(p.hour)*60+Number(p.minute) >= 510};
}

export function wardrobeMatch(item, view, metadata, now = Date.now()) {
  if (view === 'all') return true;
  const override = metadata['closet_' + view + '_' + item.id];
  if (typeof override === 'boolean') return override;
  const text = fold([item.name, item.category, item.style].join(' '));
  if (view === 'new') {
    const age = now - Date.parse(item.created_at);
    return age >= 0 && age < 90 * 86400000;
  }
  if (view === 'events') return /sastr|americana|blazer|traje|limited edition|fiesta|ceremonia|zapatos? de vestir/.test(text);
  if (view !== 'work' || /deportiv|gym|entren|jogger|bermuda|chandal|sudadera|calzado de verano/.test(text)) return false;
  return /camisa\b|camisas\b|chino|polo\b|polos\b|jersey|americana|blazer|mocasin|sastr|zapatos? de vestir/.test(text) ||
    (roleOf(item) === 'bottom' && !/vaquer|jeans|denim/.test(text));
}

function rngFor(value) {
  let seed=2166136261;
  for (const char of value) seed=Math.imul(seed^char.charCodeAt(0),16777619);
  return () => ((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
}

function weatherMode(a, b) {
  return a <= 12 ? 'cold' : b >= 26 && a >= 17 ? 'warm' : 'mild';
}

async function readForecast(day) {
  const response=await fetch(forecastUrl,{signal:AbortSignal.timeout(9000)});
  if(!response.ok) throw Error('El pronóstico no está disponible.');
  const json=await response.json();
  const index=json.daily?.time?.indexOf(day);
  const low=json.daily?.temperature_2m_min?.[index];
  const high=json.daily?.temperature_2m_max?.[index];
  const atNine=json.hourly?.time?.indexOf(day+'T09:00');
  const morning=json.hourly?.apparent_temperature?.[atNine];
  if(!Number.isFinite(low)||!Number.isFinite(high)) throw Error('Faltan temperaturas.');
  return {low,high,mode:weatherMode(Number.isFinite(morning)?morning:low,high)};
}

export function initToday({client,getCatalog,getReferences,readAgenda,saveAgenda,getMetadata}) {
  const $=id=>document.getElementById(id);
  if (!$('todayPanel')) return {refresh(){},reset(){},wardrobe(){}};
  let generation=0, owner=false, renderedDay='', forecast, liveRequest;
  const bucket=client.storage.from('closet-images');
  const formatTemp=value=>Math.round(value)+'°';
  const select=$('dailyAgenda');

  function card(title, look, fallback) {
    const article=document.createElement('article');
    article.className='today-card';
    const heading=document.createElement('h2');
    heading.textContent=title;
    article.append(heading);
    if(!look) {
      const message=document.createElement('p');message.textContent=fallback;article.append(message);return article;
    }
    const pieces=document.createElement('div');pieces.className='look-pieces';
    for(const item of look.items) {
      const figure=document.createElement('figure');
      const image=document.createElement('img');image.loading='lazy';image.alt='';
      const label=document.createElement('figcaption');label.textContent=item.name||item.category;
      garmentPhotoURL(bucket,item.image_path).then(url=>{image.src=url}).catch(()=>{image.hidden=true;});
      figure.append(image,label);pieces.append(figure);
    }
    article.append(pieces);
    return article;
  }

  function suggestions(day, occasion, mode, code = 'auto') {
    const catalog=[...getCatalog()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const options={occasion,code,weather:mode,references:prepareLookReferences(getReferences())};
    const suggest=items=>propose(items,options,rngFor(day+'|'+occasion+'|'+code)).looks;
    if(occasion!=='work') return suggest(catalog);
    const work=getMetadata();
    const shortlist=catalog.filter(item=>wardrobeMatch(item,'work',work)||['outer','shoes'].includes(roleOf(item)));
    const curated=suggest(shortlist);
    if(curated.length>=2) return curated;
    return [...new Map([...curated,...suggest(catalog)].map(look=>[look.key,look])).values()];
  }

  function draw(info, weather) {
    const heading=info.weekend?'Fin de semana':'Entre semana';
    const mode=weather?.mode||'mild';
    $('todayDate').textContent=longDate.format(new Date());
    $('todayTemperature').textContent=weather?formatTemp(weather.low)+' / '+formatTemp(weather.high):'—';
    $('todayWeather').textContent=weather?'Alcorcón · mín. / máx.':'Alcorcón · pronóstico sin confirmar';
    $('todayPlan').textContent=heading+(info.ready?' · Selección de hoy':' · Vista previa hasta las 8:30')+'.';
    const agenda=readAgenda();
    const plan=agenda?.date===info.date?agenda.plan:null;
    select.value=plan||'none';
    $('todayAgendaStatus').textContent=plan==='none'?'Sin eventos de vestuario registrados para hoy.'
      : agendaOptions[plan]?'Plan de hoy · '+agendaOptions[plan][0]:'Aún no se ha comprobado tu agenda de hoy.';
    const daily=suggestions(info.date,info.weekend?'walk':'work',mode);
    const alternate=daily.length>=2?daily:suggestions(info.date,'daily',mode);
    const ideas=daily.length>=2?daily:[...new Map([...daily,...alternate].map(look=>[look.key,look])).values()];
    const gym=suggestions(info.date,'gym','mild')[0];
    const results=[card(heading+' · Idea 1',ideas[0],'Completa las fichas para que podamos proponer un look.'),
      card(heading+' · Idea 2',ideas[1],'Aún faltan prendas compatibles para una segunda propuesta.'),
      card('Gimnasio',gym,'Añade una parte superior deportiva, un pantalón de entrenamiento y zapatillas cerradas.')];
    if(agendaOptions[plan]) {
      const [label,occasion,code]=agendaOptions[plan];
      const event=suggestions(info.date,occasion,mode,code)[0];
      results.push(card(label,event,'Faltan prendas compatibles con este plan.'));
    }
    $('todayLooks').replaceChildren(...results);
  }

  async function refresh(force = false) {
    owner=true;
    const info=madridDay();
    const run=++generation;
    const key=info.date+':'+info.ready;
    renderedDay=key;
    draw(info,forecast?.key===key?forecast.weather:null);
    if(forecast?.key===key&&!force) return;
    if(liveRequest?.key!==key) {
      const promise=readForecast(info.date).catch(()=>null);
      liveRequest={key,promise};
    }
    const pending=liveRequest;
    const result=await pending.promise;
    if(liveRequest===pending)liveRequest=null;
    if(run!==generation||!owner) return;
    if(result) forecast={key,weather:result};
    draw(info,result);
  }

  function followClock() {
    const info=madridDay();
    if(owner&&(info.date+':'+info.ready)!==renderedDay) refresh();
  }

  setInterval(followClock,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)followClock();});
  $('dailyAgendaForm').onsubmit=async event=>{
    event.preventDefault();
    const button=event.submitter||$('dailyAgendaForm').querySelector('button');
    const plan=select.value;
    if(plan!=='none'&&!agendaOptions[plan])return;
    button.disabled=true;
    try {
      await saveAgenda({date:madridDay().date,plan});
      await refresh(true);
    } catch(error) {
      $('todayAgendaStatus').textContent='No se pudo actualizar la agenda. '+error.message;
    } finally {button.disabled=false;}
  };

  return {
    refresh,
    reset(){owner=false;generation++;forecast=null;renderedDay='';$('todayLooks').replaceChildren();},
    wardrobe(view){
      const node=$('wardrobeIdeas');
      if(view!=='work') {node.replaceChildren();return;}
      const {date}=madridDay();
      const ideas=suggestions(date,'work',forecast?.weather?.mode||'mild');
      node.replaceChildren(...ideas.slice(0,2).map((look,index)=>card('Look de trabajo '+(index+1),look)));
    }
  };
}
