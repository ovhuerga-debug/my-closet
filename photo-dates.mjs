export const seasonNames = {
  winter: 'Invierno', spring: 'Primavera', summer: 'Verano', fall: 'Otoño',
  undated: 'Sin fecha', generated: 'De Combíname'
};

export function validDate(value) {
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[T\s]|$)/.exec(String(value ?? ''));
  if (!match) return null;
  const iso = match.slice(1).join('-');
  const date = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function seasonFor(value) {
  const date = validDate(value);
  if (!date) return 'undated';
  const month = Number(date.slice(5, 7));
  return ['winter','spring','summer','fall'][Math.floor(month % 12 / 3)];
}

let parser;
export async function captureDate(file) {
  try {
    parser ||= import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs');
    const {parse} = await parser;
    const tags = await parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false
    });
    return validDate(tags?.DateTimeOriginal) || validDate(tags?.CreateDate);
  } catch {
    return null;
  }
}

export function frameValues(frame) {
  function limit(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value)) : fallback;
  }
  return {x: limit(frame?.x, 50, 0, 100), y: limit(frame?.y, 50, 0, 100), zoom: limit(frame?.zoom, 1, 1, 3)};
}
